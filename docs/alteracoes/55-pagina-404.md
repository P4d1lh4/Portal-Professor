# 55 — Página 404 (F-13)

## Problema identificado

**F-13 (Baixo)**, análise 2026-09 (`02-frontend.md`). Qualquer endereço inexistente redirecionava para `/dashboard` sem explicação. Um link quebrado ou um endereço digitado errado parecia um salto aleatório para o painel.

## Objetivo

Dizer que a página não existe e oferecer o caminho de volta.

## Arquivos alterados

- `frontend/src/components/shared/NotFoundPage.tsx` (novo)
- `frontend/src/components/shared/NotFoundPage.test.tsx` (novo)
- `frontend/src/routes/index.tsx`: a rota `*` usa a página

## Alterações realizadas

- **`NotFoundPage`:** reaproveita o `EmptyState` (o mesmo visual das telas vazias), com "Página não encontrada", uma frase curta e o botão "Ir para o painel".
- **Rota `*`:** fica dentro da área autenticada (`AppShell`), então o menu lateral continua à mão.

## Motivo técnico

- **Rota restrita por papel continua voltando ao painel** (`ProtectedRoute`): lá o endereço existe, só não é do papel da pessoa. A 404 é para o endereço que não existe.

## Testes executados

- **`NotFoundPage.test.tsx`:** num endereço inexistente, a página explica o que houve e o botão leva ao painel.
- tsc, eslint, vitest e build.

## Resultado dos testes

✅ **Passou**.
