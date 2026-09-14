# 28 — Vite 8 (Rolldown) + plugin-react 6 + vitest 4

## Problema identificado

O PR #52 do Dependabot (vite 5 → 8) estava com CI vermelho: o `npm ci` falhava com ERESOLVE porque `@vitejs/plugin-react@4` e `vitest@2` só aceitam o Vite 5. Destravada a instalação, o build quebrava com `TypeError: manualChunks is not a function`.

## Objetivo

Levar o frontend para o Vite 8 sem mudar o comportamento do bundle.

## Arquivos alterados

- `frontend/package.json` / `frontend/package-lock.json`
- `frontend/vite.config.ts`

## Alterações realizadas

- `vite` ^5.4 → ^8.3.0, `@vitejs/plugin-react` ^4.3 → ^6.1.1, `vitest` ^2.1 → ^4.1.11 (o 4.1 aceita Vite 8 e ainda roda em Node 20; o vitest 5 exige Node 22).
- `build.rollupOptions` → `build.rolldownOptions` (nome novo no Vite 8).
- `manualChunks` de objeto para função, porque o Rolldown não aceita a forma objeto. Os dois grupos (`vendor-react`, `vendor-charts`) continuam os mesmos, agora por regex no caminho do `node_modules`.
- `__dirname` → `import.meta.dirname` no alias `@` (aviso do Vite 8 sobre o `configLoader: 'native'`).

## Motivo técnico

A instalação precisou ser `npm uninstall` + `npm install` do trio: um `esbuild@0.21` herdado do Vite 5 ficava no topo da árvore e conflitava com o peer opcional `esbuild ^0.27 || ^0.28` do Vite 8, travando o resolver. Desinstalar remove esse órfão sem adicionar dependência direta.

A regex replica o que a forma objeto fazia (o pacote e suas dependências): React + `react-router`/`@remix-run/router`/`scheduler`; Recharts + `d3-*`/`victory-vendor`.

## Impactos positivos

- Build de ~16–23 s para ~2 s.
- Chunks equivalentes: `vendor-react` 207 → 199 kB, `vendor-charts` 372 → 374 kB, `index` principal 342 → 327 kB.
- Resolve o #52: o Dependabot fecha o PR ao ver vite ≥ 8.2 em `main`.

## Testes executados

`eslint` (0 erros, 4 warnings pré-existentes), `tsc --noEmit`, `vitest` (7), `npm run build`.

## Resultado dos testes

✅ **Passou**.

## Observações

- O Node 20 está fora de suporte desde 2026-04-30, mas o CI e o `frontend/Dockerfile` ainda usam 20. Subir para 22 quando for conveniente (isso também libera o vitest 5).
- O preview da Vercel valida o build no ambiente real de deploy.
