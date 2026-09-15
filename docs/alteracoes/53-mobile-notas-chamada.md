# 53 — Notas e Chamada no celular (F-08)

## Problema identificado

**F-08 (Alto, UX)**, análise 2026-09 (`02-frontend.md`). As telas de Notas (9 colunas) e Chamada só tinham `overflow-x-auto`: no celular, a tabela exigia rolagem horizontal. "Fazer a chamada andando pela sala com o celular" é o caso de uso clássico da tela. As telas de Alunos e Usuários já tinham cards abaixo de `md`; Notas e Chamada não.

## Objetivo

Um layout em cards abaixo de `md` nas duas telas, sem mudar o desktop.

## Arquivos alterados

- `frontend/src/components/ui/card-table.ts` (novo): as classes compartilhadas da conversão tabela → cards
- `frontend/src/features/attendance/AttendancePage.tsx`
- `frontend/src/features/grades/GradesPage.tsx`

## Alterações realizadas

- **Tabela que vira card só com CSS.** Abaixo de `md`:
  - tabela e corpo viram blocos e o cabeçalho some;
  - cada linha vira um card em grid;
  - a partir de `md`, `md:table`, `md:table-row` e afins devolvem a tabela intacta.
- **Chamada no celular:**
  - nome e matrícula (com o selo de risco) à esquerda, botões **P/F/J** à direita;
  - os botões passam de 32 px para **44 px** de altura, o alvo de toque mínimo;
  - a coluna de texto do status some no card, porque o botão ativo já mostra o estado.
- **Notas no celular:** um card por aluno, em quatro colunas:
  - nome;
  - matrícula e situação;
  - Tutoria, Prova, Recup. e Faltas, com rótulo em cada campo e o "% das aulas" embaixo das faltas;
  - Final e o indicador "salvo".

  Os rótulos saem de `data-label` via `::before` e somem no desktop, onde o cabeçalho da tabela rotula. Os campos ocupam a largura da coluna no celular (`w-full md:w-20`).

## Motivo técnico

- **Uma marcação só, e não uma lista de cards duplicada.** Duplicar as linhas para o celular dobraria no DOM cada campo e cada botão:
  - campos com o mesmo nome acessível e testes quebrando por elemento repetido;
  - a navegação por setas das Notas precisaria de um segundo mapa de refs;
  - a lógica da linha (salvar, rascunho, risco) ficaria em dois lugares.

  Com CSS, a linha é a mesma e só a disposição muda.
- **Classes num módulo só** (`card-table.ts`): as duas telas convertem tabela, cabeçalho, corpo, célula e rótulo do mesmo jeito; cada uma define só o grid do próprio card.

## Impactos positivos

- A chamada pode ser feita no celular sem rolagem lateral e com botões do tamanho do dedo.
- As notas cabem na tela do celular, com cada campo rotulado.

## Testes executados

- **Verificação visual** numa página de preview local, não versionada, que renderiza as duas telas com o cache do TanStack preenchido (cinco alunos, riscos e 12 chamadas), sem backend:
  - Chamada e Notas em 375 px (celular);
  - Chamada e Notas em 800 px (tabela de desktop).

  Um desalinhamento dos campos das Notas no celular (a célula de Faltas, mais alta por causa do "% das aulas") foi corrigido com `items-start` e conferido de novo.
- tsc, eslint e vitest (67/67): os testes das duas telas usam papéis e rótulos, e seguem verdes porque a marcação não mudou.

## Resultado dos testes

✅ **Passou**: layout conferido nas duas larguras; tsc, eslint e vitest ok.

## Observações

- **Semântica de tabela no celular:** trocar o `display` de `<table>/<tr>/<td>` faz Chrome e Safari deixarem de anunciar a estrutura de tabela abaixo de `md`. Os campos e botões mantêm os nomes acessíveis ("Marcar Ana Souza como falta", "Prova regular de Ana Souza"), então o uso por leitor de tela segue possível. No desktop a tabela fica intacta.
- **Sem teste automatizado do layout:** o jsdom não aplica CSS. A verificação ficou visual.
