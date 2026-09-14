# 47 — Novo período a partir de outro, com cópia dos módulos (P-Q5 / B-S3)

## Problema identificado

**P-Q5 (Alto)**, análise 2026-09 (`04-produto-lacunas.md`): não havia como clonar período ou módulos. A cada semestre, o admin recriava à mão todos os módulos (código, nome, professor, créditos, limite de faltas).

Ao desenhar a virada de semestre, apareceu um segundo problema:
- `students.student_number` é **único no banco inteiro** (`0001`: `TEXT NOT NULL UNIQUE`), não por período;
- o import de alunos só checava duplicata **dentro do período**;
- resultado: ao importar num período novo alunos que já existem em outro, o preview mostrava as linhas como válidas e a gravação falhava linha a linha, com o erro cru do banco.

Além disso, a checagem lia os alunos sem paginação: acima de 1000 no período, a duplicata escapava.

## Objetivo

- Criar um período novo a partir de outro, levando os módulos, com um clique na tela de Períodos.
- Fazer o import dizer a verdade no preview sobre matrícula que já existe em outro período.

## Arquivos alterados

- `backend/app/routers/periods.py`: `POST /api/periods/{id}/clone` e o helper `_insert_period`, compartilhado com a criação
- `backend/app/routers/import_csv.py`: checagem de matrícula em todos os períodos
- `backend/tests/test_period_clone.py` (novo), `backend/tests/test_import_save.py` (+2 casos)
- `frontend/src/features/periods/api.ts`, `usePeriods.ts` (`useClonePeriod`), `PeriodDialog.tsx` (modo `cloneFrom`), `PeriodsPage.tsx` (botão por período)

## Alterações realizadas

- **`POST /api/periods/{id}/clone`, só admin, como a criação de período.** Recebe o mesmo corpo da criação: nome, coordenador, datas, ativo.
  - **Validações:** origem inexistente dá 404; nome repetido dá 409.
  - **Cópia:** copia os **módulos ativos** da origem (nome, código, professor, créditos, limite de faltas) para o período novo, todos ativos e **sem alunos**.
  - **Compensação:** se a cópia falhar, o período novo é apagado.
  - **Auditoria:** `insert` com `cloned_from` e a quantidade de módulos, e o resumo "Período criado a partir de X: N módulo(s) copiado(s)".
- **`_insert_period`:** a checagem de nome único e o insert do período saíram da criação para um helper que a criação e o clone usam.
- **Tela de Períodos:** cada período ganha, para o admin, o botão "Novo período a partir de…". Ele abre o mesmo formulário de período com o título "Novo período a partir de X", o coordenador da origem sugerido e o aviso de que os módulos são copiados e os alunos não. O botão de envio diz "Criar e copiar módulos".
- **Import de alunos:**
  - a checagem de matrícula passa a olhar **todos os períodos**, paginada com `fetch_all`;
  - o preview distingue "já existe no período", "já pertence a um aluno de outro período" e "repetida neste arquivo".

## Motivo técnico

- **Sem alunos, de propósito.** Levar os alunos esbarra no `student_number` único global: o mesmo aluno não pode existir em dois períodos. Resolver isso (matrícula única por período, ou uma entidade "pessoa" acima de aluno) é a decisão pendente **B-08**, do dono. O clone entrega o que independe dela.
- **Por isso não houve a matrícula em lote** que a alteração 42 anotou para este item. Num período clonado, os alunos entram pelo import, que já matricula cada aluno em todos os módulos ativos do período. Hoje isso vale para alunos novos; reaproveitar os do semestre anterior depende do B-08.
- **Só módulos ativos:** o módulo desativado é o que saiu da grade; copiá-lo obrigaria o admin a apagá-lo de novo.
- **Compensação em vez de RPC:** mesmo raciocínio da matrícula (alteração 42). São dois inserts; a migração nova teria de ser aplicada em produção, que está pausada.

## Impactos positivos

- A virada de semestre deixa de exigir recriar os módulos à mão.
- O import deixa de prometer no preview uma gravação que vai falhar e diz o motivo linha a linha.

## Testes executados

- **`test_period_clone.py`** (7 casos):
  - admin clona copiando só os ativos, no período novo, com auditoria;
  - origem inexistente dá 404 e nome repetido dá 409, os dois sem escrita;
  - coordenador e professor recebem 403;
  - origem sem módulos cria só o período;
  - falha na cópia desfaz o período.
- **`test_import_save.py`**, 2 casos novos: matrícula de outro período recusada no preview; matrícula repetida no arquivo.
- Suíte completa do backend; `tsc -b`, eslint e vitest no frontend.
- **Provas de mutação:**
  - clone copiando módulo inativo;
  - clone sem compensação;
  - cópia gravada no período de origem;
  - import sem a checagem global;
  - import sem a checagem de repetida no arquivo.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 9 casos novos; suíte com 301 aprovados; cobertura de **82,1%**. A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Frontend:** tsc, eslint e vitest 51/51 ok.
- **Mutações:** as 5 foram pegas.

## Observações

- A tela de Períodos não ganhou teste de componente: o formulário é o mesmo da criação, só com outros textos e outro endpoint no envio. A regra está no backend e coberta.
- **Decisão pendente do dono (B-08):** para levar os alunos de um período ao seguinte, é preciso escolher entre `student_number` único **por período** (migração trocando a constraint para `(student_number, academic_period_id)`) e uma entidade "pessoa" acima de aluno. Com qualquer das duas, a virada vira: clonar, exportar os alunos do período anterior e importar no novo (P-Q2).
