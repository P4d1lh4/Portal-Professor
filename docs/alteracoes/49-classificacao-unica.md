# 49 — Regra de situação única, travada entre backend e frontend (P-06)

## Problema identificado

**P-06 (Médio)**, análise 2026-09 (`04-produto-lacunas.md`). A regra de situação do aluno num módulo estava em várias cópias, sem teste que as mantivesse iguais. A regra é: reprovado por faltas acima do limite; senão final ≥ 7 aprova, 5–7 é recuperação, abaixo reprova.

- **Backend:**
  - `services/classification.py` (a canônica);
  - uma **cópia manual** no boletim em PDF (`StudentModuleLine.status`);
  - dois usos que já passavam pela canônica: CSV de notas e relatório do período.
- **Frontend:**
  - o espelho em `lib/classification.ts`;
  - uma **cópia manual** no selo da ficha do aluno (`GradeStatusBadge`).

Mudar um limiar num lugar deixaria o boletim, a ficha e a tabela de Notas mostrando situações diferentes para o mesmo aluno, sem nenhum teste falhar.

## Objetivo

Uma regra por lado (Python e TypeScript), sem cópias manuais, e uma tabela de casos que os dois lados conferem.

## Arquivos alterados

- `backend/app/services/reports.py`: `StudentModuleLine.status` usa `classify_label`
- `frontend/src/features/students/StudentDetailSheet.tsx`: o selo usa `classifyStatus` (com rótulos próprios da ficha)
- `frontend/src/lib/classification.cases.json` (novo): a tabela de casos
- `frontend/src/lib/classification.test.ts`: confere a tabela
- `backend/tests/test_classification_cases.py` (novo): confere a tabela nas quatro implementações do backend

## Alterações realizadas

- **Boletim em PDF:** a propriedade `status` deixou de repetir os limiares e chama `classify_label`. Os rótulos são os mesmos ("Rep. faltas", "Aprovado", "Recuperação", "Reprovado"), então a coloração da tabela do PDF não muda.
- **Ficha do aluno:** o selo classifica com `classifyStatus` e só mapeia o código para cor e rótulo. A ficha continua dizendo "Reprovado — Faltas" e "Reprovado — Nota", mais explícitos que os da tabela.
- **Tabela de casos** (`classification.cases.json`, 8 casos): as bordas de 7 e 5 (7; 6,99; 5; 4,99), zero, falta acima do limite com nota alta, falta igual ao limite (não reprova) e limite zero.
  - **Vitest:** `lib/classification.ts` confere a tabela.
  - **Pytest:** confere, em cada caso, `classify_status`, o `classify` do CSV de notas, o `status` do boletim em PDF e o `_classify` do relatório do período; e checa que a tabela cobre as quatro situações.

## Motivo técnico

- **Uma tabela, dois leitores:** a regra existe em duas linguagens (a tela precisa dela sem ida ao servidor). Não dá para ter uma implementação só, mas dá para ter uma **fonte de casos** só. Mudar a regra de um lado sem o outro quebra o teste do lado que ficou para trás.
- **O JSON mora no frontend:** a Vercel constrói a partir de `frontend/`, e o import do teste precisa resolver lá dentro. O job de backend do CI faz checkout do repositório inteiro e lê o arquivo pelo caminho relativo.
- **O histograma do dashboard não é cópia:** `_grade_bucket` (faixas 0–4,9 / 5–6,9 / 7–8,9 / 9–10) é uma distribuição, não situação. Ficou como está.

## Impactos positivos

- Boletim, ficha, Notas, CSV e relatório passam a concordar por construção.
- A próxima mudança de regra (por exemplo, a decisão pendente sobre o papel da tutoria, P-11) tem um lugar certo em cada lado e um teste que acusa o esquecimento.

## Testes executados

- **`test_classification_cases.py`:** 8 casos × 4 implementações, mais a cobertura das situações.
- **`classification.test.ts`:** os 4 casos antigos mais os 8 da tabela.
- Suítes completas, tsc e eslint.
- **Provas de mutação:**
  - limiar de aprovação 6,5 no backend;
  - boletim com rótulo próprio;
  - limiar de aprovação 6,5 no frontend.

## Resultado dos testes

✅ **Passou**:
- **Casos:** pytest e vitest verdes.
- **Suítes:** completas verdes. A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Mutações:** as 3 foram pegas.
