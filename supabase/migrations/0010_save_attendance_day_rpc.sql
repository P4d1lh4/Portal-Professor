-- =============================================================
-- 0010_save_attendance_day_rpc.sql
-- Salvamento ATÔMICO da chamada do dia (upsert do record + replace
-- das entries) numa única transação.
--
-- Antes, o backend fazia update/insert + delete + insert em passos
-- separados via PostgREST: uma falha entre o DELETE e o INSERT das
-- entries deixava a chamada do dia VAZIA (perda de dados).
--
-- Segue o padrão da 0007 (create_student_with_enrollments):
-- SECURITY DEFINER + REVOKE, executável apenas pelo service_role.
-- O trigger de sincronização de grades.absences (0005) dispara
-- normalmente dentro da transação.
--
-- Ordem de deploy: aplicar esta migration ANTES do backend que a chama.
-- =============================================================

CREATE OR REPLACE FUNCTION public.save_attendance_day(
    p_module_id        UUID,
    p_attendance_date  DATE,
    p_notes            TEXT,
    p_created_by       UUID,
    p_entries          JSONB   -- [{"enrollment_id": "...", "status": "...", "notes": "..."}]
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_record_id UUID;
BEGIN
    -- Upsert do record do dia (UNIQUE (module_id, attendance_date)).
    -- No update, preserva created_by original (como o backend fazia).
    INSERT INTO public.attendance_records (module_id, attendance_date, notes, created_by)
    VALUES (p_module_id, p_attendance_date, p_notes, p_created_by)
    ON CONFLICT (module_id, attendance_date)
    DO UPDATE SET notes = EXCLUDED.notes
    RETURNING id INTO v_record_id;

    -- Replace das entries (o trigger de 0005 recalcula grades.absences).
    DELETE FROM public.attendance_entries
    WHERE attendance_record_id = v_record_id;

    INSERT INTO public.attendance_entries (attendance_record_id, enrollment_id, status, notes)
    SELECT v_record_id,
           (e->>'enrollment_id')::UUID,
           COALESCE((e->>'status')::attendance_status, 'present'),
           e->>'notes'
    FROM jsonb_array_elements(COALESCE(p_entries, '[]'::JSONB)) AS e;

    RETURN v_record_id;
END;
$$;

-- Apenas o service_role (backend) pode executar.
REVOKE ALL ON FUNCTION public.save_attendance_day(UUID, DATE, TEXT, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- Rollback (manual, se necessário):
--   DROP FUNCTION IF EXISTS public.save_attendance_day(UUID, DATE, TEXT, UUID, JSONB);
-- ---------------------------------------------------------------
