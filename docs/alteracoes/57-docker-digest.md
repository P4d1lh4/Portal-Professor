# 57 — Imagens Docker por digest e no Dependabot (I-22)

## Problema identificado

**I-22 (Baixo)**, análise 2026-09 (`03-banco-infra-devops.md`):

- **Compose obsoleto:** o `docker-compose.yml` ainda declarava `version: "3.9"`. O Compose v2 ignora a chave e avisa a cada comando.
- **Imagens só por tag:** `python:3.13-slim` e `node:20-alpine` mudam de conteúdo sob a mesma tag. Dois builds do mesmo commit podiam sair de imagens diferentes, e uma imagem trocada no registro entraria sem ninguém ver.
- **Dependabot sem Docker:** o ecossistema `docker` não estava coberto, então nada avisaria de imagem base nova.

## Objetivo

Build reproduzível a partir do commit, sem abrir mão de receber as atualizações da imagem base.

## Arquivos alterados

- `docker-compose.yml`: sem `version:`
- `backend/Dockerfile`: `python:3.13-slim@sha256:9d2e…0285`
- `frontend/Dockerfile`: `node:20-alpine@sha256:fb4c…2293`
- `.github/dependabot.yml`: ecossistema `docker` para `/backend` e `/frontend`

## Alterações realizadas

- **Tag + digest nos dois Dockerfiles:** a tag fica para quem lê, e o digest é o que o Docker usa. É o digest do *manifest list*, então vale para todas as plataformas publicadas.
- **Dependabot `docker`,** semanal, com as labels que o repositório já usa (`dependencies` + `backend`/`frontend`). Ele atualiza o digest (e a tag, quando sair versão nova) por PR, que passa pelo job `docker` do CI.
- **Compose sem a chave `version:`.**

## Motivo técnico

- **Digest sem Dependabot é pior que só tag:** a imagem congelaria com as vulnerabilidades da época. Os dois entram juntos.
- **Digest consultado pelo manifesto** (`docker buildx imagetools inspect`), sem baixar a imagem; o build de verdade roda no job `docker` do CI.

## Testes executados

- `docker buildx imagetools inspect` das duas referências fixadas: resolvem e trazem `linux/amd64` (a plataforma do CI e do Render).
- `docker compose config --quiet` do compose sem `version:`.
- Job `docker` do CI: builda o `backend/Dockerfile` com o digest e faz o smoke test (healthz e usuário não root).

## Resultado dos testes

✅ **Passou**: os dois digests resolvem com `linux/amd64`, e o compose valida.

## Observações

- **O Node 20 está sem suporte desde 2026-04-30.** A imagem do frontend é só para desenvolvimento (produção roda na Vercel) e continua no 20, como o CI. O Dependabot deve propor tags novas; subir o Node no CI e no Dockerfile juntos é um item à parte.
