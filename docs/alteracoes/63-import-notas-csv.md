# 63 — Import CSV de notas do módulo (P-N9 / B-S7)

## Problema identificado

**P-N9 / B-S7 (Médio)**, análise 2026-09 (`01-backend.md`, `04-produto-lacunas.md`): as notas só entravam célula por célula na tela de Notas ou pelo sync do Google Sheets. O sync tem dois problemas conhecidos:
- **P-07:** casa por matrícula no período inteiro e aplica a mesma linha a todas as matrículas do aluno, porque a planilha não tem coluna de módulo.
- **B-03 (Alto, ainda sem validação com o banco no ar):** o filtro de período provavelmente não funciona, e uma planilha pode gravar notas de alunos de outro período.

Quem já trabalhava com o export de notas do módulo não tinha como devolvê-lo ao sistema.

Achado no caminho: a checagem de acesso a módulo tinha duas cópias, `exports._module_for_export` e `attendance._assert_module_access` (apontadas no registro 59), e o import seria a terceira.

## Objetivo

Importar notas de um CSV por módulo, com o arquivo do export de notas voltando sem edição e sem herdar P-07 nem B-03.

## Arquivos alterados

- `backend/app/routers/import_csv.py`: `_parse_csv` e `_canon` com colunas e aliases por parâmetro; `POST /api/modules/{module_id}/grades/import`
- `backend/app/services/permissions.py`: `assert_module_access`
- `backend/app/routers/exports.py` e `attendance.py`: usam o helper; cópias apagadas
- `backend/tests/test_grades_import.py`: 19 testes
- `frontend/src/features/grades/api.ts` e `useGrades.ts`: `importCsv` e `useImportGrades`
- `frontend/src/features/grades/GradesPage.tsx`: botão "Importar CSV" ao lado do export, com confirmação
- `frontend/src/features/grades/GradesPage.test.tsx`: 2 testes
- `docs/analise-2026-09/05-plano-de-execucao.md`: checkbox

## Alterações realizadas

- **Endpoint** `POST /api/modules/{module_id}/grades/import` (professor, coordenador e admin), em `def`:
  - permissão pelo `assert_module_access`: professor só o próprio módulo; coordenador, os do seu período; admin, todos;
  - período encerrado: 409, com a exceção do admin (`assert_module_period_active`, como no `PUT /grades`);
  - arquivo de até 5 MB, lido pelo parser do import de alunos com `required={"student_number"}` e os aliases do export de notas (Matrícula, Tutoria, Prova regular, Recuperação, Faltas). Nome, Final, Máx. faltas e Status são ignorados;
  - as matrículas vêm com `.eq("module_id", ...)` e `fetch_all`;
  - por linha:
    - célula vazia mantém o valor;
    - nota com vírgula ou ponto, de 0 a 10;
    - faltas inteiras, maiores ou iguais a 0;
    - matrícula fora do módulo vai para `not_found`;
    - matrícula repetida no arquivo vira erro;
    - a final é recalculada com a nota do banco nos campos que ficaram vazios;
  - um registro de auditoria agregado (`grades`, id do módulo, contagens).
- **`services/permissions.assert_module_access`:** a checagem que estava copiada em `exports` e `attendance`, sem mudança de regra. O `select` junta as colunas que os dois usavam.
- **Front:**
  - "Importar CSV" ao lado de "Exportar CSV" na tela de Notas, desabilitado com período encerrado;
  - pede confirmação ("substituem as atuais deste módulo"), envia e mostra quantos alunos mudaram;
  - erros de linha e matrículas fora do módulo aparecem num aviso, com as 3 primeiras e a contagem do resto.

## Motivo técnico

- **Por módulo, não por período.** O sync da planilha casa no período e repete a nota em todos os módulos do aluno (P-07), e o filtro de período dele está sob suspeita (B-03). Reaproveitar `_apply_sheet_grades` levaria os dois problemas para uma porta nova. Por módulo, o filtro é uma coluna da própria tabela, e o arquivo certo é o próprio export.
- **Recusa em vez de ajustar.** O `PUT /grades` ajusta a nota para 0–10, e a tela mostra o valor na hora, com toast. Num lote, "85" no lugar de "8,5" viraria 10 sem ninguém ver.
- **Sem pré-visualização (`dry_run`).** A confirmação avisa que as notas serão substituídas, o resultado lista o que não entrou e o export do módulo mostra o estado depois. Um preview como o do import de alunos pediria outra tela.
- **O endpoint fica em `import_csv.py`,** ao lado do parser que reaproveita. Em `grades.py` ele teria que importar uma função privada de outro router.
- **Sem transação.** Cada linha é um update independente, como no sync da planilha. Se algo falhar no meio, as linhas anteriores ficam gravadas, e repetir o import dá o mesmo resultado.
- **O sync da planilha fica como está.** P-07 é decisão de produto, e o B-03 precisa do banco no ar para ser validado.

## Impactos positivos

- Professor e coordenador lançam as notas de uma turma no Excel e devolvem o arquivo ao sistema.
- Uma checagem de acesso a módulo em vez de três.

## Testes executados

- **pytest (`test_grades_import.py`, 19):**
  - permissão por papel, dono e não dono (5); módulo inexistente (1); período encerrado, com professor 409 e admin 200 (2);
  - ida e volta com o CSV do `build_grades_csv` (BOM, `;`, vírgula decimal, acentos), conferindo o filtro `module_id`;
  - célula vazia mantém o valor, e a final usa a prova do banco (prova 9,0 com recuperação 7 continua 9,0);
  - 6 valores inválidos: 11, -0,5, abc e nan na prova; -1 e 2,5 nas faltas;
  - matrícula fora do módulo e matrícula repetida;
  - CSV sem Matrícula: 422;
  - auditoria agregada.
- **vitest (`GradesPage.test.tsx`, 2):** confirmação, envio do arquivo para o módulo e resumo; cancelar não envia.
- **Suítes:** backend inteira; frontend com lint, typecheck, vitest e build.
- **Provas de mutação:** 13, cada uma alterada no código, rodada e restaurada, com hash conferido depois. Nas do backend rodou a suíte inteira, porque o helper serve Chamada, exports e import.

| Mutação | Testes que falharam |
|---|---|
| **B1:** import sem checar o módulo | 4 |
| **B2:** import sem a trava de período | 2 |
| **B3:** matrículas sem o filtro `module_id` | 2 |
| **B4:** nota fora de 0–10 aceita | 4 |
| **B5:** falta negativa aceita | 2 |
| **B6:** final ignora a prova do banco | 2 |
| **B7:** matrícula repetida aceita | 3 |
| **B8:** import sem auditoria | 2 |
| **B9:** helper sem checar o professor | 5 |
| **B10:** helper sem checar o coordenador | 5 |
| **F1:** importa sem confirmar | 1 |
| **F2:** envia para outro módulo | 1 |
| **F3:** esconde as matrículas não encontradas | 1 |

O caso do teste da célula vazia foi trocado antes das mutações. Com prova 4 no banco e recuperação 7, a final dava 7 com ou sem a nota do banco, e a B6 passaria.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 356 passaram e 2 skip. Única falha: `test_me_sem_token_retorna_401`, por ambiente (FastAPI 0.115 local; o CI usa 0.141.1).
- **Frontend:** vitest 83/83; lint sem erros (os 17 avisos já existiam); typecheck e build ok.
- **Mutações:** as 13 foram mortas.

## Observações

- **Sync da planilha:** segue com P-07 (decisão) e B-03 (validar depois do restore). Com o import por módulo, vale decidir se o sync ainda precisa existir.
- **Não conferido no navegador.** O botão segue o padrão do "Exportar CSV" ao lado, e o vitest cobre o fluxo.
