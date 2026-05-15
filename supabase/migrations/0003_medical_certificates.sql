-- =============================================================
-- 0003_medical_certificates.sql
-- Atestados médicos individuais por aluno + anexos em PDF.
--
-- Substitui o uso histórico de students.medical_certificates (INT
-- contador), mantido apenas para compatibilidade — passa a ser
-- atualizado por trigger conforme a contagem real de atestados.
-- =============================================================

-- ---------------------------------------------------------------
-- TABELA: medical_certificates
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medical_certificates (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    reason       TEXT NOT NULL,
    start_date   DATE NOT NULL,
    end_date     DATE NOT NULL,
    notes        TEXT,
    created_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT medical_certificates_dates_ck CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_medical_certificates_student_id
    ON public.medical_certificates(student_id);

CREATE INDEX IF NOT EXISTS idx_medical_certificates_start_date
    ON public.medical_certificates(start_date);

CREATE TRIGGER trg_medical_certificates_updated_at
    BEFORE UPDATE ON public.medical_certificates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------
-- TABELA: medical_certificate_attachments
-- Cada anexo é um PDF no Supabase Storage (bucket privado).
-- storage_path é a chave do objeto no bucket — file_url é montado
-- pelo backend como signed URL no momento da resposta.
-- ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.medical_certificate_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_id  UUID NOT NULL REFERENCES public.medical_certificates(id) ON DELETE CASCADE,
    file_name       TEXT NOT NULL,
    file_size       BIGINT NOT NULL,
    mime_type       TEXT NOT NULL DEFAULT 'application/pdf',
    storage_path    TEXT NOT NULL UNIQUE,
    uploaded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT medical_certificate_attachments_mime_ck
        CHECK (mime_type = 'application/pdf'),
    CONSTRAINT medical_certificate_attachments_size_ck
        CHECK (file_size > 0 AND file_size <= 10 * 1024 * 1024)
);

CREATE INDEX IF NOT EXISTS idx_medical_certificate_attachments_certificate_id
    ON public.medical_certificate_attachments(certificate_id);

-- ---------------------------------------------------------------
-- Sincroniza o contador legado students.medical_certificates
-- com o total real de atestados (mantém telas antigas funcionando).
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_student_medical_certificates_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_student_id UUID;
BEGIN
    v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    UPDATE public.students
       SET medical_certificates = (
           SELECT COUNT(*)::int
             FROM public.medical_certificates
            WHERE student_id = v_student_id
       )
     WHERE id = v_student_id;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_medical_certificates_sync_count
    AFTER INSERT OR DELETE ON public.medical_certificates
    FOR EACH ROW EXECUTE FUNCTION public.sync_student_medical_certificates_count();

-- ---------------------------------------------------------------
-- ROW LEVEL SECURITY
-- O service_role do backend bypassa RLS; as policies abaixo cobrem
-- acessos diretos do frontend (caso futuramente sejam usados).
-- ---------------------------------------------------------------

ALTER TABLE public.medical_certificates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_certificate_attachments   ENABLE ROW LEVEL SECURITY;

-- medical_certificates: quem vê o aluno, vê seus atestados
CREATE POLICY "medical_certificates_select"
    ON public.medical_certificates FOR SELECT
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.academic_periods ap ON ap.id = s.academic_period_id
            WHERE s.id = medical_certificates.student_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.student_id = medical_certificates.student_id
              AND m.professor_id = auth.uid()
        )
    );

CREATE POLICY "medical_certificates_modify"
    ON public.medical_certificates FOR ALL
    TO authenticated
    USING (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.academic_periods ap ON ap.id = s.academic_period_id
            WHERE s.id = medical_certificates.student_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.student_id = medical_certificates.student_id
              AND m.professor_id = auth.uid()
        )
    )
    WITH CHECK (
        is_admin()
        OR EXISTS (
            SELECT 1 FROM public.students s
            JOIN public.academic_periods ap ON ap.id = s.academic_period_id
            WHERE s.id = medical_certificates.student_id
              AND ap.coordinator_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.enrollments e
            JOIN public.modules m ON m.id = e.module_id
            WHERE e.student_id = medical_certificates.student_id
              AND m.professor_id = auth.uid()
        )
    );

-- Anexos: herdam permissões do atestado pai
CREATE POLICY "medical_certificate_attachments_select"
    ON public.medical_certificate_attachments FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.medical_certificates mc
            WHERE mc.id = certificate_id
        )
    );

CREATE POLICY "medical_certificate_attachments_modify"
    ON public.medical_certificate_attachments FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.medical_certificates mc
            WHERE mc.id = certificate_id
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.medical_certificates mc
            WHERE mc.id = certificate_id
        )
    );

-- ---------------------------------------------------------------
-- STORAGE BUCKET: medical-certificates (privado)
-- O upload e a geração de signed URL acontecem via service_role
-- no backend, então não definimos policies de storage públicas.
-- ---------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'medical-certificates',
    'medical-certificates',
    false,
    10 * 1024 * 1024,
    ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE
   SET file_size_limit    = EXCLUDED.file_size_limit,
       allowed_mime_types = EXCLUDED.allowed_mime_types,
       public             = EXCLUDED.public;
