# 04 — ErrorBoundary global no frontend

## Problema identificado

`App.tsx` não envolvia a aplicação em nenhum ErrorBoundary e `createBrowserRouter` não definia `errorElement`. Um `throw` durante o render de qualquer componente (ex.: payload inesperado do backend) resultava em **tela branca** sem recuperação nem log.

## Objetivo

Garantir que erros de render sejam capturados e exibam uma tela de fallback amigável (com botão de recarregar), em vez de derrubar a aplicação inteira.

## Arquivos alterados

- `frontend/src/components/shared/ErrorBoundary.tsx` (novo)
- `frontend/src/App.tsx`
- `frontend/src/routes/index.tsx`

## Alterações realizadas

- Novo `ErrorBoundary` (componente de classe React, ~50 linhas, **sem dependência externa**) com fallback temático + botão "Recarregar".
- Exportado também `RouteErrorFallback` (usa `useRouteError`) para o `errorElement` do React Router.
- `App.tsx`: `RouterProvider` envolvido pelo `ErrorBoundary` (captura erros de providers).
- `routes/index.tsx`: rota raiz pathless com `errorElement: <RouteErrorFallback />`, cobrindo erros de render de **todas** as rotas (que o `RouterProvider` não propaga ao boundary React).

## Motivo técnico

Dois mecanismos distintos precisam ser cobertos: o `RouterProvider` (data router) intercepta erros de render das rotas e **não** os propaga para um ErrorBoundary React externo — daí o `errorElement`. Já erros fora do router (providers) são pegos pelo boundary de classe. Optou-se por um boundary próprio de ~50 linhas em vez de adicionar `react-error-boundary` (dependência desnecessária para o que o React já oferece nativo).

## Impactos positivos

- Fim da tela branca: qualquer erro de render mostra fallback recuperável.
- Ponto único para plugar telemetria (Sentry) quando a observabilidade for implementada.

## Testes executados

- **Build/Type-check:** `npx tsc --noEmit` → **No errors found** (exit 0).
- **Lint:** não roda no CI ainda (backlog M13); não introduzido para manter escopo.
- **Testes unitários de frontend:** inexistentes ainda (serão criados na melhoria A5).
- **Teste manual:** estrutura das rotas revisada; type-check garante que o wrapper de rota e os imports estão corretos.
  - *Esperado:* projeto compila; boundary e errorElement conectados.
  - *Obtido:* type-check limpo.

## Resultado dos testes

✅ **Passou** — `tsc --noEmit` sem erros.

## Observações

- Quando a suíte de testes de frontend (A5) existir, adicionar um teste que renderiza um componente que lança e verifica o fallback.
- Telemetria: o `console.error` é placeholder até a melhoria de observabilidade (Sentry).
