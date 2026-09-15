# 65 — Sai o `GET /professor/students/{id}/absences`

## Problema identificado

Observação da alteração 64: o `GET /professor/students/{id}/absences` não tinha chamador no front. Ele devolvia as faltas por módulo e o total de atestados, que a ficha do aluno já recebe de `GET /professor/students/{id}`:
- `enrolled_modules`, com `absences` e `max_absences`;
- `medical_certificates`.

O PUT da mesma rota saiu na 64.

## Objetivo

Tirar a rota que ninguém usa: uma rota a menos para autorizar e testar.

## Arquivos alterados

- `backend/app/routers/students.py`: `get_student_absences` e o cabeçalho de seção "Faltas / Certificados médicos" removidos
- `backend/tests/test_students_contador_atestados.py`: `test_put_absences_saiu` vira `test_rota_absences_saiu`, com GET e PUT

## Alterações realizadas

- A rota sai inteira. O caminho `/professor/students/{id}/absences` passa a responder 404 aos dois métodos.

## Motivo técnico

- **Sem chamador.** No `git grep`, fora a rota e o teste, `/absences` só aparece nos registros 20 e 64. O front não usa o caminho nem `absences_by_module`.
- **A ficha não perde nada.** As faltas por módulo continuam vindo do `enrolled_modules` do detalhe do aluno.

## Impactos positivos

- 58 linhas a menos no router e uma checagem de acesso a menos para manter.

## Testes executados

- **`test_rota_absences_saiu`**, com GET e PUT: responde 404 e não grava nada.
- **Suíte do backend.**
- **Prova de mutação:** aplicada no código, rodada e restaurada, com hash conferido depois.

| Mutação | Testes que falharam |
|---|---|
| **M1:** um GET volta no caminho | 2 (o GET recebe 200; o PUT, 405) |

## Resultado dos testes

✅ **Passou**:
- **Suíte:** 360 passaram e 2 skip. Única falha: `test_me_sem_token_retorna_401`, por ambiente (FastAPI 0.115 local; o CI usa 0.141.1), já registrada na alteração 58.
- **Mutação:** pega.

## Observações

- O registro 20 cita os testes de trava do `/absences`. Fica como histórico.
