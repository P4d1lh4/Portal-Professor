-- =============================================================
-- 0014_invite_codes.sql — cadastro por código de convite (registro 69)
--
-- Idempotente. Aplicar com `python backend/scripts/apply_migration.py --all`.
--
-- 1. invite_codes: código aleatório de uso único. O admin gera para
--    coordenador ou professor; o coordenador, para professor. A API
--    (routers/users.py) confere, consome e cria a conta pela Admin API do
--    Auth, com o papel do convite. O banco guarda só o sha256 do código.
-- 2. handle_new_user deixa de ler o papel de raw_user_meta_data, que é de quem
--    se cadastra: com o signup público do Auth ligado, um
--    `signUp({ options: { data: { role: "admin" } } })` com a anon key criava
--    um profile de admin. Agora todo profile nasce professor, e quem cria a
--    conta pela Admin API grava o papel logo depois (users._create_account e
--    seed.upsert_profile).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.invite_codes;
--   handle_new_user: reaplicar o CREATE OR REPLACE da 0001.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.invite_codes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_hash   TEXT NOT NULL UNIQUE,
    -- Convite nunca cria admin, nem com um bug na API.
    role        user_role NOT NULL CHECK (role IN ('coordinator', 'professor')),
    created_by  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    used_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sem policy: sem ela, o GRANT SELECT padrão do Supabase deixaria a anon key
-- ler a tabela (a 0011 só revogou escrita). A API usa a service_role.
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, username, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'professor'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;
