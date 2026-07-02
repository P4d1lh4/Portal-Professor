-- =============================================================
-- 0009_search_indexes.sql
-- Índices para as buscas ilike '%termo%' e ORDER BY de texto.
-- Um ilike com curinga à esquerda ('%x%') NÃO usa b-tree — precisa de
-- índice trigram (GIN + pg_trgm). Sem isso, cada busca faz sequential
-- scan da tabela, degradando conforme alunos/usuários crescem.
--
-- Idempotente (IF NOT EXISTS). CREATE INDEX bloqueia escritas na tabela;
-- em produção com dados, considerar CREATE INDEX CONCURRENTLY (fora de
-- transação). Aqui, base pequena → índice normal é rápido.
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------
-- Trigram GIN para os ilike '%termo%'
-- (students.student_number e profiles.username já têm b-tree por serem
--  UNIQUE, mas b-tree não serve para o ilike — daí o trigram também.)
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_students_full_name_trgm
    ON public.students USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_students_student_number_trgm
    ON public.students USING gin (student_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm
    ON public.profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm
    ON public.profiles USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
    ON public.profiles USING gin (username gin_trgm_ops);

-- ---------------------------------------------------------------
-- b-tree para ORDER BY de texto e filtro por role
-- (academic_periods.name já é UNIQUE → tem índice; não repetir.)
-- ---------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_students_full_name ON public.students (full_name);
CREATE INDEX IF NOT EXISTS idx_profiles_full_name ON public.profiles (full_name);
CREATE INDEX IF NOT EXISTS idx_modules_name       ON public.modules (name);
CREATE INDEX IF NOT EXISTS idx_profiles_role      ON public.profiles (role);

-- ---------------------------------------------------------------
-- Rollback (manual, se necessário):
--   DROP INDEX IF EXISTS idx_students_full_name_trgm, idx_students_student_number_trgm,
--     idx_profiles_full_name_trgm, idx_profiles_email_trgm, idx_profiles_username_trgm,
--     idx_students_full_name, idx_profiles_full_name, idx_modules_name, idx_profiles_role;
--   -- DROP EXTENSION pg_trgm;  -- só se nenhum outro objeto depender
-- ---------------------------------------------------------------
