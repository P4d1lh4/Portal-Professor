# 50 — Alunos do professor paginados no servidor (P-Q8)

## Problema identificado

**P-10 / P-Q8 (Médio)**, análise 2026-09 (`04-produto-lacunas.md`). `GET /api/professor/students` devolvia **todos** os alunos dos módulos do professor de uma vez, cada um com o detalhe completo (notas e faltas por módulo). A tela de Alunos filtrava e paginava no cliente, como admitia o comentário no código. Além disso:

- **Corte silencioso:** a leitura das matrículas não era paginada. Acima de 1000 linhas (o teto do PostgREST), alunos sumiam da lista sem aviso.
- **Requisição à toa:** a tela disparava essa query também para coordenador e admin, que não a usam.

## Objetivo

Paginar e buscar no servidor, no mesmo formato da rota do coordenador (`/periods/{id}/students`), e montar o detalhe só dos alunos da página.

## Arquivos alterados

- `backend/app/routers/students.py`: `list_professor_students`
- `backend/tests/test_professor_students_pagination.py` (novo)
- `frontend/src/features/students/api.ts`, `useStudents.ts`, `StudentsPage.tsx`

## Alterações realizadas

- **Backend:**
  - `GET /api/professor/students` passa a aceitar `search`, `limit` (1–200, padrão 50) e `offset`;
  - devolve `{items, total, limit, offset}`, o mesmo `Paginated` do coordenador;
  - só alunos ativos dos módulos ativos do professor, com a busca por nome ou matrícula no banco;
  - o detalhe (notas por módulo) é montado numa query só, **só para a página**;
  - as matrículas são lidas com `fetch_all`.
- **Frontend:**
  - `useProfessorStudents(params, enabled)` com `keepPreviousData`, como o hook do coordenador;
  - a tela de Alunos passa a ter um caminho só: a mesma busca e a mesma paginação para os dois papéis, lendo `items`/`total` da query do papel;
  - o filtro e a paginação no cliente saíram;
  - cada papel dispara só a sua query.

## Motivo técnico

- **Formato único:** com o mesmo `Paginated` nas duas rotas, a tela deixa de ter dois ramos de dados.
- **Detalhe só da página:** montar notas e faltas de centenas de alunos para mostrar 25 era o custo principal da rota.
- **Ids dos alunos em `in_`:** mesmo padrão de antes; centenas de ids cabem na URL. O teto está anotado no código (`ponytail:`).

## Impactos positivos

- A lista do professor carrega no mesmo tempo com 30 ou 600 alunos, e a busca vale para a turma inteira, não só para a página carregada.
- O professor com mais de 1000 matrículas deixa de ver alunos sumirem.
- Coordenador e admin deixam de fazer uma requisição inútil ao abrir a tela.

## Testes executados

- **`test_professor_students_pagination.py`** (4 casos):
  - página com total e detalhe do aluno, e as consultas com a faixa pedida, os ids do professor, só ativos e os módulos do próprio professor;
  - a busca vai para o banco;
  - as matrículas são lidas paginadas;
  - professor sem módulos recebe página vazia sem consultar alunos.
- Suíte completa do backend; tsc, eslint e vitest no frontend.
- **Provas de mutação:** sem a faixa da página no servidor; sem a busca no servidor.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 4/4 novos; suíte completa verde. A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Frontend:** tsc ok, vitest 60/60. O eslint da pasta de alunos ficou sem nenhum aviso: o `react-hooks/exhaustive-deps` do filtro no cliente saiu com ele.
- **Mutações:** as 2 foram pegas.

## Observações

- A resposta de `GET /api/professor/students` mudou de lista para `Paginated`. O único consumidor era a tela de Alunos, ajustada neste mesmo PR; nenhum teste usava o formato antigo.
- A tela de Alunos não tem teste de componente; a regra (página, busca, filtro de ativos) está no backend e coberta.
