-- =============================================================
-- 0007_create_student_with_enrollments.sql
-- Função transacional: cria um aluno e o matricula numa lista de
-- módulos (com a respectiva linha de grades) de forma atômica.
--
-- Motivação: supabase-py não oferece transação no cliente, então a
-- sequência criar aluno → matricular → criar notas podia falhar no meio
-- e deixar dados órfãos. Encapsular tudo numa função plpgsql garante que
-- ou tudo é gravado, ou nada é (a função roda numa única transação).
-- =============================================================

CREATE OR REPLACE FUNCTION public.create_student_with_enrollments(
    p_student   JSONB,
    p_module_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id    UUID;
    v_module_id     UUID;
    v_enrollment_id UUID;
BEGIN
    INSERT INTO public.students (
        student_number, full_name, email, academic_period_id,
        enrollment_date, medical_certificates, referral_info,
        observations, is_active
    )
    VALUES (
        p_student->>'student_number',
        p_student->>'full_name',
        NULLIF(p_student->>'email', ''),
        (p_student->>'academic_period_id')::UUID,
        COALESCE((p_student->>'enrollment_date')::DATE, CURRENT_DATE),
        COALESCE((p_student->>'medical_certificates')::INT, 0),
        p_student->>'referral_info',
        p_student->>'observations',
        COALESCE((p_student->>'is_active')::BOOLEAN, TRUE)
    )
    RETURNING id INTO v_student_id;

    FOREACH v_module_id IN ARRAY COALESCE(p_module_ids, ARRAY[]::UUID[])
    LOOP
        INSERT INTO public.enrollments (student_id, module_id, status)
        VALUES (v_student_id, v_module_id, 'active')
        ON CONFLICT (student_id, module_id) DO NOTHING
        RETURNING id INTO v_enrollment_id;

        IF v_enrollment_id IS NOT NULL THEN
            INSERT INTO public.grades (enrollment_id) VALUES (v_enrollment_id);
        END IF;
    END LOOP;

    RETURN v_student_id;
END;
$$;

-- A função é chamada apenas pelo backend (service role). Garante que o
-- papel anônimo/autenticado não consiga executá-la diretamente via PostgREST.
REVOKE ALL ON FUNCTION public.create_student_with_enrollments(JSONB, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_student_with_enrollments(JSONB, UUID[]) FROM anon, authenticated;
