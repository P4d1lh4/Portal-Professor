# 15 — Lint funcional + cobertura no CI (M13, parte 1)

## Problema identificado

- O `eslint.config.js` estava **truncado/corrompido** (158 bytes, cortava em `import tsP`) — `npm run lint` **nunca funcionou** (ESLint 9 exige flat config válida). Por isso a auditoria viu "lint configurado mas não roda".
- O CI não executava lint nem media cobertura (`pytest -q` apenas).

## Objetivo

Fazer o lint funcionar de verdade, corrigir os erros que ele revelasse, e ligar lint + cobertura ao pipeline como gate.

## Arquivos alterados

- `frontend/eslint.config.js` (flat config completa)
- `frontend/src/components/ui/input.tsx`, `frontend/src/features/modules/api.ts`, `frontend/src/features/periods/api.ts` (correção dos erros)
- `.github/workflows/ci.yml` (steps de lint e cobertura)
- `backend/requirements.txt` (`pytest-cov`)

## Alterações realizadas

- **Flat config** usando os plugins já instalados (`@eslint/js`, `@typescript-eslint/*`, `react-hooks`, `react-refresh`, `globals`) — sem adicionar o meta-pacote `typescript-eslint`. `no-undef`/`no-unused-vars` delegados ao TS; `react-hooks/rules-of-hooks` como erro.
- **3 erros corrigidos** (`@typescript-eslint/no-empty-object-type`): `interface X extends Y {}` → `type X = Y` em `InputProps`, `ModuleUpdate`, `PeriodUpdate`.
- **CI:** `npm run lint` adicionado ao job frontend; backend passa a rodar `pytest --cov=app --cov-report=term-missing --cov-fail-under=50`.
- `pytest-cov==5.0.0` pinado.

## Motivo técnico

O lint só agrega valor se **passar limpo** — daí corrigir os 3 erros reais em vez de silenciá-los. Os erros eram interfaces vazias herdando um supertipo; `type X = Y` é a forma idiomática (sugestão da própria regra) e equivalente. As **4 warnings** restantes (`react-refresh/only-export-components` em badge/button/routes e um `exhaustive-deps` em StudentsPage) foram **mantidas como warning**: não quebram o CI e "consertá-las" exigiria mover constantes para outros arquivos (churn sem ganho real agora). O gate de cobertura foi fixado em **50%**, abaixo dos **57,1%** atuais — trava quedas sem exigir escrita de testes agora (subir o piso acompanha o crescimento da suíte).

## Impactos positivos

- `npm run lint` funciona e roda no CI (erros barram merge).
- Cobertura medida e com piso no CI (quedas abaixo de 50% quebram o build).
- Fim de 3 erros de tipo reais no código.

## Testes executados

- **Lint:** `npx eslint .` → **0 erros, 4 warnings**, exit 0.
- **Type-check:** `npx tsc --noEmit` → No errors found (as trocas `type X = Y` não quebraram nada).
- **Cobertura:** `pytest --cov=app --cov-fail-under=50` → exit 0 (57,1%).

## Resultado dos testes

✅ **Passou** — lint limpo, tsc limpo, gate de cobertura verde.

## Observações

- **Staging** (2º projeto Supabase) e **CD acoplado ao CI** — a outra metade do M13 — dependem de recursos/infra do responsável (criar projeto, deploy hooks) e não são configuráveis só por código aqui.
- Subir o `--cov-fail-under` para ~60–70% deve acompanhar a expansão dos testes de integração (M15).
- As 4 warnings de lint são candidatas naturais do M9 (perf/organização), não deste escopo.
