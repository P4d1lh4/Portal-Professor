-- =============================================================
-- Stub mínimo do que o Supabase provê antes das migrações, para aplicá-las
-- num Postgres puro (job "migrations" do CI).
--
-- Não é o Supabase: o auth.uid() real lê request.jwt.claims; aqui basta um
-- GUC com o `sub`. Ao usar um objeto novo do Supabase numa migração
-- (outro schema, extensão, role), acrescente o stub aqui.
-- =============================================================

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               TEXT,
    raw_user_meta_data  JSONB
);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- 0003 cria o bucket de atestados
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
    id                  TEXT PRIMARY KEY,
    name                TEXT,
    public              BOOLEAN,
    file_size_limit     BIGINT,
    allowed_mime_types  TEXT[]
);

-- Como no Supabase: anon/authenticated nascem com tudo em public
-- (é o que a 0011 revoga).
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
