# 46 — Seção "Atenção" no relatório de período em PDF (P-N2)

## Problema identificado

**P-N2 (Alto)**, análise 2026-09 (`04-produto-lacunas.md`), extensão do P-N1. O relatório do período em PDF, que é a visão do coordenador, só trazia o consolidado (aprovados, em recuperação, reprovados) e a situação final de cada aluno. Quem ainda podia ser ajudado antes do fechamento (perto do limite de faltas, abaixo da média) não aparecia destacado. O coordenador só via o problema quando ele já era reprovação.

## Objetivo

Pôr no relatório do período a mesma lista de alunos em risco que o professor passou a ver no dashboard (alteração 45), com a mesma regra e a mesma ordem.

## Arquivos alterados

- `backend/app/services/classification.py`: `grade_risk` e `risk_sort_key`
- `backend/app/services/reports.py`: `AttentionLine`, `PeriodReportData.attention` e a seção no PDF
- `backend/app/routers/reports.py`: monta a lista no `period_report`
- `backend/app/routers/dashboard.py` e `backend/app/routers/modules.py`: passam a usar os helpers
- `backend/tests/test_period_report_attention.py` (novo)

## Alterações realizadas

- **Seção "Atenção (N)" no PDF do período**, entre o resumo e a tabela de alunos:
  - uma linha por aluno e módulo em risco, com matrícula, aluno, módulo, faltas/limite, final e motivo ("faltas", "nota" ou "faltas e nota");
  - do mais urgente ao menos;
  - sem ninguém em risco, uma frase diz isso.
- **`grade_risk(grade, max_absences)`:** aplica o `risk_reasons` a uma linha de `grades` como vem do banco, incluindo a definição de "prova lançada" (regular ou recuperação acima de zero).
- **`risk_sort_key(reasons, absences, name)`:** a ordem de urgência. Faltas primeiro, porque reprovam sem recuperação; depois mais faltas; depois nome.
- **Os três consumidores usam os helpers:** Notas (`/modules/{id}/students`), dashboard do professor e relatório. Antes, a checagem de "prova lançada" estava repetida em dois deles, e ia para o terceiro.

## Motivo técnico

- **Mesma regra, mesmo resultado:** professor e coordenador precisam ver os mesmos alunos em risco. Com `grade_risk` e `risk_sort_key` num lugar só, não há como o card e o PDF divergirem.
- **Uma linha por módulo:** a ação é por módulo. O aluno em risco em dois módulos aparece duas vezes, cada uma com o dado daquele módulo.
- **Teste sem abrir o PDF:** o reportlab comprime o conteúdo das páginas, e procurar texto nos bytes seria frágil. O teste captura o `PeriodReportData` que o router entrega ao gerador e confere a lista. Um segundo teste garante que o PDF é gerado com e sem a seção.

## Impactos positivos

- O coordenador vê no relatório do período quem precisa de intervenção, na ordem de urgência.
- A definição de risco fica num único módulo (`services/classification.py`), pronta para o e-mail de aviso (P-N5).

## Testes executados

- **`test_period_report_attention.py`** (2 casos):
  - o relatório lista quem precisa de atenção, com faltas antes de nota e sem o aluno sem prova lançada, sem alterar o consolidado;
  - o PDF sai com e sem alunos na seção.
- **`test_risk.py`** (alteração 45), que segue valendo depois da troca pelos helpers.
- Suíte completa.
- **Provas de mutação:**
  - `grade_risk` sem exigir prova lançada;
  - relatório sem a seção de atenção (lista vazia);
  - relatório sem ordenar.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 2/2 novos; suíte com 292 aprovados; cobertura de **81,8%** (antes 80,5%). A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Mutações:** as 4 foram pegas (prova lançada, seção de atenção, ordenação e chave de urgência).

## Observações

- O **boletim individual** (`build_student_report_pdf`) segue com a própria cópia da regra de situação (`StudentModuleLine.status`). Unificar as cópias com `classify_status` é o P-06, item separado do plano.
