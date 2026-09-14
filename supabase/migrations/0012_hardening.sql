-- =============================================================
-- 0012_hardening.sql
-- Endurecimento do banco (análise 2026-09, Fase 1): I-01..I-06.
--
-- Nada aqui muda o comportamento da API: o backend usa service_role
-- (bypassa RLS, e o trigger da I-05 o deixa passar). São travas no
-- banco para caminhos que não passam pela aplicação (PostgREST direto
-- com a anon key, SQL Editor, RPC futura).
--
-- Idempotente: DROP IF EXISTS / CREATE OR REPLACE antes de cada objeto.
-- Pré-condições (se falharem, o ADD aborta a migração inteira; corrija os
-- dados e reaplique):
--   I-01: SELECT id, name FROM public.academic_periods WHERE end_date < start_date;
--   I-04: SELECT email, count(*) FROM public.profiles GROUP BY email HAVING count(*) > 1;
-- =============================================================

-- ---------------------------------------------------------------
-- I-02: profiles legível só pelo dono (ou admin)
-- Antes: USING (true) — qualquer autenticado lia e-mail/username/role de
-- todos com a anon key pública. O frontend só lê a própria linha no login
-- (useAuth.ts); dropdowns de professor/coordenador vêm da API.
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin"  ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (id = auth.uid() OR is_admin());

-- ---------------------------------------------------------------
-- I-01: período não termina antes de começar (NULL continua aceito)
-- ---------------------------------------------------------------

ALTER TABLE public.academic_periods DROP CONSTRAINT IF EXISTS academic_periods_dates_order;
ALTER TABLE public.academic_periods ADD  CONSTRAINT academic_periods_dates_order
    CHECK (end_date >= start_date);

-- ---------------------------------------------------------------
-- I-03: apagar período não leva alunos/módulos (e notas, faltas,
-- atestados) em cascata. A API já recusa excluir período com vínculos
-- (periods.delete_period); agora o banco também recusa.
-- ---------------------------------------------------------------

ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_academic_period_id_fkey;
ALTER TABLE public.students ADD  CONSTRAINT students_academic_period_id_fkey
    FOREIGN KEY (academic_period_id) REFERENCES public.academic_periods(id) ON DELETE RESTRICT;

ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_academic_period_id_fkey;
ALTER TABLE public.modules ADD  CONSTRAINT modules_academic_period_id_fkey
    FOREIGN KEY (academic_period_id) REFERENCES public.academic_periods(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------
-- I-04: e-mail único em profiles (seed.py e diagnose.py já assumem)
-- ---------------------------------------------------------------

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
ALTER TABLE public.profiles ADD  CONSTRAINT profiles_email_key UNIQUE (email);

-- ---------------------------------------------------------------
-- I-05: só admin troca role/is_active (projetado na 0011, linhas 41-43)
-- Hoje o REVOKE da 0011 já impede o UPDATE via PostgREST; o trigger fecha
-- a escalada caso um GRANT de UPDATE volte para alguma feature futura.
-- auth.uid() nulo = service_role (backend) ou SQL Editor: passam.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (NEW.role IS DISTINCT FROM OLD.role
        OR NEW.is_active IS DISTINCT FROM OLD.is_active)
       AND auth.uid() IS NOT NULL
       AND NOT is_admin() THEN
        RAISE EXCEPTION 'Somente administradores alteram o papel ou o status de um usuário.'
            USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_privileges ON public.profiles;
CREATE TRIGGER trg_profiles_protect_privileges
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- ---------------------------------------------------------------
-- I-06: search_path fixo nas funções SECURITY DEFINER da 0001
-- (handle_new_user, 0007 e 0010 já fixavam)
-- ---------------------------------------------------------------

ALTER FUNCTION public.current_user_role()            SET search_path = public, pg_temp;
ALTER FUNCTION public.is_admin()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.is_coordinator_of(UUID)        SET search_path = public, pg_temp;
ALTER FUNCTION public.is_professor_of_module(UUID)   SET search_path = public, pg_temp;

-- ---------------------------------------------------------------
-- Rollback (executar manualmente se necessário):
--   DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
--   CREATE POLICY "profiles_select_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
--   ALTER TABLE public.academic_periods DROP CONSTRAINT IF EXISTS academic_periods_dates_order;
--   ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_academic_period_id_fkey;
--   ALTER TABLE public.students ADD CONSTRAINT students_academic_period_id_fkey FOREIGN KEY (academic_period_id) REFERENCES public.academic_periods(id) ON DELETE CASCADE;
--   ALTER TABLE public.modules DROP CONSTRAINT IF EXISTS modules_academic_period_id_fkey;
--   ALTER TABLE public.modules ADD CONSTRAINT modules_academic_period_id_fkey FOREIGN KEY (academic_period_id) REFERENCES public.academic_periods(id) ON DELETE CASCADE;
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
--   DROP TRIGGER IF EXISTS trg_profiles_protect_privileges ON public.profiles;
--   DROP FUNCTION IF EXISTS public.protect_profile_privileges();
--   ALTER FUNCTION public.current_user_role()          RESET search_path;
--   ALTER FUNCTION public.is_admin()                   RESET search_path;
--   ALTER FUNCTION public.is_coordinator_of(UUID)      RESET search_path;
--   ALTER FUNCTION public.is_professor_of_module(UUID) RESET search_path;
-- ---------------------------------------------------------------
