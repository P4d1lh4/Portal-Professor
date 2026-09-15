-- =============================================================
-- Checks de comportamento do schema, rodados pelo job "migrations" do CI
-- depois de aplicar todas as migrações sobre o stub (stub.sql).
--
-- Cada check levanta exceção (e o psql sai com erro) se a trava não
-- segurar. Ao criar uma migração com regra de banco (CHECK, FK, trigger,
-- policy), acrescente o check dela aqui.
-- =============================================================
\set ON_ERROR_STOP 1

-- Fixtures (superusuário). O trigger handle_new_user cria os profiles como
-- professor desde a 0014; o papel vem depois, como na API.
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"username":"admin","full_name":"Admin"}'),
 ('00000000-0000-0000-0000-00000000000c', 'coord@x.com', '{"username":"coord","full_name":"Coord"}'),
 ('00000000-0000-0000-0000-00000000000b', 'prof@x.com',  '{"username":"prof","full_name":"Prof"}');
UPDATE public.profiles SET role = 'admin'       WHERE id = '00000000-0000-0000-0000-00000000000a';
UPDATE public.profiles SET role = 'coordinator' WHERE id = '00000000-0000-0000-0000-00000000000c';
INSERT INTO public.academic_periods (id, name, coordinator_id, start_date, end_date) VALUES
 ('00000000-0000-0000-0000-0000000000f1', '2026.1', '00000000-0000-0000-0000-00000000000c', '2026-02-01', '2026-07-01'),
 ('00000000-0000-0000-0000-0000000000f2', 'vazio',  '00000000-0000-0000-0000-00000000000c', NULL, NULL);
INSERT INTO public.students (student_number, full_name, academic_period_id)
 VALUES ('1', 'Aluno', '00000000-0000-0000-0000-0000000000f1');

-- ---------------------------------------------------------------
-- 0012: I-01, I-03, I-04, I-06 e I-05 sem JWT
-- ---------------------------------------------------------------
DO $$ BEGIN
  BEGIN
    INSERT INTO public.academic_periods (name, coordinator_id, start_date, end_date)
      VALUES ('invertido', '00000000-0000-0000-0000-00000000000c', '2026-07-01', '2026-02-01');
    RAISE EXCEPTION 'I-01 FALHOU: aceitou end_date < start_date';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE 'I-01 ok';
  END;

  BEGIN
    DELETE FROM public.academic_periods WHERE id = '00000000-0000-0000-0000-0000000000f1';
    RAISE EXCEPTION 'I-03 FALHOU: apagou período com aluno';
  -- PG <= 17 levanta foreign_key_violation (23503); PG 18, restrict_violation (23001)
  EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN RAISE NOTICE 'I-03 ok (com vínculo, recusa)';
  END;
  DELETE FROM public.academic_periods WHERE id = '00000000-0000-0000-0000-0000000000f2';
  RAISE NOTICE 'I-03 ok (sem vínculo, apaga)';

  BEGIN
    UPDATE public.profiles SET email = 'admin@x.com' WHERE username = 'prof';
    RAISE EXCEPTION 'I-04 FALHOU: e-mail duplicado aceito';
  EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'I-04 ok';
  END;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND coalesce(array_to_string(p.proconfig, ','), '') NOT LIKE '%search_path%'
  ) THEN RAISE EXCEPTION 'I-06 FALHOU: SECURITY DEFINER sem search_path'; END IF;
  RAISE NOTICE 'I-06 ok';

  -- service_role / SQL Editor (auth.uid() nulo) troca papel normalmente
  UPDATE public.profiles SET role = 'coordinator' WHERE username = 'prof';
  UPDATE public.profiles SET role = 'professor'   WHERE username = 'prof';
  RAISE NOTICE 'I-05 ok (sem JWT, passa)';
END $$;

-- ---------------------------------------------------------------
-- 0011 + 0012: professor autenticado via PostgREST
-- ---------------------------------------------------------------
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
DO $$ BEGIN
  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
    RAISE EXCEPTION '0011 FALHOU: authenticated ainda tem UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE '0011 ok (sem GRANT de escrita)';
  END;
END $$;
ROLLBACK;

-- Com o GRANT de UPDATE restaurado (o cenário que a I-05 cobre)
BEGIN;
GRANT UPDATE ON public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN
    RAISE EXCEPTION 'I-02 FALHOU: professor vê % profiles', (SELECT count(*) FROM public.profiles);
  END IF;
  RAISE NOTICE 'I-02 ok (professor vê só a própria linha)';

  BEGIN
    UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
    RAISE EXCEPTION 'I-05 FALHOU: professor virou admin';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'I-05 ok (role recusado)';
  END;
  BEGIN
    UPDATE public.profiles SET is_active = false WHERE id = auth.uid();
    RAISE EXCEPTION 'I-05 FALHOU: professor mudou is_active';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'I-05 ok (is_active recusado)';
  END;
  UPDATE public.profiles SET full_name = 'Prof 2' WHERE id = auth.uid();
  RAISE NOTICE 'I-05 ok (outros campos passam)';
END $$;
ROLLBACK;

-- Admin autenticado: vê todos e troca papel
BEGIN;
GRANT UPDATE ON public.profiles TO authenticated;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.profiles) <> 3 THEN RAISE EXCEPTION 'I-02 FALHOU: admin não vê todos'; END IF;
  UPDATE public.profiles SET role = 'coordinator' WHERE username = 'prof';
  RAISE NOTICE 'I-02/I-05 ok (admin vê todos e troca papel)';
END $$;
ROLLBACK;

-- ---------------------------------------------------------------
-- 0013: I-08 (last_updated por trigger) e I-09 (schema_migrations)
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_enr    uuid;
  v_before timestamptz;
  v_after  timestamptz;
BEGIN
  INSERT INTO public.modules (id, name, code, professor_id, academic_period_id)
    VALUES ('00000000-0000-0000-0000-0000000000d1', 'Mod', 'M1',
            '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f1');
  INSERT INTO public.enrollments (student_id, module_id)
    SELECT id, '00000000-0000-0000-0000-0000000000d1' FROM public.students WHERE student_number = '1'
    RETURNING id INTO v_enr;
  -- Nota com last_updated de ontem: o UPDATE precisa trazê-lo para agora.
  INSERT INTO public.grades (enrollment_id, last_updated) VALUES (v_enr, now() - interval '1 day');
  SELECT last_updated INTO v_before FROM public.grades WHERE enrollment_id = v_enr;
  UPDATE public.grades SET tutor_grade = 5 WHERE enrollment_id = v_enr;
  SELECT last_updated INTO v_after FROM public.grades WHERE enrollment_id = v_enr;
  IF v_after <= v_before THEN RAISE EXCEPTION 'I-08 FALHOU: last_updated não mudou no UPDATE'; END IF;
  RAISE NOTICE 'I-08 ok';

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.schema_migrations'::regclass) THEN
    RAISE EXCEPTION 'I-09 FALHOU: schema_migrations sem RLS';
  END IF;
  RAISE NOTICE 'I-09 ok';
END $$;

-- ---------------------------------------------------------------
-- Exclusão de período (registro 68): a ordem do app
-- (periods._delete_period_contents: alunos, módulos, período) passa pelos
-- triggers da 0003, 0005 e 0013 sem deixar vínculo; outro período fica.
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_enr  uuid;
  v_rec  uuid;
  v_cert uuid;
BEGIN
  -- f1 já tem o aluno '1', o módulo d1, a matrícula e a nota (blocos acima)
  SELECT id INTO v_enr FROM public.enrollments WHERE module_id = '00000000-0000-0000-0000-0000000000d1';
  INSERT INTO public.attendance_records (module_id, attendance_date)
    VALUES ('00000000-0000-0000-0000-0000000000d1', '2026-03-02') RETURNING id INTO v_rec;
  INSERT INTO public.attendance_entries (attendance_record_id, enrollment_id, status)
    VALUES (v_rec, v_enr, 'absent');
  INSERT INTO public.medical_certificates (student_id, reason, start_date, end_date)
    SELECT id, 'gripe', '2026-03-02', '2026-03-03' FROM public.students WHERE student_number = '1'
    RETURNING id INTO v_cert;
  INSERT INTO public.medical_certificate_attachments (certificate_id, file_name, file_size, storage_path)
    VALUES (v_cert, 'a.pdf', 10, 'x/a.pdf');

  INSERT INTO public.academic_periods (id, name, coordinator_id)
    VALUES ('00000000-0000-0000-0000-0000000000f3', '2026.2', '00000000-0000-0000-0000-00000000000c');
  INSERT INTO public.students (student_number, full_name, academic_period_id)
    VALUES ('2', 'Outro', '00000000-0000-0000-0000-0000000000f3');

  DELETE FROM public.students WHERE academic_period_id = '00000000-0000-0000-0000-0000000000f1';
  DELETE FROM public.modules  WHERE academic_period_id = '00000000-0000-0000-0000-0000000000f1';
  DELETE FROM public.academic_periods WHERE id = '00000000-0000-0000-0000-0000000000f1';

  IF EXISTS (SELECT 1 FROM public.enrollments) OR EXISTS (SELECT 1 FROM public.grades)
     OR EXISTS (SELECT 1 FROM public.attendance_records) OR EXISTS (SELECT 1 FROM public.attendance_entries)
     OR EXISTS (SELECT 1 FROM public.medical_certificates)
     OR EXISTS (SELECT 1 FROM public.medical_certificate_attachments) THEN
    RAISE EXCEPTION 'Exclusão de período FALHOU: sobrou vínculo do período apagado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE student_number = '2') THEN
    RAISE EXCEPTION 'Exclusão de período FALHOU: apagou aluno de outro período';
  END IF;
  RAISE NOTICE 'Exclusão de período ok';
END $$;

-- ---------------------------------------------------------------
-- 0014: convites e papel fora do metadata (registro 69)
-- ---------------------------------------------------------------
BEGIN;
DO $$ BEGIN
  -- O signUp público grava em raw_user_meta_data o que o cliente manda.
  INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
   ('00000000-0000-0000-0000-0000000000e1', 'intruso@x.com', '{"role":"admin","username":"intruso","full_name":"X"}');
  IF (SELECT role FROM public.profiles WHERE id = '00000000-0000-0000-0000-0000000000e1') <> 'professor' THEN
    RAISE EXCEPTION '0014 FALHOU: o metadata de quem se cadastra definiu o papel';
  END IF;
  RAISE NOTICE '0014 ok (metadata não define o papel)';

  BEGIN
    INSERT INTO public.invite_codes (code_hash, role, created_by, expires_at)
      VALUES ('h-admin', 'admin', '00000000-0000-0000-0000-00000000000a', now() + interval '7 days');
    RAISE EXCEPTION '0014 FALHOU: aceitou convite para admin';
  EXCEPTION WHEN check_violation THEN RAISE NOTICE '0014 ok (convite para admin recusado)';
  END;

  INSERT INTO public.invite_codes (code_hash, role, created_by, expires_at)
    VALUES ('h-prof', 'professor', '00000000-0000-0000-0000-00000000000c', now() + interval '7 days');
END $$;
-- A anon key tem o GRANT SELECT padrão do Supabase; a RLS sem policy não mostra nada.
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.invite_codes) <> 0 THEN
    RAISE EXCEPTION '0014 FALHOU: a anon key lê invite_codes';
  END IF;
  RAISE NOTICE '0014 ok (anon não lê convites)';
END $$;
ROLLBACK;
