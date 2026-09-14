# 30 — recharts 3, eslint 10 e npm audit fix (frontend)

## Problema identificado

- **#64** (recharts 2 → 3) estava vermelho: em `DashboardPage.tsx:139`, o `formatter` do Tooltip anotado como `(v: number)` não é compatível com o `ValueType` do recharts 3.
- **#66** (eslint 9 → 10) estava vermelho com `Cannot find package '@eslint/js'`. O `eslint.config.js` importa `@eslint/js` e `globals`, que no ESLint 9 chegavam por hoisting e não estavam no `package.json`.
- Parte frontend do B-01: advisories de produção no `npm audit`.

## Objetivo

Destravar os dois majors e zerar o que o `npm audit fix` resolve sem breaking change.

## Arquivos alterados

- `frontend/package.json` / `frontend/package-lock.json`
- `frontend/src/features/dashboard/DashboardPage.tsx`
- `frontend/vite.config.ts`

## Alterações realizadas

- `recharts` ^2.15 → ^3.10.1; o `formatter` perdeu a anotação `(v: number)` e o tipo passa a ser inferido.
- `eslint` ^9 → ^10, com `@eslint/js` ^10 e `globals` ^17 como devDependencies explícitas.
- `npm audit fix` (sem `--force`).
- `vite.config.ts`: sai o grupo manual `vendor-charts`. Com o recharts 3, que depende de `react-redux`, o grupo arrastava o `react-dom` para dentro dele, e o `index.html` passava a carregar o chunk de gráficos (496 kB) em toda página, inclusive no login. Sem o grupo, o split automático deixa recharts + redux dentro do chunk lazy do Dashboard.

## Motivo técnico

O Recharts só é importado pelo `DashboardPage`, que já é lazy, então o agrupamento manual não trazia ganho de cache que justificasse o risco de arrastar dependências compartilhadas. O `vendor-react` continua agrupado porque é carregado em toda página e muda pouco.

## Impactos positivos

- Carga inicial: o `index.html` puxa `index` (349 kB) + `vendor-react` (205 kB, com o `react-dom`). Recharts e redux só chegam com o Dashboard (chunk de 363 kB).
- Fecha #64 e #66.
- `npm audit --omit=dev`: de 4 achados (1 baixo, 3 moderados) para 2 moderados.

## Testes executados

`tsc --noEmit`, `eslint`, `vitest` (7), `npm run build` e conferência dos chunks referenciados pelo `dist/index.html`.

## Resultado dos testes

✅ **Passou**, lint com 0 erros.

## Observações

- Os 2 moderados restantes são do `react-router` 6: open redirect com barra invertida em `<Link>`/`useNavigate`, e um de hidratação SSR que não se aplica a SPA. A correção exige migrar para o `react-router-dom` 7 (breaking), que merece PR próprio.
- A regra `react-refresh/only-export-components` passou a apontar 17 arquivos (antes eram 3), todos como warning. É dica de HMR em desenvolvimento, sem efeito no build.
