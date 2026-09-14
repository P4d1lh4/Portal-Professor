# 33 — Migração 0012 (hardening do banco): I-01..I-06, I-13

## Problema identificado

Achados de banco da Fase 1 da análise de 2026-09 (`docs/analise-2026-09/03-banco-infra-devops.md`):

- **I-01:** `academic_periods` aceitava `end_date < start_date`.
- **I-02:** `profiles_select_authenticated USING (true)`: qualquer autenticado lia e-mail, username e papel de todos os usuários com a anon key pública.
- **I-03:** apagar um período cascateava alunos, módulos, matrículas, notas, faltas e atestados. O bloqueio existia só na API.
- **I-04:** `profiles.email` sem `UNIQUE`, embora `seed.py` e `diagnose.py` assumam unicidade.
- **I-05:** o trigger contra troca de `role`/`is_active` foi projetado no comentário da `0011`, mas nunca criado. Só o `REVOKE` protegia.
- **I-06:** as 4 funções `SECURITY DEFINER` da `0001` não fixavam `search_path`.
- **I-13:** `DATABASE_URL`, exigida pelo `apply_migration.py`, não aparecia no `backend/.env.example`.

## Objetivo

Levar para o banco as travas que hoje só existem na aplicação, para os caminhos que não passam por ela: PostgREST direto, SQL Editor e RPCs futuras.

## Arquivos alterados

- `supabase/migrations/0012_hardening.sql` (novo)
- `backend/.env.example`
- `README.md`, `DEPLOY.md` (lista e ordem das migrações)
- `backend/app/schemas/modules.py`, `backend/tests/test_schemas.py` (correção do B-09, ver abaixo)

## Alterações realizadas

- **I-02:** a policy vira `profiles_select_own_or_admin USING (id = auth.uid() OR is_admin())`. O frontend só lê a própria linha no login; os dropdowns vêm da API, que usa service_role.
- **I-01:** `CHECK (end_date >= start_date)`. Datas nulas continuam aceitas.
- **I-03:** as FKs `students.academic_period_id` e `modules.academic_period_id` passam a `ON DELETE RESTRICT`. O erro é `foreign_key_violation` (23503) até o Postgres 17, a versão do Supabase, e `restrict_violation` (23001) no 18. A API já recusa antes, em `periods.delete_period`.
- **I-04:** `UNIQUE (email)` em `profiles`.
- **I-05:** trigger `trg_profiles_protect_privileges` (`BEFORE UPDATE`). Se a atualização muda `role` ou `is_active`, vem com JWT (`auth.uid()` não nulo) e o autor não é admin, ela é recusada com `insufficient_privilege`. O service_role do backend e o SQL Editor não têm `sub` e passam.
- **I-06:** `ALTER FUNCTION ... SET search_path = public, pg_temp` nas 4 funções.
- **I-13:** `DATABASE_URL=` no `.env.example`, com a indicação de onde obter o valor.
- **Correção do B-09 (#71):** `ModuleCreate`/`ModuleUpdate` usavam `credits ge=0`, mas a `0008` exige `credits > 0`. Com `credits=0`, a requisição passava no Pydantic e voltava como 500. Agora é `gt=0`, igual ao CHECK e ao `min(1)` do `ModuleDialog`, e o teste cobre `credits=0`.

A migração é idempotente (`DROP ... IF EXISTS` antes de cada objeto) e traz o rollback comentado no fim. O cabeçalho tem as duas consultas de pré-condição (período com datas invertidas e e-mail duplicado): se alguma retornar linhas, o `ADD` aborta a migração inteira.

## Motivo técnico

A API usa service_role, que bypassa o RLS, e continua sendo a camada de autorização (`services/permissions.py`, `services/guards.py`). Nada na 0012 muda o comportamento dela. As travas cobrem o que a análise apontou como defesa em profundidade: se um `GRANT` voltar ou alguém escrever direto no banco, o dano fica contido.

## Impactos positivos

- A anon key deixa de expor a lista de usuários.
- Um `DELETE` acidental num período (SQL Editor, RPC) não apaga mais o histórico acadêmico.
- A escalada de papel via PostgREST fica bloqueada por duas camadas (`REVOKE` e trigger).

## Testes executados

Cluster Postgres 18 descartável (instalação local, em `%TEMP%`), com um stub do que o Supabase provê (`auth.users`, `auth.uid()` lendo `request.jwt.claim.sub`, roles `anon`/`authenticated`/`service_role`, `storage.buckets`, e os privilégios padrão de `public`):

1. Aplicar 0001 → 0012 em ordem, e a 0012 uma segunda vez (idempotência).
2. Checks com fixtures: período invertido; delete de período com e sem aluno; e-mail duplicado; `search_path` em toda função `SECURITY DEFINER` de `public`; troca de papel sem JWT; e, como `authenticated` com o `GRANT UPDATE` restaurado, professor lendo `profiles` e tentando mudar o próprio `role`/`is_active`/nome, e admin lendo todos e mudando papel.
3. Rodar o bloco de rollback e reaplicar a 0012.
4. Backend: `pytest -q`.

## Resultado dos testes

✅ **Passou**: migrações aplicadas sem erro; 11/11 checks ok; o rollback restaura `profiles_select_authenticated`, a FK com `CASCADE`, sem trigger, sem `UNIQUE` e sem `search_path`, e a 0012 reaplica limpa por cima. Backend: `174 passed, 2 skipped`.

## Observações

- **Ainda não aplicada em produção.** O Supabase está pausado. Depois do restore, rodar as duas consultas do cabeçalho e aplicar (`python backend/scripts/apply_migration.py 0012` ou SQL Editor). O plano pede staging antes (I-23); sem staging, o harness local é o que valida.
- O stub imita o Supabase, mas não é o Supabase: o `auth.uid()` real lê `request.jwt.claims`. Vale conferir a I-02 depois de aplicar, logando como professor e lendo `profiles` com a anon key.
- O harness (stub + checks) ficou fora do repositório. Ele é a semente natural do job de CI com Postgres (I-15, Fase 2).
