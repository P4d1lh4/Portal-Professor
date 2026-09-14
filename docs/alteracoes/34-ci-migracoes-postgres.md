# 34 — CI aplica as migrações num Postgres (I-15)

## Problema identificado

**I-15** (análise 2026-09, Fase 2): nenhuma migração era executada no CI. Um erro de SQL, uma dependência fora de ordem ou uma trava que não segura (CHECK, FK, policy, trigger) só apareciam ao aplicar no Supabase de produção, que é hoje o único banco.

## Objetivo

Todo PR aplica `0001 → última` num Postgres limpo, com o mesmo script usado em produção, e verifica que as regras de banco seguram.

## Arquivos alterados

- `.github/workflows/ci.yml` (job novo `migrations`)
- `supabase/ci/stub.sql` (novo)
- `supabase/ci/checks.sql` (novo)

## Alterações realizadas

- **Job `migrations`:** um serviço `postgres:17` (a versão dos projetos Supabase novos) e três passos. Primeiro o `stub.sql`, depois `python backend/scripts/apply_migration.py --all` e por fim o `checks.sql`, com `psql -v ON_ERROR_STOP=1`. Qualquer falha de SQL ou check quebrado derruba o job.
- **`stub.sql`:** o mínimo que o Supabase provê e as migrações usam. São os roles `anon`/`authenticated`/`service_role`, `auth.users`, `auth.uid()` (lê o GUC `request.jwt.claim.sub`) e `storage.buckets` (a 0003 cria o bucket de atestados). Inclui também os privilégios padrão de `public`, que a 0011 revoga.
- **`checks.sql`:** fixtures e as travas da 0012 (I-01 a I-06), mais um check da 0011, que `authenticated` não tem mais escrita. Os cenários de PostgREST rodam como `authenticated`, com o `sub` do professor ou do admin. Os comentários do cabeçalho dizem para acrescentar ali o check de cada migração com regra de banco.

## Motivo técnico

Usar o `apply_migration.py`, e não um `psql -f` em loop, testa também o script que aplica em produção: ordem, tracking em `schema_migrations` e o `0002_seed_instructions` (arquivo só de comentários). O stub fica em arquivo versionado para que uma migração que use um objeto novo do Supabase falhe no CI, e quem a escreveu acrescente o stub junto.

## Impactos positivos

- Migração quebrada é barrada no PR, não no Supabase.
- As travas da 0012 ficam protegidas contra regressão: uma migração futura que desfaça a policy de `profiles` ou a FK `RESTRICT` quebra o CI.
- Desbloqueia o fluxo "migração vai primeiro para staging" (I-23): o CI já garante que ela aplica.

## Testes executados

A sequência exata do job, num Postgres 18 local descartável: cluster novo, `stub.sql`, `apply_migration.py --all` e `checks.sql`. O `ci.yml` foi validado com PyYAML.

## Resultado dos testes

✅ **Passou**: 0001 a 0012 aplicadas pelo script (exit 0; `--status` mostra todas OK); 12/12 checks ok. A confirmação final é o próprio job no PR.

## Observações

- O stub **não é o Supabase**: o `auth.uid()` real lê `request.jwt.claims`, e extensões ou schemas do Supabase que as migrações não usam não existem aqui. O que o CI prova é que o SQL aplica e as regras seguram, não que o Supabase se comporta igual. Isso fica para o staging (I-23).
- Idempotência não é testada: a 0001 não é idempotente (`CREATE TYPE`), e o `apply_migration.py` pula o que já está aplicado.
- O `psql` vem da imagem do runner `ubuntu-latest`.
