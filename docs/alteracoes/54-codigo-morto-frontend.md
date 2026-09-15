# 54 — Código morto no frontend (F-10 / F-11)

## Problema identificado

**F-10 e F-11 (Baixo)**, análise 2026-09 (`02-frontend.md`).

- **F-10:** `types/index.ts` tinha cinco tipos que ninguém importava: `Student`, `Module`, `Enrollment`, `Grade` e `ImportResult`. Cada feature define o seu, e `Grade` era cópia exata de `GradeRow` (`features/grades/api.ts`). O risco era o próximo dev importar o tipo errado.
- **F-11:** três arquivos sem nenhum importador, `components/shared/UnderConstruction.tsx`, `components/shared/RoleBadge.tsx` e `components/ui/tooltip.tsx`, este puxando a dependência `@radix-ui/react-tooltip`.

## Objetivo

Apagar o que não é usado, para que o código diga só o que o sistema faz.

## Arquivos alterados

- `frontend/src/types/index.ts`: saem os 5 tipos e `EnrollmentStatus`, que só `Enrollment` usava
- `frontend/src/components/shared/UnderConstruction.tsx`, `RoleBadge.tsx`, `components/ui/tooltip.tsx`: apagados
- `frontend/package.json`, `package-lock.json`: `@radix-ui/react-tooltip` desinstalado
- `frontend/vite.config.ts`: a dependência sai do `optimizeDeps.include`

## Alterações realizadas

- **Tipos:** ficam só os compartilhados de verdade (`UserRole`, `Profile`, `AcademicPeriod`, `MedicalCertificate*`). Um comentário no topo diz onde moram os demais: cada feature, junto da própria API.
- **Arquivos órfãos:** apagados. `AppShell` e `CommandPalette` parecem órfãos na busca por import estático, mas são carregados por `lazy()` e ficaram.
- **Dependência:** desinstalada. A entrada dela no `optimizeDeps` do Vite também saiu; sem isso, o servidor de desenvolvimento tentaria pré-empacotar um pacote que não existe mais.

## Motivo técnico

- **Confirmação antes de apagar:** busca por nome em `src` (só as próprias definições apareceram) e pelos nomes importados de `@/types`. O `tsc -b` e o build de produção confirmam que nada dependia deles.

## Testes executados

- tsc, eslint (`src` inteiro), vitest e `npm run build`.
- **Diff do `package-lock.json`:** só saiu o próprio `@radix-ui/react-tooltip`. As dependências dele são compartilhadas com os outros componentes Radix (select, dropdown, dialog) e ficam.

## Resultado dos testes

✅ **Passou**: tsc, eslint, vitest e build ok.
