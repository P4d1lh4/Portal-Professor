-- =============================================================
-- 0005_attendance_records.sql
-- Sistema de chamada (frequência) por aula.
--
-- Cada chamada (attendance_records) representa um dia letivo de
-- um módulo. As entradas (attendance_entries) registram o status
-- de cada aluno matriculado naquele dia.
--
-- Um trigger mantém `grades.absences` sincronizado com o total
-- de faltas não-justificadas de cada matrícula, preservando o
-- comportamento atual da tela de notas.
-- =============================================================

CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'justified');

-- ---------------------------------------------------------------
-- TABELA: attendance_records  (uma chamada por módulo por dia)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attendance_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id         UUID NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
    attendance_date   DATE NOT NULL,
    notes             TEXT,
    created_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (module_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_module_id
    ON public.attendance_records(module_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_attendance_date
    ON public.attendance_records(attendance_date);

CREATE TRIGGER trg_attendance_records_updated_at
    BEFORE UPDATE ON public.attendance_records
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------
-- TABELA: attendance_entries  (status por aluno em uma chamada)
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attendance_entries (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id   UUID NOT NULL REFERENCES public.attendance_records(id) ON DELETE CASCADE,
    enrollment_id          UUID NOT NULL REFERENCES public.enrollments(id) ON DELETE CASCADE,
    status                 attendance_status NOT NULL DEFAULT 'present',
    notes                  TEXT,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (attendance_record_id, enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_entries_record_id
    ON public.attendance_entries(attendance_record_id);

CREATE INDEX IF NOT EXISTS idx_attendance_entries_enrollment_id
    ON public.attendance_entries(enrollment_id);

CREATE INDEX IF NOT EXISTS idx_attendance_entries_status
    ON public.attendance_entries(status);

CREATE TRIGGER trg_attendance_entries_updated_at
    BEFORE UPDATE ON public.attendance_entries
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------
-- TRIGGER: recalcula grades.absences baseado nas entries
-- Toda mudança em attendance_entries (insert/update/delete)
-- recomputa o total de faltas (status='absent') da matrícula.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_enrollment_absences()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_enrollment_id UUID;
    v_total         INT;
BEGIN
    v_enrollment_id := COALESCE(NEW.enrollment_id, OLD.enrollment_id);

    SELECT COUNT(*)::int INTO v_total
      FROM public.attendance_entries
     WHERE enrollment_id = v_enrollment_id
       AND status = 'absent';

    UPDATE public.grades
       SET absences     = v_total,
           last_updated = NOW()
     WHERE enrollment_id = v_enrollment_id;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_attendance_entries_sync_absences
    AFTER INSERT OR UPDATE OR DELETE ON public.attendance_entries
    FOR EACH ROW EXECUTE FUNCTION public.sync_enrollment_absences();

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- Service_role do backend bypassa; policies abaixo cobrem acesso
-- direto via anon key (espelha lógica de modules/enrollments).
-- ---------------------------------------------------------------

ALTER TABLE public.attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_entries  ENABLE ROW LEVEL SECURITY;

-- attendance_records: admin vê tudo; coordenador vê dos seus períodos;
-- professor vê dos seus módulos.
CREATE POLICY "attendance_records_select"
    ON public.attendance_records FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.academic_periods ap ON ap.id = m.academic_period_id
            WHERE m.id = attendance_records.module_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.modules m
            WHERE m.id = attendance_records.module_id
              AND m.professor_id = auth.uid()
        )
    );

CREATE POLICY "attendance_records_modify"
    ON public.attendance_records FOR ALL
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.academic_periods ap ON ap.id = m.academic_period_id
            WHERE m.id = attendance_records.module_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.modules m
            WHERE m.id = attendance_records.module_id
              AND m.professor_id = auth.uid()
        )
    )
    WITH CHECK (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.modules m
            JOIN public.academic_periods ap ON ap.id = m.academic_period_id
            WHERE m.id = attendance_records.module_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.modules m
            WHERE m.id = attendance_records.module_id
              AND m.professor_id = auth.uid()
        )
    );

-- attendance_entries: herdam permissões do attendance_record pai
CREATE POLICY "attendance_entries_select"
    ON public.attendance_entries FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.attendance_records ar
            WHERE ar.id = attendance_record_id
        )
    );

CREATE POLICY "attendance_entries_modify"
    ON public.attendance_entries FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.attendance_records ar
            WHERE ar.id = attendance_record_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.attendance_records ar
            WHERE ar.id = attendance_record_id
        )
    );
