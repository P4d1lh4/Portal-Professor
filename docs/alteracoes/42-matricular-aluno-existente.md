# 42 — Matricular aluno existente e desmatricular (P-Q1 / B-S2)

## Problema identificado

**P-01 (Alto)**, a quebra central do fluxo do coordenador, na análise 2026-09 (`04-produto-lacunas.md`):
- `POST /api/periods/{id}/students` cria o aluno **sem matrícula**;
- não existia endpoint nem tela para matricular um aluno já cadastrado.

Resultado:
- o aluno criado pelo coordenador ficava invisível em Notas e Chamada, que listam por `enrollments`;
- o professor não conseguia recriá-lo, porque o `student_number` já existia (409).

Também não havia como desmatricular de um módulo específico.

## Objetivo

Permitir que coordenador e admin matriculem um aluno existente num módulo do período dele e desfaçam uma matrícula, com as mesmas regras de acesso e de período fechado do resto do sistema.

## Arquivos alterados

- `backend/app/routers/modules.py`: `enroll_student` e `unenroll_student`
- `backend/app/schemas/modules.py`: `EnrollmentCreate`, `Enrollment`
- `backend/app/routers/students.py`: mensagem do 409 ao criar aluno
- `backend/tests/test_enrollments.py` (novo)
- `frontend/src/features/students/api.ts`: `enroll`, `unenroll`
- `frontend/src/features/students/useStudents.ts`: `useEnrollStudent`, `useUnenrollStudent`
- `frontend/src/features/students/StudentDetailSheet.tsx`
- `frontend/src/features/students/StudentDetailSheet.test.tsx` (novo)

## Alterações realizadas

### `POST /api/modules/{module_id}/enrollments` (`{ "student_id": ... }`), admin e coordenador

- **Acesso:** o coordenador precisa coordenar o período do módulo (403, mesma mensagem do PUT/DELETE de módulo). O período fechado bloqueia com 409, exceto para o admin (`assert_module_period_active`).
- **Validação do aluno:**
  - aluno inexistente dá 404;
  - aluno de outro período dá 422;
  - aluno desativado dá 409;
  - aluno já matriculado dá 409.
- **Gravação:** cria a matrícula e a linha de `grades`. Se a linha de nota falhar, a matrícula é apagada (compensação), para não ficar matrícula sem nota.
- **Auditoria:** `action="insert"`.

### `DELETE /api/enrollments/{enrollment_id}`, admin e coordenador

- Mesmas regras de acesso e de período.
- Notas e frequência saem em cascata (FKs da 0001/0005). Por isso, o `audit_log` guarda o `before` com a nota do aluno naquele módulo: tutoria, prova, recuperação, final e faltas.

### Ficha do aluno (`StudentDetailSheet`)

- Para admin e coordenador, com aluno ativo, aparece um seletor **"Matricular em módulo"**. Ele lista os módulos ativos, de período aberto, do período do aluno em que ele ainda não está. Aparece mesmo sem nenhuma matrícula, que é o caso do P-01.
- Cada módulo cursado ganha um botão de **desmatricular**, com confirmação que avisa que notas e frequência serão apagadas.
- As mutações invalidam a ficha, as Notas do módulo e a Chamada.

### Mensagem do 409 ao criar aluno (coordenador)

Aponta o caminho: "abra a ficha dele e use 'Matricular em módulo'".

## Motivo técnico

- **O professor fica de fora de propósito.** Matrícula é gestão de turma, e o RLS da 0002 já restringia o DELETE ao admin. Liberar o professor ampliaria o acesso dele a alunos que hoje não vê. O `require_role` barra com 403.
- **Compensação no app em vez de nova RPC.** São dois inserts. Uma migração nova exigiria aplicar em produção, que está pausada, e um check novo no CI. Um comentário `ponytail:` marca onde virar função plpgsql, como a 0007.
- **`<select>` nativo na ficha:** o Radix Select não traz ganho num seletor simples dentro de um sheet, e o nativo funciona melhor no celular e no teste (jsdom).
- **Snapshot da nota na auditoria:** desmatricular apaga dados de avaliação sem volta. O `before` permite reconstituir a nota se foi engano.

## Impactos positivos

- O P-01 fecha: o aluno criado pelo coordenador passa a entrar em Notas e Chamada com dois cliques na ficha.
- O coordenador consegue corrigir uma matrícula errada, e a "transferência" vira desmatricular + matricular, sem mexer no banco.

## Testes executados

- **pytest `test_enrollments.py`** (15 casos):
  - coordenador dono matricula, criando nota e auditoria;
  - coordenador de outro período recebe 403;
  - professor recebe 403;
  - aluno inexistente, de outro período, desativado ou já matriculado;
  - período fechado: 409 para o coordenador, 201 para o admin;
  - falha na nota desfaz a matrícula;
  - DELETE: dono, outro período, professor, inexistente e período fechado, com a nota conferida na auditoria.
- **vitest `StudentDetailSheet.test.tsx`** (4 casos):
  - aluno sem matrícula é matriculado;
  - módulo já cursado não é oferecido;
  - desmatricular pede confirmação (Cancelar não chama a API);
  - professor não vê os controles.
- Suítes completas, `tsc -b` e eslint.
- **Provas de mutação**, cada uma aplicada temporariamente e restaurada:
  - POST sem o guard de período;
  - POST sem a compensação;
  - DELETE sem a nota na auditoria;
  - ficha liberando o professor;
  - ficha oferecendo módulo já cursado;
  - desmatricular sem confirmar.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 15/15; suíte com 260 aprovados e cobertura de 74,1%. A única falha local é a conhecida `test_me_sem_token_retorna_401`, do FastAPI 0.115 do Python global; o CI usa o 0.141.
- **Frontend:** 47/47 (+4); tsc ok; nenhum warning novo no lint.
- **Mutações:** as 6 foram pegas.

## Observações

- **Botão em lote na `ModulesPage` ficou para depois.** O plano citava a ficha e a tela de módulos; a ficha resolve o P-01 (aluno a aluno). Matricular a turma inteira num módulo novo vai pesar quando o P-Q5 (clonar período) chegar: módulos clonados nascem sem alunos. É o próximo passo natural desse fluxo.
- **"Matricular o existente" no 409 do professor não foi feito.** O professor não gerencia matrícula (ver Motivo técnico). O 409 dele continua como estava; quem resolve é o coordenador, pela ficha.
- **Validado só com o fake.** O `db.py` já converte o `None` do `maybe_single()` do postgrest 0.17 numa resposta com `data=None`, que é o que o `FakeDb` imita. A validação contra o banco real fica para quando o Supabase voltar.
