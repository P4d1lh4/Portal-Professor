# ⚠️ IMAGEM DEV-ONLY — NÃO usar em produção.
# A produção do frontend é buildada e servida pela VERCEL (ver frontend/vercel.json
# e DEPLOY.md). Esta imagem existe apenas para o docker-compose de desenvolvimento,
# que sobrescreve o CMD (`npm run dev`) e monta o código via bind-mount. Rodá-la
# standalone sobe o dev server do Vite (sem build/minificação) — não é para produção.
#
# Para containerizar o frontend em produção (caso saia da Vercel), converter em
# build multi-stage (node build -> nginx servindo dist/ com fallback SPA) e apontar
# o docker-compose de dev para o estágio de build.
FROM node:20-alpine

WORKDIR /app

# npm ci (determinístico, respeita o lockfile) em vez de npm install.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
