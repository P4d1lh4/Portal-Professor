# 45 — Alunos em risco no dashboard do professor e na Chamada (P-N1 / B-S1 / F-S2)

## Problema identificado

**P-N1 (Alto)**, análise 2026-09 (`04-produto-lacunas.md`). O sistema calcula faltas e notas, mas não avisa ninguém: o professor descobre que um aluno estourou o limite de faltas ou está abaixo da média só no fechamento, quando já não dá para agir. A barra de faltas da tela de Alunos (vermelha a partir de 80%) era o único sinal, e só para quem abria a ficha de cada aluno.

## Objetivo

Mostrar ao professor, antes do fechamento, quem precisa de atenção:
- no dashboard, a lista dos seus alunos em risco;
- na Chamada, onde as faltas acontecem, um destaque na linha do aluno.

## Arquivos alterados

- `backend/app/services/classification.py`: `risk_reasons`
- `backend/app/schemas/modules.py`: campo `risk` em `StudentGradeInfo`
- `backend/app/routers/modules.py`: `GET /modules/{id}/students` devolve o `risk`
- `backend/app/routers/dashboard.py`: `at_risk` no dashboard do professor
- `backend/tests/test_risk.py` (novo)
- `frontend/src/features/grades/api.ts`, `frontend/src/features/grades/RiskBadge.tsx` (novo)
- `frontend/src/features/attendance/AttendancePage.tsx` e o teste dela
- `frontend/src/features/dashboard/AtRiskCard.tsx` (novo) e o teste dele; `DashboardPage.tsx`

## Alterações realizadas

- **Regra única (`risk_reasons`)**, ao lado do `classify_status`:
  - **"faltas":** chegou a 80% do limite ou passou dele. É o mesmo limiar da barra de faltas da UI; com limite zero, qualquer falta conta.
  - **"nota":** já há prova lançada (regular ou recuperação > 0) e a final está abaixo de 5.
- **`GET /api/modules/{id}/students`** (tela de Notas) passa a trazer `risk` em cada aluno.
- **Dashboard do professor** ganha `at_risk`:
  - a lista dos alunos ativos em risco em todos os seus módulos, com módulo, faltas/limite, final e motivos;
  - ordenada do mais urgente: faltas primeiro, porque reprovam sem recuperação, e dentro delas quem tem mais faltas.
- **Card "Alunos em risco"** no dashboard do professor:
  - mostra 8 alunos e resume o resto ("e mais N");
  - cada linha leva às Notas do módulo;
  - sem ninguém em risco, diz isso.
- **Chamada:** a linha do aluno em risco ganha o selo "Em risco: faltas" (ou "nota", ou "faltas e nota").

## Motivo técnico

- **Campo em vez de endpoint novo.** O plano sugeria `GET /modules/{id}/students/at-risk`. O `GET /modules/{id}/students` já traz faltas, notas e o limite do módulo, e é a mesma query que a tela de Notas usa. Um campo calculado no backend serve a Chamada (o selo lê essa query, com cache compartilhado entre as linhas) e fica pronto para o filtro por situação da tela de Notas (F-S1), sem endpoint nem hook novos.
- **A regra fica só no backend.** O frontend só exibe o `risk`. A análise já aponta a regra de classificação espalhada em 4 lugares (P-06); uma cópia no front seria a quinta.
- **"Nota" só depois de prova lançada:** sem isso, no começo do período, com a final 0 para todos, a turma inteira apareceria em risco e o alerta viraria ruído.
- **Conta em inteiros** (`faltas * 5 >= limite * 4`): em float, `35 * 0.8` dá `28.000000000000004`, e o aluno com 28 de 35 faltas ficaria de fora. O teste trava esse caso.
- **Aluno inativo não entra** no card: desativado não é alguém para o professor acompanhar.

## Impactos positivos

- O professor vê, ao entrar, quem está perto de reprovar por faltas ou abaixo da média, com um clique até as notas do módulo.
- Na Chamada, o aluno com faltas acumuladas aparece destacado no momento de marcar mais uma.
- O relatório de período em PDF (P-N2) e o e-mail de aviso (P-N5) podem usar a mesma `risk_reasons`.

## Testes executados

- **`test_risk.py`** (11 casos):
  - limiar de faltas: 70%, 80%, acima do limite, 2 de 3, 3 de 3, 28 de 35 (o caso do float), limite zero;
  - nota só com prova lançada;
  - `GET /modules/{id}/students` com o `risk` de cada aluno;
  - dashboard do professor: ordem por urgência, sem o aluno sem prova e sem o inativo.
- **vitest:**
  - `AtRiskCard.test.tsx` (3 casos): linha com módulo, faltas, final e motivo, e link às Notas; estado vazio; 8 visíveis e "e mais 3";
  - `AttendancePage.test.tsx`, caso novo: só o aluno em risco ganha o selo.
- Suítes completas, `tsc -b` e eslint.
- **Provas de mutação**, aplicadas e restauradas:
  - limiar de 90%;
  - nota sem exigir prova lançada;
  - dashboard incluindo aluno inativo;
  - dashboard sem ordenar;
  - `graded` sempre verdadeiro nas Notas;
  - selo sem checar motivo;
  - card sem o limite de 8.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 11/11 novos; suíte com 290 aprovados; cobertura de **80,5%**. A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Frontend:** vitest 51/51 (+4); tsc e eslint ok.
- **Mutações:** as 7 foram pegas.

## Observações

- **Nota zero de verdade** numa prova conta como "não lançada" e não dispara o alerta de nota. O esquema não distingue 0 lançado de 0 padrão (`DEFAULT 0` em `grades`); resolver isso pede uma coluna de "lançado em", fora deste item.
- **Coordenador não tem o card.** O plano pedia o dashboard do professor. Estender ao coordenador (por período) é o P-N2, no relatório em PDF.
- **Tela de Notas:** não ganhou selo, porque já mostra a situação por aluno (`GradeBadge`). O `risk` fica disponível para o filtro por situação (F-S1).
