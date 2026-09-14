# 31 — Fase 1 (backend): B-02, B-04, B-06, B-09

## Problema identificado

Achados de backend da Fase 1 da análise de 2026-09 (`docs/analise-2026-09/01-backend.md`):

- **B-02 (Alto):** o sync de planilha (`POST /api/periods/{id}/sync-sheets`) gravava notas em período encerrado. O `PUT /api/grades/{id}` bloqueia isso; a planilha não tinha trava.
- **B-04 (Médio):** os dois exports CSV faziam a query sem `.range()`, e o PostgREST corta em 1000 linhas. Período com mais de 1000 alunos, ou módulo com mais de 1000 matrículas, gerava CSV truncado sem aviso.
- **B-06 (Médio):** `POST /api/users` devolvia ao cliente a mensagem crua do SDK do Supabase, e só descobria `username` duplicado depois de criar a conta no Auth.
- **B-09 (Baixo):** `email` de aluno sem validação de formato, `credits`/`max_absences` negativos chegando ao banco (CHECK → 500 em vez de 422), texto livre sem limite de tamanho.

## Objetivo

Fechar os achados de backend da Fase 1 que não dependem do banco vivo. O B-03 (filtro de embed no sync) fica para depois do restore do Supabase, porque só dá para validar contra o PostgREST real.

## Arquivos alterados

- `backend/app/services/guards.py`, `backend/app/routers/sheets.py`
- `backend/app/routers/exports.py`
- `backend/app/routers/users.py`
- `backend/app/schemas/students.py`, `backend/app/schemas/modules.py`
- `backend/tests/fakes.py` (novo), `test_sheets_sync.py` (novo), `test_exports_pagination.py` (novo), `test_users_create.py` (novo), `test_schemas.py`

## Alterações realizadas

- **B-02:** `guards.assert_period_active(is_active, user)` concentra a regra (admin passa; os demais levam 409 com a mensagem de sempre) e o `assert_module_period_active` passa a usá-la. O `sync_sheets` lê `is_active` junto com o período e chama o guard **antes** de baixar a planilha.
- **B-04:** os dois exports usam `fetch_all`. O builder é recriado a cada página: os builders do supabase-py acumulam parâmetros, então reaproveitar um só (como sugeria o plano) repetiria `offset`/`limit` a partir da 2ª página.
- **B-06:** o `username` é checado em `profiles` antes do `auth.admin.create_user` (409). Qualquer outra falha do Auth vai para `logger.exception` e o cliente recebe mensagem genérica. O caso "e-mail já registrado" continua com 409 específico.
- **B-09:** `EmailStr | None` em `StudentCreate`/`StudentUpdate` (o frontend já validava com `z.string().email()` e não manda string vazia); `max_length` de 200 em `full_name` e de 2000 em `referral_info`/`observations`; `ge=0` em `credits`/`max_absences` de `ModuleCreate`/`ModuleUpdate`.
- **`tests/fakes.py`:** fake mínimo do client (filtros encadeiam sem efeito, imita o teto de 1000 linhas, registra escritas). É a semente do B-12: os três testes novos o usam, em vez de criar o 7º, 8º e 9º fakes locais.

## Motivo técnico

Guard em função única pelo mesmo motivo do `permissions.py`: cópias da regra divergem. No sync, a checagem vem antes do download para não gastar a requisição externa num período que vai ser recusado.

## Impactos positivos

- Nota de período fechado só muda por admin, venha da tela ou da planilha.
- CSV completo para qualquer tamanho de turma.
- Resposta de erro sem detalhes internos do Supabase; sem conta órfã no Auth por `username` repetido.
- Entrada inválida vira 422 com mensagem, não 500.

## Testes executados

- Venv limpo com o `requirements.txt`: `pytest -q --cov=app --cov-fail-under=50`.
- Os testes novos rodados com `backend/app` revertido (stash), para confirmar que falham sem o fix.

## Resultado dos testes

✅ **Passou**: `174 passed, 2 skipped` (+12), cobertura 64,94%. Sem o fix, os testes novos falham.

## Observações

- `import_csv` cria alunos pela RPC `0007`, sem passar pelo `StudentCreate`: e-mails importados continuam sem validação de formato no backend.
- Pendente na Fase 1: **B-03** (depois do restore do Supabase).
