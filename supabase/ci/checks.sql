-- =============================================================
-- Checks de comportamento do schema, rodados pelo job "migrations" do CI
-- depois de aplicar todas as migrações sobre o stub (stub.sql).
--
-- Cada check levanta exceção (e o psql sai com erro) se a trava não
-- segurar. Ao criar uma migração com regra de banco (CHECK, FK, trigger,
-- policy), acrescente o check dela aqui.
-- =============================================================
\set ON_ERROR_STOP 1

-- Fixtures (superusuário; o trigger handle_new_user cria os profiles)
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"role":"admin","username":"admin","full_name":"Admin"}'),
 ('00000000-0000-0000-0000-00000000000c', 'coord@x.com', '{"role":"coordinator","username":"coord","full_name":"Coord"}'),
 ('00000000-0000-0000-0000-00000000000b', 'prof@x.com',  '{"role":"professor","username":"prof","full_name":"Prof"}');
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
