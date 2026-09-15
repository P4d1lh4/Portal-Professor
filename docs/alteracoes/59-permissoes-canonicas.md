# 59 — Um guard de acesso a aluno em `services/permissions` (B-07)

## Problema identificado

**B-07 (Médio)**, análise 2026-09 (`01-backend.md`): a regra "quem pode acessar este aluno" tinha três cópias.
- **`students.py`:** `_assert_can_access_student` e `_assert_prof_has_student`.
- **`medical_certificates.py`:** `_assert_can_access_student`, própria e **divergente**. Com um coordenador que não coordena o período do aluno, ela não negava: caía na checagem de professor.
  - O `professor_id` de um módulo precisa ter papel professor na criação (`_assert_professor_exists`), mas o papel pode mudar depois (tela de Usuários).
  - Resultado: um professor promovido a coordenador continuava vendo e editando atestados dos alunos dos módulos antigos, fora dos períodos que coordena. Em `students.py` o mesmo usuário já era barrado.
- **`reports.py`:** `_assert_professor_has_student` (cópia) e `_assert_coord_owns_period` (variante do helper canônico, com outra mensagem).

Achado da alteração 58 (B-11): `upload_attachment` era `async def` e chamava o supabase-py, que é bloqueante, sem `asyncio.to_thread`. Durante o upload, o event loop do worker único ficava parado.

## Objetivo

Uma regra só de acesso a aluno, usada pelos três routers, e os testes de autorização de cada router travando o helper compartilhado.

## Arquivos alterados

- `backend/app/services/permissions.py`: `assert_can_access_student` e `assert_professor_has_student`
- `backend/app/routers/students.py`: usa os helpers; cópias apagadas
- `backend/app/routers/reports.py`: usa `assert_can_access_student` e `assert_coordinator_owns_period`; cópias apagadas
- `backend/app/routers/medical_certificates.py`: usa `assert_can_access_student`; cópia apagada; upload em `def`
- `backend/tests/test_medical_certificates_authz.py`: teste novo; uma asserção retirada
- `backend/tests/test_reports_authz.py`: fixture com `academic_period_id`
- `backend/tests/test_authz.py`: comentário com o nome novo

## Alterações realizadas

- **`services/permissions.py`:** recebe `assert_can_access_student(db, current_user, student_id)` e `assert_professor_has_student(db, professor_id, student_id)`, movidos de `students.py` sem mudança de lógica.
  - professor: matrícula em algum módulo seu;
  - coordenador: o aluno num período que ele coordena (via `assert_coordinator_owns_period`);
  - admin: livre.
- **`students.py`:** as 5 rotas chamam o helper de `permissions`.
- **`medical_certificates.py`:** as 8 rotas usam o mesmo helper.
- **`reports.py`:**
  - o boletim usa `assert_can_access_student`, que troca 4 linhas com lógica de papel;
  - o relatório do período usa `assert_coordinator_owns_period(..., detail="Você não coordena este período.")`. O `if role == "coordinator"` saiu, porque o helper não faz nada para os outros papéis.
- **`upload_attachment`:** passa a `def`, com `file.file.read()`. O FastAPI roda o endpoint no threadpool, como manda o `CONTRIBUTING.md`.

## Motivo técnico

- **Um PR em vez de um por router.** O plano pedia um router por PR para isolar risco, mas aqui a mudança é mover e apagar cópias. Cada router já tinha testes HTTP de autorização por papel (B-13), e as mutações M1–M4 mostram que eles falham quando o helper compartilhado quebra.
- **`sheets`, `import_csv` e `exports` mantêm a comparação inline.** Eles já leram a linha do período (com `coordinator_id`) antes de checar, e a checagem é `coordinator_id != current_user.id`, com 403.
  - O helper canônico existe para buscar e checar. Aqui ele só acrescentaria uma consulta, sem mudar a regra.
  - A divergência que o B-07 apontou estava nos guards de várias consultas.
- **`periods._assert_period_access` fica com 404 de propósito,** para não revelar que o período existe. A docstring do helper canônico já registra isso.
- **Mudanças de comportamento, todas na direção da regra de `students.py`:**
  - **Atestados, coordenador ex-professor fora dos seus períodos:** agora 403.
  - **Atestados, professor com aluno inexistente** em `/students/{id}/medical-certificates`: 403 em vez de 404, igual a `students.py`. O helper não busca o aluno para professor.
  - **Boletim, coordenador:** uma consulta a mais (o período do aluno). A mensagem de negação passa a ser "Você não tem permissão para acessar este aluno."

## Impactos positivos

- Fecha o acesso indevido do coordenador ex-professor aos atestados.
- Uma regra de acesso a aluno para ler, testar e mudar. Os três routers perdem as cópias: o diff sai com 168 linhas removidas e 88 acrescentadas, contando testes e docs.
- O upload de PDF não trava mais as outras requisições do worker.

## Testes executados

- **Teste novo:** `test_coordenador_nao_herda_acesso_de_quando_era_professor`. Coordenador de outro período com módulos que têm o aluno matriculado recebe 403.
- **Asserção retirada:** `test_checagem_filtra_pelo_usuario_logado` exigia que o coordenador fosse checado como professor (`professor_id` = id do coordenador), justamente o comportamento removido.
- **Fixture:** `STUDENT` de `test_reports_authz.py` ganhou `academic_period_id`, a coluna que o helper lê, como uma linha real de `students` tem.
- **Suíte do backend.**
- **Provas de mutação:** cada uma alterada no código, rodada e restaurada, com hash conferido depois.

| Mutação | Testes que falharam |
|---|---|
| **M1:** sem checagem de coordenador em `assert_can_access_student` | 12 |
| **M2:** professor sem checagem de matrícula | 9 |
| **M3:** relatório do período sem o escopo do coordenador | 1 |
| **M4:** `medical_certificates.py` da `main`, com a cópia antiga do guard | o teste novo |

## Resultado dos testes

✅ **Passou**:
- **Suíte:** 323 passaram e 2 skip. Única falha: `test_me_sem_token_retorna_401`, por ambiente (FastAPI 0.115 local; o CI usa 0.141.1), já registrada na alteração 58.
- **Mutações:** as 4 foram mortas.

## Observações

- **Outra cópia do mesmo tipo (fica para depois):** `attendance._assert_module_access` e `exports._module_for_export` fazem a mesma checagem de módulo:
  - carregam o módulo, 404 se não existe;
  - professor que não leciona recebe 403;
  - coordenador passa por `assert_coordinator_owns_period`.

  A diferença é o `select`. Não estava no escopo do B-07. Vale juntar se aparecer um terceiro uso.
