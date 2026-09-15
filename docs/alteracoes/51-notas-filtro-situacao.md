# 51 — Filtro por situação na tela de Notas (F-S1)

## Problema identificado

**F-S1 (Alto)**, análise 2026-09 (`02-frontend.md`). A tela de Notas só tinha busca por nome ou matrícula. Com uma turma de 60 alunos, achar quem está em recuperação ou reprovado por faltas exigia rolar a tabela inteira olhando a coluna de situação.

## Objetivo

Filtrar a tabela pela situação, com a mesma regra que calcula a situação em todo o sistema.

## Arquivos alterados

- `frontend/src/features/grades/situation.ts` (novo): `matchesSituation` e as opções
- `frontend/src/features/grades/situation.test.ts` (novo)
- `frontend/src/features/grades/GradesPage.tsx`: seletor e filtro
- `frontend/src/features/grades/GradesPage.test.tsx` (+2 casos)

## Alterações realizadas

- **Seletor "Filtrar por situação"** ao lado da busca, com as opções: Todas as situações, Em risco, Aprovado, Recuperação, Reprovado por nota e Reprovado por faltas.
- **Filtro combinado com a busca:**
  - as quatro situações usam `classifyStatus`, a regra única da alteração 49;
  - "Em risco" usa o `risk` que o backend já calcula (alteração 45).
- **Texto de filtro ativo:** com busca ou filtro ligados, a contagem diz "N alunos encontrados", e a tela vazia diz "Tente outro nome, matrícula ou situação".

## Motivo técnico

- **Regra de fora:** o filtro não reimplementa a situação. "Em risco" também não: quem define é `risk_reasons`, no backend.
- **`<select>` nativo,** como o seletor de matrícula da ficha do aluno: sem ganho em usar o Radix aqui, e o nativo funciona melhor no celular e no teste.
- **Filtro no cliente:** a tela de Notas já carrega o módulo inteiro (uma turma) para edição inline, então filtrar no navegador não custa nada.

## Testes executados

- **`situation.test.ts`:** sem filtro todo mundo passa; cada situação pela regra única, com as faltas vencendo a nota; "Em risco" pelo `risk` do backend.
- **`GradesPage.test.tsx`:** escolher "Recuperação" mostra só a Ana, com o texto "1 aluno encontrado"; "Em risco" mostra só o aluno com risco.
- tsc, eslint e a suíte do frontend.
- **Provas de mutação:** "Em risco" sempre verdadeiro; filtro de situação desligado.

## Resultado dos testes

✅ **Passou**: vitest verde, tsc e eslint ok. As 2 mutações foram pegas.
