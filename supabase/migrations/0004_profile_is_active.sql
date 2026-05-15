-- =============================================================
-- 0004_profile_is_active.sql
-- Adiciona soft-delete em profiles para o CRUD de usuários do admin.
--
-- Usuários inativos continuam no banco (preservando FK em períodos,
-- módulos, atestados etc.) mas o backend bloqueia novos logins.
-- =============================================================

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active
    ON public.profiles(is_active);
