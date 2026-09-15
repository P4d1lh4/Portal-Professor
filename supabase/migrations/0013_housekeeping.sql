-- =============================================================
-- 0013_housekeeping.sql — manutenção do schema (I-08, I-09)
--
-- Idempotente. Como a 0012, fica pendente em produção até o restore do
-- Supabase: aplicar com `python backend/scripts/apply_migration.py --all`.
--
-- I-09: `schema_migrations` passa a existir como migração versionada. Antes
--   só o apply_migration.py a criava, e quem aplicava pelo SQL Editor (como o
--   README orienta) ficava sem ela e sem `--status`/`--mark-applied`. O DDL é
--   o mesmo do script, que roda o CREATE antes e torna este um no-op.
-- I-08: `grades.last_updated` por trigger, como o `updated_at` das outras
--   tabelas. Antes cada caminho de escrita tinha de lembrar de setar à mão
--   (PUT de nota, sync de planilha, trigger de faltas da 0005).
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_grades_last_updated ON public.grades;
--   DROP FUNCTION IF EXISTS public.set_last_updated();
--   (schema_migrations fica: o apply_migration.py depende dela)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version     TEXT PRIMARY KEY,
    file_name   TEXT NOT NULL,
    checksum    TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Metadado de deploy, sem uso pela API: RLS ligada e nenhuma policy, então
-- anon/authenticated não leem nem escrevem. O script conecta como dono da
-- tabela, que não passa por RLS.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_last_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grades_last_updated ON public.grades;
CREATE TRIGGER trg_grades_last_updated
    BEFORE UPDATE ON public.grades
    FOR EACH ROW EXECUTE FUNCTION public.set_last_updated();
