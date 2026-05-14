-- =============================================================
-- 0001_initial_schema.sql
-- Schema completo da Aplicação Professor
-- =============================================================

-- ---------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('admin', 'coordinator', 'professor');
CREATE TYPE enrollment_status AS ENUM ('active', 'dropped', 'completed');

-- ---------------------------------------------------------------
-- TABELA: profiles
-- Extensão de auth.users. Criada automaticamente via trigger.
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username    TEXT UNIQUE NOT NULL,
    full_name   TEXT NOT NULL,
    email       TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'professor',
    avatar_url  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- TABELA: academic_periods
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academic_periods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL UNIQUE,
    coordinator_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    start_date      DATE,
    end_date        DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    csv_sync_url    TEXT,
    csv_last_sync   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- TABELA: students
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.students (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_number        TEXT NOT NULL UNIQUE,
    full_name             TEXT NOT NULL,
    email                 TEXT,
    academic_period_id    UUID NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
    enrollment_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    medical_certificates  INTEGER NOT NULL DEFAULT 0,
    referral_info         TEXT,
    observations          TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- TABELA: modules
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.modules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                TEXT NOT NULL,
    code                TEXT NOT NULL,
    professor_id        UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    academic_period_id  UUID NOT NULL REFERENCES public.academic_periods(id) ON DELETE CASCADE,
    credits             INTEGER NOT NULL DEFAULT 4,
    max_absences        INTEGER NOT NULL DEFAULT 10,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (code, academic_period_id)
);

-- ---------------------------------------------------------------
-- TABELA: enrollments
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.enrollments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    module_id        UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    enrollment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
    status           enrollment_status NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, module_id)
);

-- ---------------------------------------------------------------
-- TABELA: grades
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.grades (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id        UUID NOT NULL UNIQUE REFERENCES public.enrollments(id) ON DELETE CASCADE,
    tutor_grade          NUMERIC(4, 2) NOT NULL DEFAULT 0,
    regular_exam_grade   NUMERIC(4, 2) NOT NULL DEFAULT 0,
    makeup_exam_grade    NUMERIC(4, 2) NOT NULL DEFAULT 0,
    final_grade          NUMERIC(4, 2) NOT NULL DEFAULT 0,
    absences             INTEGER NOT NULL DEFAULT 0,
    last_updated         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- ÍNDICES
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_students_student_number     ON public.students(student_number);
CREATE INDEX IF NOT EXISTS idx_students_academic_period_id ON public.students(academic_period_id);
CREATE INDEX IF NOT EXISTS idx_students_is_active          ON public.students(is_active);

CREATE INDEX IF NOT EXISTS idx_modules_professor_id        ON public.modules(professor_id);
CREATE INDEX IF NOT EXISTS idx_modules_academic_period_id  ON public.modules(academic_period_id);
CREATE INDEX IF NOT EXISTS idx_modules_is_active           ON public.modules(is_active);

CREATE INDEX IF NOT EXISTS idx_enrollments_module_id       ON public.enrollments(module_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id      ON public.enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_status          ON public.enrollments(status);

CREATE INDEX IF NOT EXISTS idx_grades_enrollment_id        ON public.grades(enrollment_id);

CREATE INDEX IF NOT EXISTS idx_academic_periods_coordinator_id ON public.academic_periods(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_academic_periods_is_active      ON public.academic_periods(is_active);

-- ---------------------------------------------------------------
-- FUNÇÃO: atualiza updated_at automaticamente
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------
-- FUNÇÃO + TRIGGER: cria profile ao registrar usuário no Auth
-- O role e outros metadados vêm de raw_user_meta_data.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role      user_role;
    v_username  TEXT;
    v_fullname  TEXT;
BEGIN
    -- Lê o role dos metadados; padrão é professor se não informado ou inválido
    BEGIN
        v_role := (NEW.raw_user_meta_data->>'role')::user_role;
    EXCEPTION WHEN invalid_text_representation THEN
        v_role := 'professor';
    END;

    IF v_role IS NULL THEN
        v_role := 'professor';
    END IF;

    v_username := COALESCE(
        NEW.raw_user_meta_data->>'username',
        split_part(NEW.email, '@', 1)
    );

    v_fullname := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
    );

    INSERT INTO public.profiles (id, username, full_name, email, role)
    VALUES (NEW.id, v_username, v_fullname, NEW.email, v_role)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------
-- FUNÇÕES HELPER para RLS
-- Retornam o role do usuário corrente a partir do JWT.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT current_user_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_coordinator_of(p_period_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.academic_periods
        WHERE id = p_period_id
          AND coordinator_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_professor_of_module(p_module_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.modules
        WHERE id = p_module_id
          AND professor_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Habilitada mas com policies permissivas por enquanto.
-- As policies restritivas por papel serão adicionadas no Passo 13.
-- ---------------------------------------------------------------

ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades           ENABLE ROW LEVEL SECURITY;

-- Policies temporárias que permitem acesso total a usuários autenticados
-- (serão substituídas no Passo 13 pelas policies granulares por papel)

CREATE POLICY "temp_authenticated_all_profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "temp_authenticated_all_periods"
    ON public.academic_periods FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "temp_authenticated_all_students"
    ON public.students FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "temp_authenticated_all_modules"
    ON public.modules FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "temp_authenticated_all_enrollments"
    ON public.enrollments FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "temp_authenticated_all_grades"
    ON public.grades FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- O service role do backend bypassa RLS por padrão (comportamento do Supabase).
-- Políticas granulares por papel entram no Passo 13.
