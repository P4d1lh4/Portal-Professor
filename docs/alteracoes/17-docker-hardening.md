# 17 — Docker: non-root, HEALTHCHECK e frontend dev-only (M11)

## Problema identificado

- `backend/Dockerfile` rodava como **root** e sem `HEALTHCHECK`.
- `frontend/Dockerfile` usava `npm install` (não-determinístico) e rodava o **dev server do Vite** como CMD — enganoso como artefato "de produção" (a auditoria chamou de landmine).

## Objetivo

Endurecer o contêiner do backend e desfazer a ambiguidade do frontend, sem quebrar o `docker-compose` de desenvolvimento nem criar infraestrutura de produção que ninguém consome.

## Arquivos alterados

- `backend/Dockerfile`
- `frontend/Dockerfile`

## Alterações realizadas

- **Backend:** cria usuário `appuser` (`adduser` + `chown`) e `USER appuser` antes do CMD; `HEALTHCHECK` que faz GET em `/api/healthz` via Python (a imagem `slim` não tem curl), respeitando `$PORT`.
- **Frontend:** `npm install` → `npm ci` (determinístico) e cabeçalho **explícito "dev-only"** explicando que a produção é a Vercel e que rodar a imagem standalone sobe o dev server.

## Motivo técnico

**Não** converti o frontend para multi-stage nginx de propósito: a produção do frontend é a **Vercel** (o `render.yaml` só deploya o backend), e o `docker-compose` sobrescreve o CMD com `npm run dev` + bind-mount — um estágio final `nginx` (sem `npm`) **quebraria o dev**. Construir um pipeline nginx que nenhum ambiente usa é YAGNI; o fix honesto é tornar a intenção explícita + `npm ci`. Se um dia o frontend sair da Vercel, o caminho multi-stage está documentado no próprio Dockerfile. No backend, non-root + HEALTHCHECK são hardening padrão de baixo risco (o `.dockerignore` já exclui `.env`, então segredos não vão para a imagem).

## Impactos positivos

- Backend não roda mais como root (exigência de muitos admission controllers de Kubernetes) e expõe healthcheck a orquestradores.
- Build do frontend determinístico; ninguém mais é induzido a deployar o dev server.

## Testes executados

- **Docker build/run:** ⚠️ **não executável** — o daemon do Docker está indisponível neste ambiente. Mudanças **validadas por revisão**.
- **Validação parcial (offline):** sintaxe do one-liner Python do HEALTHCHECK conferida (`ast.parse` OK) e comportamento verificado (exit 1 com servidor fora → exit 0 quando `/api/healthz` responde 200); `.dockerignore` confirmado excluindo `.env`.
- **Backend pytest:** inalterado (`142 passed`) — Dockerfiles não afetam a suíte.

## Resultado dos testes

✅ **Revisado** (backend healthcheck validado offline). ⏳ **Build Docker pendente** de validação num ambiente com daemon ativo.

## Observações

- **Verificar num ambiente com Docker:** `docker build ./backend` e `docker compose up` — em especial o bind-mount do backend com `USER appuser` (em alguns hosts Linux, arquivos montados pertencem ao uid do host; no Docker Desktop costuma funcionar). Se houver atrito no dev, o compose pode sobrescrever `user: root` só no serviço de dev.
- Pin de imagens base por digest e o multi-stage do frontend ficam como refinamento futuro.
