-- =============================================================
-- 0006_audit_log.sql
-- Log de auditoria de alterações sensíveis (notas, alunos, módulos,
-- períodos). Registros são imutáveis: nenhum UPDATE/DELETE permitido
-- via aplicação. Apenas admin lê o histórico completo; coordenador
-- vê do próprio escopo.
--
-- O backend escreve via service_role (bypassa RLS), denormalizando
-- nome/papel do autor no momento da ação para preservar a evidência
-- mesmo se o usuário for excluído depois.
-- =============================================================

CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete');

CREATE TABLE IF NOT EXISTS public.audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name   TEXT NOT NULL,
    actor_role   user_role NOT NULL,
    action       audit_action NOT NULL,
    entity       TEXT NOT NULL,
    entity_id    TEXT NOT NULL,
    summary      TEXT NOT NULL,
    before_data  JSONB,
    after_data   JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
    ON public.audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
    ON public.audit_log(entity, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_id
    ON public.audit_log(actor_id);

-- ---------------------------------------------------------------
-- Imutabilidade: bloqueia UPDATE e DELETE para qualquer role além
-- do service_role (que bypassa RLS por padrão).
-- ---------------------------------------------------------------

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Leitura: admin vê tudo. Coordenador vê os registros da própria
-- atuação (autor). Para "ver do escopo do período" precisaríamos
-- joinar com a entidade — fica como melhoria futura.
CREATE POLICY "audit_log_select"
    ON public.audit_log FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR actor_id = auth.uid()
    );

-- Nenhuma policy de INSERT/UPDATE/DELETE: usuários autenticados não
-- podem alterar o log direto (apenas service_role).
