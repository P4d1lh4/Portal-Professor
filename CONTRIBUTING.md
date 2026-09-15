# Como contribuir

O fluxo abaixo é o que o projeto já pratica. Ele existe para que cada mudança seja revisável, testada e fácil de rastrear depois.

## Fluxo de uma mudança

1. **Um item por branch e por PR.** Prefixos: `feat/`, `fix/`, `chore/`, `docs/`, `test/`, `ops/`, `refactor/`. Itens do plano de análise usam o ID no nome e no título (ex.: `feat/pq1-matricula`, "… (P-Q1)").
2. **CI verde antes do merge:**
   - backend: pytest com cobertura mínima de 70%;
   - imagem Docker com smoke test;
   - todas as migrações num Postgres, mais os checks;
   - frontend: lint, tsc, vitest e build.
3. **Registro da alteração** em `docs/alteracoes/NN-slug.md` (formato abaixo), com uma linha no [`INDEX.md`](docs/alteracoes/INDEX.md) e, se for item do plano, o checkbox marcado em [`05-plano-de-execucao.md`](docs/analise-2026-09/05-plano-de-execucao.md).
4. **Merge com merge commit** (sem squash), para o histórico manter os commits de cada item.

O template de PR (`.github/pull_request_template.md`) já traz esses campos.

## Registro de alteração

Um arquivo por item, numerado em sequência, com estas seções, nesta ordem:

**Problema identificado · Objetivo · Arquivos alterados · Alterações realizadas · Motivo técnico · Impactos positivos · Testes executados · Resultado dos testes · Observações**

- **"Motivo técnico"** explica as escolhas, principalmente as que fogem do óbvio ou do que o plano sugeria.
- **"Observações"** guarda o que ficou de fora e os achados que merecem item próprio.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) em português: `tipo(escopo): descrição (ID)`, por exemplo `fix(sheets): recusar sync em período fechado (B-02)`. O corpo diz o porquê; o *o quê* está no diff.

## Backend

- **Autorização:** ver a [ADR 0001](docs/adr/0001-autorizacao-na-aplicacao.md). Todo endpoint tem `require_role` e a checagem de escopo, com os helpers de `app/services/permissions.py` e `app/services/guards.py`. Todo endpoint também ganha teste HTTP por papel, incluindo o caso "não é dono".
- **Testes:** use o fake único de `tests/fakes.py` (`FakeDb`) e o fixture `as_user`; não crie outro fake. Quando o filtro importa (escopo, período), confira `db.calls("tabela")`.
- **`def` ou `async def` (B-11):**
  - `def` quando o endpoint só chama o supabase-py, que é bloqueante. O FastAPI roda o endpoint no threadpool.
  - `async def` só quando o endpoint faz `await` (httpx, `UploadFile.read()`). Nesse caso, toda chamada ao supabase-py vai em `asyncio.to_thread`; senão, ela trava o event loop do worker único do Render.
- **Banco local nos testes:** passe `DATABASE_URL` explícito na linha de comando. O `backend/.env` aponta para **produção**, e o `load_dotenv` não sobrescreve variável já definida.

## Banco (`supabase/migrations`)

- **Migração nova:**
  - numerada em sequência;
  - idempotente (`IF NOT EXISTS`, `DROP … IF EXISTS`);
  - rollback comentado no cabeçalho;
  - pré-condições em consultas no cabeçalho, se ela puder abortar.
- **Nunca edite uma migração já aplicada.** O `apply_migration.py` guarda o checksum, e a edição aparece como "MODIFICADA" em produção. Corrija numa migração nova.
- **Regra de banco nova** (CHECK, FK, trigger, policy): ganha um check em [`supabase/ci/checks.sql`](supabase/ci/checks.sql). Objeto novo do Supabase (schema `auth`, `storage`, papéis) ganha stub em [`supabase/ci/stub.sql`](supabase/ci/stub.sql).
- **Aplicar:** `python backend/scripts/apply_migration.py --all`. Conferir: `--status`.

## Frontend

- **Testes:** vitest com Testing Library (jsdom).
  - Rede isolada com `vi.mock` nos módulos de api (`features/*/api.ts`).
  - Onde o store de auth real é carregado, `@/lib/supabase` fica sempre mockado.
- **Regras de negócio** (situação do aluno, risco) vêm do backend ou de `src/lib/classification.ts`, travada pela tabela `classification.cases.json`. Não reimplemente nas telas.
- **Escolhas de UI:** `<select>` nativo em seletores simples; layout de celular por CSS sobre a mesma marcação (`components/ui/card-table.ts`).

## Prova de mutação

Quando um teste guarda regra de negócio ou de acesso, altere o código de produção de propósito, confirme que o teste falha e desfaça. Registre o resultado no documento da alteração. Um teste que não falha com a regra quebrada não protege nada.
