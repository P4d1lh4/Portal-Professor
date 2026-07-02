# 20 — IDOR de coordenador nas rotas item-level de /professor/students

## Problema identificado

As 5 rotas item-level de aluno (`GET`/`PUT`/`DELETE /api/professor/students/{id}`, `GET`/`PUT .../absences`) só validavam escopo para o papel **professor** (`_assert_prof_has_student` dentro de `if role == "professor"`). **Coordenador e admin passavam direto.** Como a API usa service role (bypassa RLS), um coordenador de um período P1 podia **ler, editar, desativar** e **alterar atestados** de alunos de **qualquer** período (P2, P3…) — IDOR/escalonamento horizontal com dados pessoais, notas e faltas.

É a mesma classe do bug [A2] (grades), encontrada na revisão adversarial pós-merge (o audit original não a cobriu nestas rotas).

## Objetivo

Restringir o coordenador a alunos de períodos que ele coordena, em todas as rotas item-level, sem alterar professor (já correto) nem admin (acesso total).

## Arquivos alterados

- `backend/app/routers/students.py`
- `backend/tests/test_students_authz.py` (novo)

## Alterações realizadas

- Novo helper `_assert_can_access_student(db, current_user, student_id)`: professor → `_assert_prof_has_student`; coordenador → carrega `student.academic_period_id` e chama `assert_coordinator_owns_period` (403 se não coordena); admin → no-op.
- As 5 rotas passaram a chamar `_assert_can_access_student` no lugar do `if role == "professor"`. Em `deactivate_student`, a checagem extra de "aluno exclusivo deste professor" foi preservada como bloco `if role == "professor"` separado.
- 4 testes de trava: coordenador não-dono → **403** em GET/PUT/DELETE/absences, **sem nenhuma escrita**.

## Motivo técnico

Unificar a autorização num helper garante que as 5 rotas apliquem o MESMO escopo (evita que uma esqueça, que foi exatamente a causa). Reusa o `assert_coordinator_owns_period` já canônico (melhoria 10/13/18). O helper faz uma query extra do período do aluno só no caminho de coordenador — custo aceitável fora do hot-path.

## Impactos positivos

- Fecha o vazamento cross-período de dados de aluno (leitura E escrita) para coordenadores.
- Consistente com o escopo já aplicado em grades/attendance/modules.

## Testes executados

- `pytest tests/test_students_authz.py tests/test_authz.py` → 16 passed (4 novos + authz de professor/admin inalterados).
- `pytest` (suíte completa) → **159 passed**.

## Resultado dos testes

✅ **Passou** — `159 passed`. Sem regressões.

## Observações

- Achado e verificado adversarialmente na revisão pós-merge (workflow). Severidade **Alta** (dados pessoais + escrita), mitigada por exigir conta de coordenador autenticada.
- Padrão professor↔aluno ainda tem cópias em `reports`/`medical_certificates` (backlog M2) — mesmo helper aplicável quando priorizadas.
