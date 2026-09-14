# 32 — Fase 1 (frontend): F-01 a F-06, F-16

## Problema identificado

Achados de frontend da Fase 1 da análise de 2026-09 (`docs/analise-2026-09/02-frontend.md`):

- **F-01 (Alto):** na Chamada, trocar de módulo ou de data descartava sem aviso a chamada marcada e não salva.
- **F-02:** nenhuma mutation invalidava o `["dashboard"]`; com `staleTime` de 3 min, contagens e taxa de aprovação ficavam velhas depois de qualquer alteração.
- **F-03:** quatro `confirm()` nativos sobraram (`ModulesPage`, `PeriodsPage`, `UsersPage` ×2), fora do tema e do design system.
- **F-04:** fragment sem `key` na lista da auditoria (warning do React e risco de reconciliação errada ao expandir linhas).
- **F-05:** nota final com ponto ("7.5") na tela de Notas e com vírgula ("7,5") no detalhe do aluno.
- **F-06:** os inputs de nota não tinham `aria-label`; o leitor de tela anunciava só "spinbutton, 7".
- **F-16:** um `console.error` do `useAuth` escapava do guard de desenvolvimento.

## Objetivo

Fechar os achados de frontend da Fase 1.

## Arquivos alterados

- `frontend/src/features/attendance/AttendancePage.tsx`
- `frontend/src/lib/queryClient.ts`
- `frontend/src/features/modules/ModulesPage.tsx`, `features/periods/PeriodsPage.tsx`, `features/users/UsersPage.tsx`
- `frontend/src/features/audit/AuditLogPage.tsx`
- `frontend/src/lib/utils.ts`, `features/grades/GradesPage.tsx`, `features/students/StudentDetailSheet.tsx`
- `frontend/src/hooks/useAuth.ts`

## Alterações realizadas

- **F-01:** `confirmDiscard()` na Chamada. Com rascunho sujo, trocar módulo, data ou clicar numa chamada do histórico abre o `useConfirm` ("Descartar a chamada não salva?"). Cancelar mantém a seleção atual, porque os controles são controlados.
- **F-02:** um `MutationCache.onSuccess` no `queryClient` invalida `["dashboard"]` depois de **qualquer** mutation bem-sucedida, em vez de repetir a linha em 10 hooks. Cobre também import CSV, sync de planilha e atestados, que o plano não listava. Se o dashboard não estiver montado, a query só é marcada como velha e não há requisição.
- **F-03:** os 4 `confirm()` passam para o `useConfirm` (destrutivo em excluir e desativar).
- **F-04:** `<Fragment key={entry.id}>`; as `key` internas, que ficaram redundantes, saíram.
- **F-05:** `formatGrade()` em `lib/utils.ts`, usada nos 3 pontos.
- **F-06:** `GradeCell` recebe `ariaLabel` obrigatório: "Tutoria de {nome}", "Prova regular de…", "Recuperação de…", "Faltas de…".
- **F-16:** `debugError` no lugar do `console.error`.

## Motivo técnico

O `invalidateQueries` global é o ponto por onde toda escrita passa: cobrir hook a hook deixaria de fora a próxima mutation criada. O `queryClient` ganhou anotação de tipo explícita porque o callback referencia a própria instância (TS7022).

## Impactos positivos

- Nenhuma chamada perdida por clique distraído.
- Dashboard coerente logo depois de lançar nota, chamada, aluno ou módulo.
- Diálogos de confirmação iguais em todo o app; nota com vírgula em todo lugar; grade de notas navegável por leitor de tela.

## Testes executados

`npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build` (com os stubs de env do CI).

## Resultado dos testes

✅ **Passou**: lint sem erros (os arquivos alterados saem sem nenhum warning; os 18 warnings do repo são de outros arquivos), tsc limpo, vitest 7/7, build ok.

O `node_modules` local ainda estava com Vite 5.4 (anterior ao #60), e o build falhava em `vite.config.ts`. Um `npm ci` resolveu, e o build passou com o Vite 8.3 do lockfile.

## Observações

- A navegação para fora da página (menu lateral) com rascunho sujo ainda não pede confirmação. O `useBlocker` do React Router, opcional no plano, fica para a migração ao react-router 7.
- Sem teste de componente: a infra (jsdom + Testing Library) é o F-17a, na Fase 2. A suíte da Chamada (F-17b) deve cobrir o F-01.
