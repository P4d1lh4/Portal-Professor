# 48 — Export CSV da frequência do módulo (P-Q4 / B-S4 / F-S4)

## Problema identificado

**P-Q4 (Médio)**, análise 2026-09 (`04-produto-lacunas.md`). As notas do módulo tinham export CSV, mas a frequência não. Para guardar ou entregar a chamada do semestre (documentação da turma, conferência com a secretaria), professor e coordenador não tinham como tirar os dados do sistema, a não ser copiando dia por dia.

## Objetivo

Exportar a frequência de um módulo num CSV que abra direto no Excel pt-BR, no mesmo padrão do export de notas.

## Arquivos alterados

- `backend/app/services/exports.py`: `AttendanceExportRow` e `build_attendance_csv`
- `backend/app/routers/exports.py`: `GET /api/modules/{id}/attendance.csv`; o helper `_module_for_export`, compartilhado com o export de notas
- `backend/tests/test_attendance_export.py` (novo)
- `frontend/src/features/exports/api.ts` e `useExports.ts`: download e hook
- `frontend/src/features/attendance/AttendancePage.tsx`: botão "Exportar CSV"; teste da página (+1 caso)

## Alterações realizadas

- **Formato:** matriz com uma linha por aluno matriculado e uma coluna por dia de chamada, no formato `dd/mm/aaaa` e em ordem cronológica.
  - Cada célula traz **P**, **F** ou **J**, as mesmas letras dos botões da Chamada. Fica vazia se não há marcação do aluno naquele dia, por exemplo quando ele foi matriculado depois.
  - No fim de cada linha: **Faltas na chamada** e **Justificadas**.
- **Mesmo padrão do export de notas:** UTF-8 com BOM, separador `;` e proteção contra fórmula (nome começando com `=` vira texto).
- **Mesmas permissões do export de notas:** professor só do próprio módulo; coordenador só dos seus períodos; admin qualquer um. A checagem saiu do export de notas para `_module_for_export`, e os dois usam o helper.
- **Botão "Exportar CSV"** no cabeçalho da Chamada, para o módulo ativo, igual ao da tela de Notas.

## Motivo técnico

- **`/attendance.csv`, e não `/attendance/export.csv`** como no export de notas (`/grades/export.csv`): a Chamada já tem `GET /api/modules/{id}/attendance/{data}`, e o FastAPI casaria "export.csv" como a data, respondendo 422. Os testes de endpoint pegaram o conflito.
- **Matriz em vez de uma linha por marcação:** é o formato da chamada impressa, legível no Excel sem tabela dinâmica.
- **"Faltas na chamada":** a coluna de faltas das Notas pode ter sido editada à mão (P-08, decisão pendente sobre qual fonte vence). O export conta só o que está na chamada e diz isso no cabeçalho.
- **Marcações pelo id das chamadas (`in_`):** um módulo tem umas 60 chamadas por semestre, que cabem na URL. O teto está anotado no código (`ponytail:`).

## Impactos positivos

- A frequência do semestre sai do sistema em um clique, no formato em que costuma ser entregue.
- O export de notas e o de frequência passam a ter a mesma regra de permissão, num lugar só.

## Testes executados

- **`test_attendance_export.py`:**
  - builder: matriz com as datas em `dd/mm/aaaa`, P/F/J, marcação vazia e totais, com a fórmula neutralizada; módulo sem chamadas;
  - endpoint: professor do módulo baixa o arquivo com nome e conteúdo certos, e as marcações são buscadas pelas chamadas do módulo;
  - permissões: professor de outro módulo e coordenador de outro período recebem 403; coordenador dono e admin, 200; módulo inexistente, 404.
- **Testes antigos de export** (`test_exports*.py`): seguem verdes depois da extração do helper de permissão.
- **vitest:** o botão "Exportar CSV" da Chamada baixa a frequência do módulo ativo.
- Suíte completa, tsc e eslint.
- **Provas de mutação:**
  - sem contar as faltas;
  - letra errada para falta;
  - nome sem proteção contra fórmula;
  - professor de outro módulo exportando;
  - marcações ignoradas.

## Resultado dos testes

✅ **Passou**:
- **Backend:** testes novos e antigos de export verdes; suíte completa verde. A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Frontend:** vitest (52/52), tsc e eslint ok.
- **Mutações:** as 5 foram pegas.
