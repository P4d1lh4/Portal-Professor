# 23 — Bundle: manualChunks + limpeza de configs compilados (M9)

## Problema identificado

O build emitia aviso de chunk > 500 kB (o `index` principal tinha ~549 kB), e não havia separação de vendors — código de terceiros (React, Router, recharts) ficava misturado ao código de app, invalidando o cache de longo prazo (que o `vercel.json` já habilita com `immutable` em `/assets`) a cada deploy. Além disso, os artefatos compilados `vite.config.js` e `vite.config.d.ts` estavam **versionados** (a fonte é o `.ts`, que o Vite lê direto).

## Objetivo

Isolar os vendors estáveis para melhorar o cache e eliminar o aviso de tamanho, e parar de versionar configs compilados.

## Arquivos alterados

- `frontend/vite.config.ts` (manualChunks)
- `.gitignore` (ignora os configs compilados)
- Removidos do tracking: `frontend/vite.config.js`, `frontend/vite.config.d.ts`

## Alterações realizadas

- `build.rollupOptions.output.manualChunks`: `vendor-react` (react, react-dom, react-router-dom) e `vendor-charts` (recharts).
- `git rm --cached` dos configs compilados + regra no `.gitignore` (`*.tsbuildinfo` já era ignorado).

## Motivo técnico

`manualChunks` por objeto (pacotes explícitos) é a forma mais simples que atinge o objetivo: isola os vendors mais pesados/estáveis. `recharts` (o mais pesado) só é importado pelo `DashboardPage` (lazy), então `vendor-charts` só é baixado quando o dashboard carrega. Os configs compilados são saída de build — versioná-los gera ruído e diffs espúrios a cada `tsc -b`.

## Impactos positivos

- Chunk principal: **549 kB → 341 kB**; sem aviso de > 500 kB.
- `vendor-react` (207 kB) e `vendor-charts` (372 kB) isolados → cache de longo prazo estável entre deploys.
- Fim de diffs espúrios de `vite.config.js`.

## Testes executados

- `npm run build` → sucesso, sem aviso de tamanho; chunks conforme acima.
- `npm run test` (7), `eslint` (0 erros), `tsc --noEmit` (limpo).

## Resultado dos testes

✅ **Passou** — build/test/lint/tsc limpos.

## Observações

- Memoização de células (`React.memo` em GradeCell/StatusButton) **NÃO** foi feita: os callbacks passados às células são recriados a cada render (`makeRef`/`handleKeyNav`/`onCommit` inline), então `React.memo` sem estabilizá-los seria inócuo; estabilizá-los é um refactor que arrisca a navegação por teclado e precisa de teste de componente antes. Fica no backlog (M9b).
