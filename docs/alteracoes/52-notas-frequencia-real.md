# 52 — Frequência real na tela de Notas (P-N4)

## Problema identificado

**P-N4 (Médio)**, análise 2026-09 (`04-produto-lacunas.md`). A tela de Notas mostrava as faltas de cada aluno e o limite do módulo ("máximo de 10 faltas"), mas não quantas aulas já tinham acontecido. Três faltas no fim do semestre é pouco; nas primeiras quatro aulas é alarmante. O dado existia (as chamadas registradas), só não aparecia.

## Objetivo

Mostrar as faltas em relação às aulas já registradas, ao lado do limite, sem calendário acadêmico. O calendário é o P-N8, maior, e o P-N4 é o MVP barato dele.

## Arquivos alterados

- `frontend/src/features/grades/GradesPage.tsx`
- `frontend/src/features/grades/GradesPage.test.tsx` (+2 casos)

## Alterações realizadas

- **Cabeçalho do módulo:** passa a dizer, por exemplo, "Anatomia · máximo de 10 faltas · 12 chamadas registradas".
- **Coluna Faltas:** cada aluno ganha, abaixo do campo, "N% das aulas" (faltas ÷ chamadas registradas), com dica explicando o cálculo.
- **Sem chamada registrada:** nada aparece, para não mostrar percentual sobre zero aulas.

## Motivo técnico

- **Sem endpoint novo:** o número de chamadas vem da mesma lista de chamadas do módulo que a tela de Chamada usa no histórico (`useModuleAttendance`), com cache compartilhado.
- **Faltas das Notas sobre chamadas da Chamada:** se as faltas foram editadas à mão (P-08, decisão pendente sobre qual fonte vence), o percentual pode passar de 100%. Ele fica visível de propósito, porque é justamente o sinal da divergência que o P-08 descreve.

## Testes executados

- **`GradesPage.test.tsx`:**
  - com 4 chamadas registradas, o cabeçalho diz "4 chamadas registradas" e a Ana (2 faltas) mostra "50% das aulas";
  - sem chamadas, nem o percentual nem a contagem aparecem.
- tsc, eslint e a suíte do frontend.
- **Prova de mutação:** percentual calculado sobre uma base errada.

## Resultado dos testes

✅ **Passou**: vitest verde, tsc e eslint ok. A mutação foi pega.
