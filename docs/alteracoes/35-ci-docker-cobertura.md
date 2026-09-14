# 35 — CI builda a imagem do backend (I-16) e cobertura mínima de 60% (I-18)

## Problema identificado

Análise 2026-09, Fase 2 (`docs/analise-2026-09/03-banco-infra-devops.md`):

- **I-16 (Alto):** o CI não buildava a imagem Docker. O `backend/Dockerfile` endurecido na alteração 17 (non-root, `HEALTHCHECK`) nunca tinha passado por um `docker build`, e o registro 17 ficou com "build pendente".
- **I-18 (Médio):** `--cov-fail-under=50` é baixo para um backend em que a autorização é 100% de aplicação. A suíte já estava acima de 60%.

## Objetivo

Barrar no PR uma imagem que não builda ou não sobe, e impedir que a cobertura caia abaixo do nível atual.

## Arquivos alterados

- `.github/workflows/ci.yml`

## Alterações realizadas

- **I-16:** job novo, `docker` ("Backend (docker build)"):
  1. `docker build -t portal-backend:ci ./backend`;
  2. smoke test: sobe o contêiner com as variáveis stub (as mesmas do job de pytest), espera até 20 s o `/api/healthz` responder e confere que o processo roda como `appuser`.
- **I-18:** `--cov-fail-under` de 50 para 60 no job de pytest.

## Motivo técnico

Só o build não pega um CMD quebrado, um arquivo que o `.dockerignore` deixou de fora ou uma importação que falha na imagem. Por isso o smoke test sobe o app de verdade. O `/api/healthz` é o endpoint certo porque não toca o banco (o `/api/readyz` toca e responderia 503 com os stubs). O `id -un` trava o hardening da alteração 17: se alguém tirar o `USER appuser`, o CI quebra.

O piso de 60% fica abaixo dos 65% atuais para não quebrar o CI por oscilação pequena. Subir o piso junto com o B-13 (testes HTTP).

## Impactos positivos

- O Dockerfile de produção (Render) é validado a cada PR.
- A cobertura não regride abaixo de 60% sem alguém perceber.

## Testes executados

- Local, com Docker 29.4: `docker build ./backend` e o smoke test equivalente (contêiner com os stubs, `GET /api/healthz`, `id -un`), e ainda o status do `HEALTHCHECK` depois do `start-period`.
- `pytest -q --cov=app --cov-fail-under=60` no venv isolado.
- `ci.yml` validado com PyYAML.

## Resultado dos testes

✅ **Passou**: build ok (55 s); `/api/healthz` → 200 na 4ª tentativa; usuário `appuser`; `HEALTHCHECK` → `healthy`; pytest acima do piso de 60%.

## Observações

- Isso fecha a pendência "build Docker pendente" da alteração 17. O bind-mount do `docker compose` de desenvolvimento com `USER appuser` continua sem teste.
- A imagem do frontend (dev-only, `node:20`, sem suporte desde 2026-04-30) não entra no CI: a produção do frontend é a Vercel. A atualização do Node é item à parte.
- Sem cache de camadas no build (≈1 min). Acrescentar `docker/build-push-action` com cache só se o tempo incomodar.
