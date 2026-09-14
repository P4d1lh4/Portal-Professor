# 36 — Fake de banco único nos testes, com registro de filtros (B-12)

## Problema identificado

**B-12** (análise 2026-09, Fase 2): cada arquivo de teste do backend tinha o próprio fake do client supabase-py. A análise contou 6; havia **11** (`_Resp`/`_Query`/`_FakeDb`/`_Chain`/`_ImpDb`/`_OkDb`...), mais **8 cópias** do fixture que loga um usuário (`as_user`/`as_coord`/`as_admin`) e do helper `_profile`. Pior que a duplicação: nenhum fake registrava os filtros. Como o fake devolve a resposta configurada seja qual for a query, um guard que perdesse o `.eq("coordinator_id", ...)` continuava passando nos testes. Era exatamente a classe de bug (escopo de coordenador) que os testes de authz existem para pegar.

## Objetivo

Um fake só, que registre o que a query pede, e os testes antigos migrados para ele. Isso prepara o B-13 (testes HTTP de todos os routers) sem criar o 12º fake.

## Arquivos alterados

- `backend/tests/fakes.py`: o fake único
- `backend/tests/conftest.py`: fixture `as_user`
- `test_attendance_save`, `test_audit`, `test_authz`, `test_exports_pagination`, `test_grades_endpoint`, `test_guards`, `test_import_save`, `test_modules_authz`, `test_observability`, `test_permissions`, `test_sheets_sync`, `test_students_authz`, `test_students_batch`, `test_users_create`

## Alterações realizadas

- **`FakeDb(responses, rpc=...)`:**
  - Resposta por tabela; tabela sem resposta devolve `Resp([])`.
  - A chave `"tabela.update"` (e `insert`/`upsert`/`delete`) responde só às escritas; é o que o teste de notas precisava: leitura devolve a linha com join, e o update devolve a linha nova.
  - Imita o teto de 1000 linhas do PostgREST.
  - A `rpc` aceita uma resposta fixa ou uma função `params -> Resp`, que pode levantar (falha por linha no import CSV).
- **Registro para asserção:**
  - `db.writes`: `(tabela, op, payload)`.
  - `db.calls("tabela")`: todos os métodos encadeados com os argumentos, na ordem.
  - `db.tables`: tabelas consultadas (usado no teste de N+1).
  - `db.rpc_calls`.
- **`as_user(role, uid=None)`** no `conftest.py`: faz o override de `get_current_user` e o remove no teardown. Os imports ficam dentro do fixture para o conftest não carregar o app nos testes que não precisam dele.
- **Asserções novas que o registro permite:**
  - `test_permissions` e `test_students_authz` travam que a checagem de dono filtra por `id` **e** por `coordinator_id` do usuário logado.
  - `test_students_batch` confere o `in_("student_id", [...])`.
  - `test_attendance_save` confere que a matrícula de outro módulo não chega à RPC `save_attendance_day`.

## Motivo técnico

O fake mora em `tests/fakes.py`, não no `conftest.py` como o plano sugeria: classes em conftest não se importam de forma limpa, e um módulo comum sim. O conftest ficou com o que é fixture. O `__getattr__` genérico dispensa listar cada método do builder (`eq`, `in_`, `or_`, `order`, `range`...): o método que um router novo usar já está coberto e registrado. Nenhum router usa builder por propriedade (`.not_`), que esse desenho não cobriria.

## Impactos positivos

- **−599 linhas** nos testes (304 inseridas, 903 removidas), mesmos 174 testes.
- Filtro removido de guard de authz passa a quebrar teste (ver prova de mutação abaixo).
- O B-13 começa com o fake e o fixture prontos.

## Testes executados

- `pytest -q --cov=app --cov-fail-under=60` no venv isolado.
- **Prova de mutação:** removido temporariamente o `.eq("coordinator_id", current_user.id)` de `services/permissions.py`, rodados `test_permissions`, `test_students_authz`, `test_authz` e `test_modules_authz`, e o arquivo restaurado em seguida.

## Resultado dos testes

✅ **Passou**: `174 passed, 2 skipped`, cobertura 64,94%. Na mutação, **2 falham** (`test_permissions::test_coordenador_dono_do_periodo_passa` e `test_students_authz::test_coordenador_nao_dono_get_403`, as asserções de filtro) e 22 passam. Com os fakes antigos, os 24 passariam, porque a resposta configurada não dependia do filtro.

## Observações

- O fake não filtra de verdade, e é de propósito: filtrar exigiria reimplementar o PostgREST. Quando o filtro importa, o teste afirma sobre `db.calls(...)`.
- O `_ExplodingDb` do `test_audit` (3 linhas, `table()` que levanta) ficou local: é um banco quebrado de propósito, não uma variação do fake.
