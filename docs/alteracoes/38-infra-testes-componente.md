# 38 — Infra de testes de componente no frontend (F-17a)

## Problema identificado

**F-17 (Alto)**, análise 2026-09, `02-frontend.md`: o frontend não tinha nenhum teste de componente nem infraestrutura para eles. O `vite.config.ts` não tinha `environment: "jsdom"` nem `setupFiles`, e o Testing Library não estava instalado. Os 7 testes existentes cobrem só funções puras (`lib/classification`, `lib/grades`). Telas com regra de negócio (Chamada, Notas, `useAuth`, interceptors do axios) não tinham rede de segurança.

## Objetivo

Montar a infra (F-17a) e provar que ela funciona com um componente real, deixando o F-17b só com a escrita das suítes.

## Arquivos alterados

- `frontend/package.json`, `frontend/package-lock.json`
- `frontend/vite.config.ts`
- `frontend/src/test/setup.ts` (novo)
- `frontend/src/components/shared/ConfirmDialog.test.tsx` (novo)

## Alterações realizadas

- **Dependências de dev:**
  - `jsdom` 29.1;
  - `@testing-library/react` 16.3, com o `@testing-library/dom` 10.4 como peer;
  - `@testing-library/jest-dom` 7.0;
  - `@testing-library/user-event` 14.6.
- **`vite.config.ts`:** bloco `test` com `environment: "jsdom"` e `setupFiles: ["./src/test/setup.ts"]`. Também a referência `/// <reference types="vitest/config" />`, porque o arquivo entra no `tsc -b` pelo `tsconfig.node.json` e, sem ela, o `test` não tipa.
- **`src/test/setup.ts`:** carrega os matchers do jest-dom (`toBeInTheDocument`, `toHaveTextContent`...) e faz `cleanup()` depois de cada teste. Sem `globals: true`, o Testing Library não desmonta sozinho.
- **Smoke test `ConfirmDialog.test.tsx`:** o `useConfirm` sobre o Dialog do Radix, em 3 casos. Confirmar resolve `true`; Cancelar e Esc resolvem `false`; em todos o diálogo fecha. Escolhido por ser pequeno, usado em 8 telas e exercitar portal, foco e teclado do Radix no jsdom.

## Motivo técnico

- **`msw` ficou de fora**, embora o plano o listasse: nenhum teste ainda precisa simular rede. Entra no F-17b, com a primeira suíte que precisar (interceptors do axios ou o PUT da GradesPage).
- **jsdom em vez de happy-dom**, como o plano pede: é o mais fiel para Radix (portal, foco, `pointer-events`).
- O `environment` é global, e os testes puros também rodam em jsdom. Separar por projeto/arquivo só vale se o tempo incomodar.

## Impactos positivos

- O F-17b começa escrevendo teste, não configurando ferramenta.
- O `useConfirm`, que protege exclusões e agora o rascunho da Chamada (F-01), fica travado.

## Testes executados

- `npm run lint`, `npx tsc --noEmit`, `npx vitest run` e `npm run build` (com os stubs de env do CI).
- **Prova de mutação:** `settle()` do `useConfirm` alterado temporariamente para sempre resolver `true`, e restaurado depois.

## Resultado dos testes

✅ **Passou**: vitest 10/10 (7 antigos e 3 novos); lint sem erros (os 18 warnings já existiam; os arquivos novos saem limpos); tsc e build ok. Na mutação, os testes de Cancelar e Esc falham.

## Observações

- O jsdom 29 exige Node `^20.19 || ^22.13 || >=24`. O CI usa a imagem `node 20` (resolve para a 20.19 ou mais nova) e o ambiente local tem Node 22.21. O Node 20 está sem suporte desde 2026-04-30; a atualização dele no CI e no `frontend/Dockerfile` segue pendente, fora deste item.
- O primeiro run local levou ~27 s, a maior parte montando o jsdom a frio no Windows; com cache quente, **~3 s** para os 10 testes.
