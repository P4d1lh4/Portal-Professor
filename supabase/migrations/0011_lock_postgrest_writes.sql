-- 0011_lock_postgrest_writes.sql
-- ---------------------------------------------------------------
-- Fecha a escalada de privilégio via PostgREST direto (auditoria: C1/C1-b/A5).
--
-- Contexto: a API usa exclusivamente o service role (bypassa RLS) e o frontend
-- só usa o Supabase para AUTH e para ler o próprio profile no login
-- (frontend/src/hooks/useAuth.ts:98, um SELECT). Nenhuma escrita do cliente
-- passa pelo PostgREST. Porém os roles `anon`/`authenticated` ainda tinham
-- GRANT de escrita nas tabelas, gated APENAS por RLS — e a policy
-- profiles_update_own_or_admin (0002) permite UPDATE da própria linha sem
-- restringir colunas. Resultado: qualquer usuário autenticado podia, com a
-- anon key pública, executar
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', <seu_id>)
-- direto no PostgREST e virar admin (a API confia em profiles.role em
-- deps.get_current_user). O mesmo caminho permitia inserir alunos e editar
-- notas de período encerrado fora das regras da aplicação.
--
-- Correção de raiz: revogar INSERT/UPDATE/DELETE de anon/authenticated em todo
-- o schema public. O RLS permanece como defesa em profundidade. O SELECT é
-- mantido para não quebrar a leitura do profile no login. O service_role NÃO é
-- afetado (é quem o backend usa; tem acesso total).
-- ---------------------------------------------------------------

REVOKE INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    FROM anon, authenticated;

-- Tabelas criadas depois desta migração (pelo mesmo role) também nascem sem
-- escrita para anon/authenticated.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE INSERT, UPDATE, DELETE ON TABLES
    FROM anon, authenticated;

-- ---------------------------------------------------------------
-- Rollback manual (só se, no futuro, o cliente precisar escrever via PostgREST
-- com RLS — hoje ele não usa):
--   GRANT INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT INSERT, UPDATE, DELETE ON TABLES TO authenticated;
--
-- Defesa em profundidade adicional recomendada (aplicar em ambiente com banco
-- real para validar): trigger BEFORE UPDATE em profiles que rejeite alteração
-- de `role`/`is_active` quando auth.uid() = id e o autor não for admin.
-- ---------------------------------------------------------------
