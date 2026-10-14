# ⚠️ IMAGEM DEV-ONLY — NÃO usar em produção.
# A produção do frontend é buildada e servida pela VERCEL (ver frontend/vercel.json
# e DEPLOY.md). Esta imagem existe apenas para o docker-compose de desenvolvimento,
# que sobrescreve o CMD (`npm run dev`) e monta o código via bind-mount. Rodá-la
# standalone sobe o dev server do Vite (sem build/minificação) — não é para produção.
#
# Para containerizar o frontend em produção (caso saia da Vercel), converter em
# build multi-stage (node build -> nginx servindo dist/ com fallback SPA) e apontar
# o docker-compose de dev para o estágio de build.
# Tag + digest, atualizado pelo Dependabot (I-22).
FROM node:26-alpine@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a

WORKDIR /app

# npm ci (determinístico, respeita o lockfile) em vez de npm install.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
