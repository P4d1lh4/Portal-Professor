# 19 — Import CSV atômico por aluno via RPC (M4, parte 2)

## Problema identificado

O persist do import CSV fazia, por linha: `insert` do aluno → buscar módulos → loop de `insert` de matrícula + `insert` de nota. Uma falha no meio do loop deixava o aluno criado com **matrículas parciais** (mitigado só com `enrollment_warnings` no log/resposta). Além disso, os módulos eram buscados **uma vez por aluno**. O caminho de persistência não tinha nenhum teste.

## Objetivo

Tornar cada aluno importado atômico (aluno + matrículas + notas tudo-ou-nada) reusando a RPC transacional já existente, e cobrir o caminho com teste.

## Arquivos alterados

- `backend/app/routers/import_csv.py`
- `backend/tests/test_import_save.py` (novo)

## Alterações realizadas

- Persist reescrito: busca os `module_ids` ativos do período **uma vez**, e para cada linha válida chama `db.rpc("create_student_with_enrollments", {p_student, p_module_ids})` (RPC da migration `0007`).
- Falha numa linha → `errors_on_save` (as demais seguem). Removido o campo `enrollment_warnings` da resposta (não é mais possível haver matrícula parcial; o frontend não o consumia).
- 2 testes de integração do endpoint (multipart): importa 2/2 via RPC (com `p_module_ids` corretos); falha simulada numa linha → `imported=1` + 1 erro, sem derrubar a outra.

## Motivo técnico

A RPC `create_student_with_enrollments` (0007) já encapsulava exatamente "criar aluno + matricular numa lista de módulos + criar notas" numa transação — reusá-la é mais lazy e correto que escrever uma RPC nova. Removi `enrollment_warnings` porque a atomicidade elimina o estado que ele reportava; confirmei via grep que o frontend (`ImportPage.tsx`) usa apenas `imported` e `errors_on_save`. Buscar os módulos fora do loop é um ganho de N→1 queries de brinde.

## Impactos positivos

- Fim de alunos importados com matrículas parciais (integridade).
- Menos queries por import (módulos buscados uma vez).
- Caminho de persistência do import agora tem cobertura de teste.

## Testes executados

- `pytest tests/test_import_save.py` → 2 passed.
- `pytest` (suíte completa) → **145 passed** (os testes de parser/validação continuam verdes).

## Resultado dos testes

✅ **Passou** — `145 passed`.

## Observações

- Depende da RPC `0007` já estar aplicada no Supabase (já existia; nenhuma migration nova aqui).
- Resta do M4: criação de usuário (`Auth` + `profile`) — não é transacionável via RPC porque o Supabase Auth é um serviço separado; mitigar com compensação/retry (fora deste escopo).
