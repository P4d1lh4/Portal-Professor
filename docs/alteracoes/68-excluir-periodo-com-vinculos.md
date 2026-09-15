# 68 — Admin exclui período com alunos e tudo o que é dele

## Problema identificado

O admin não conseguia excluir um período com alunos ou módulos. A API respondia 400 ("Desative-o em vez disso") e, desde a 0012 (I-03), o banco também recusa, com FK `RESTRICT`. O dono quer poder excluir, desde que um aviso mostre antes tudo o que vai junto e peça confirmação explícita, no desktop e no celular.

## Objetivo

O admin exclui o período com tudo o que é dele depois de:
1. ver o resumo do que será apagado;
2. marcar a caixa de ciência;
3. clicar em "Confirmar", com o aviso de que não há como voltar atrás.

## Arquivos alterados

- `backend/app/routers/periods.py`: `GET /api/periods/{id}/deletion-summary`, `DELETE /api/periods/{id}?cascade=true`, `_period_links`, `_attachment_paths`, `_delete_period_contents`
- `backend/app/schemas/periods.py`: `PeriodDeletionSummary`
- `backend/tests/test_period_delete.py` (novo)
- `supabase/ci/checks.sql`: check da ordem de exclusão
- `frontend/src/features/periods/DeletePeriodDialog.tsx` e `.test.tsx` (novos)
- `frontend/src/features/periods/PeriodsPage.tsx`: a lixeira abre o diálogo novo; sai o `useConfirm`
- `frontend/src/features/periods/api.ts`: `deletionSummary`; `delete` manda `cascade=true`
- `frontend/src/features/periods/usePeriods.ts`: `useDeletePeriod` invalida o cache inteiro

## Alterações realizadas

- **Resumo** (`GET /periods/{id}/deletion-summary`, só admin). Mostra:
  - as contagens de alunos, módulos, matrículas (cada uma com sua linha de notas e faltas), chamadas, atestados e PDFs;
  - o coordenador e os professores, pelo nome.
- **Exclusão.** Sem vínculos, apaga como antes. Com alunos ou módulos, só com `cascade=true`, nesta ordem:
  1. remove os PDFs do storage;
  2. apaga os alunos;
  3. apaga os módulos;
  4. apaga o período.

  O banco leva o resto em cascata: matrículas com notas e presenças, chamadas, atestados com anexos. Sem o parâmetro, a API responde 400.
- **Período inexistente** passa a dar 404. Antes, gravava auditoria de um período que não existia.
- **Auditoria:** o `before` leva as contagens e os professores.
- **Tela:** diálogo com o resumo em duas listas, "Será excluído" e "Perdem o vínculo (as contas continuam)". Tem ainda:
  - o aviso vermelho de ação permanente;
  - a caixa "Entendo que…";
  - o botão "Confirmar", que só libera com a caixa marcada.

  O conteúdo rola dentro do diálogo (`max-h-[90vh]`), e os botões empilham no celular.

## Motivo técnico

- **As contas ficam.** Coordenador e professores são usuários que podem estar em outros períodos, então a exclusão tira só o vínculo. Excluir usuário continua sendo desativar (`users.py`).
- **Sem migração.** O `RESTRICT` da 0012 (I-03) fica, e o banco segue recusando a exclusão fora da API (SQL Editor, PostgREST direto); é o app que apaga na ordem certa.
  - Uma função plpgsql seria atômica, mas pediria migração em produção sem staging.
  - Em troca, os passos são idempotentes: se um falhar no meio, excluir de novo termina o serviço (`ponytail:` no código).
- **`cascade=true` explícito.** Sem ele a recusa continua. Assim, um front antigo em cache, ainda com o diálogo simples, não apaga tudo.
- **`!inner`.** Matrícula, chamada e atestado não guardam o período; o filtro vai no recurso embutido, e só tira linhas com `!inner` (o mesmo achado da B-03, em `sheets.py`). Conferido num PostgREST real.
- **Os PDFs saem antes das linhas**, como no `delete_certificate`, porque o cascade apaga os registros, não os arquivos. O `fetch_all` pagina os caminhos.
- **Contar pelo módulo basta.** A matrícula exige aluno e módulo do mesmo período (P-Q1). Cada matrícula nasce com sua linha de `grades` (notas e faltas); por isso a tela não traz uma contagem de notas à parte.
- **Checkbox nativo**, sem componente novo: não existe `checkbox.tsx`.
- **Cache inteiro invalidado** depois da exclusão, porque alunos, módulos, notas e chamadas do período somem de várias telas. O resumo fica parado durante a exclusão, para não ser rebuscado depois que o período some.

## Impactos positivos

- O admin exclui um período com vínculos sem SQL à mão e vê antes o que vai junto.
- Os PDFs dos atestados saem do storage junto com as linhas. Não sobra arquivo órfão com dado médico.

## Testes executados

- **`test_period_delete.py` (10 casos):**
  - o resumo, com os filtros `!inner`;
  - 400 sem `cascade`;
  - o cascade na ordem certa, com filtro por período;
  - período sem vínculos;
  - 404;
  - 403 para coordenador e professor.
- **`DeletePeriodDialog.test.tsx` (2 casos):** o resumo aparece e o botão só libera com a caixa; sem resumo, a caixa fica travada.
- **`checks.sql`, em postgres:17 via Docker:** a ordem do app passa pelos triggers da 0003, 0005 e 0013 sem deixar vínculo, e o outro período fica intacto.
- **PostgREST real** (Docker, com as migrações e dois períodos semeados), pelo `TestClient` com o router de verdade:
  - o resumo é exato por período;
  - 400 sem cascade e 204 com cascade;
  - só os PDFs do período vão ao storage;
  - o outro período fica intacto;
  - a auditoria é gravada.
- **Suíte do backend, tsc, eslint e build.**
- **Visual**, no preview local sem backend (cache do TanStack preenchido), em desktop e celular (375 px). No celular:
  - o diálogo ocupa a largura e rola por dentro;
  - "Confirmar" e "Cancelar" ficam empilhados;
  - "Confirmar" só acende com a caixa marcada.
- **Prova de mutação:** aplicada no código, rodada e restaurada, com hash conferido depois.

| Mutação | Testes que falharam |
|---|---|
| **M-B1:** `cascade` ignorado | 1 |
| **M-B2:** apaga alunos sem filtro de período | 1 |
| **M-B3:** matrícula sem `!inner` | 1 |
| **M-B4:** resumo sem `require_role("admin")` | 2 |
| **M-F1:** "Confirmar" liberado sem a caixa | 2 |
| **M-F2:** caixa liberada sem o resumo | 1 |

## Resultado dos testes

✅ **Passou**:
- **Suíte:** 370 passaram e 2 skip. A única falha é `test_me_sem_token_retorna_401`, por ambiente (FastAPI 0.115 local), já registrada na alteração 58. Cobertura de 84%.
- **vitest do diálogo:** 2 de 2. **tsc e eslint:** limpos.
- **`checks.sql`:** "Exclusão de período ok".
- **PostgREST:** depois da exclusão, sobram só o outro período e os dados dele (uma linha por tabela).
- **Mutação:** 6 de 6 pegas.
- **Visual:** ok nos dois tamanhos.

## Observações

- A exclusão não é atômica (ver Motivo técnico). Período muito grande pode demorar, porque cada presença apagada roda o trigger de faltas da 0005.
- O comentário da 0012 ("A API já recusa excluir período com vínculos") ficou desatualizado, mas migração aplicada não se edita.
- No celular, a lixeira continua na coluna de ações da tabela de períodos, alcançada rolando a tabela para o lado, como já era.
