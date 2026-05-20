# Guia de Deploy — Aplicação Professor

Deploy em **Vercel** (frontend) + **Render** (backend) + **Supabase** (banco/auth, já em produção).

> **Visão geral do fluxo:** o backend e o frontend dependem da URL um do outro
> (CORS e API base), então o deploy é feito em 3 passos com um ajuste final:
> 1. Backend no Render (com CORS provisório)
> 2. Frontend na Vercel (apontando para o backend)
> 3. Atualizar o CORS do backend com a URL real do frontend
> 4. Liberar o redirect de senha no Supabase

---

## Pré-requisitos

- [ ] Código no GitHub (o CI em `.github/workflows/ci.yml` já valida cada push)
- [ ] Conta na [Vercel](https://vercel.com) e no [Render](https://render.com) (login com GitHub facilita)
- [ ] Migrações 0001–0006 já aplicadas no Supabase ✅ (feito)

### Coletando os segredos do Supabase

No painel do Supabase (projeto `vmelydczrdyszbrvlypv`) → **Project Settings → API**:

| Variável | Onde encontrar |
|---|---|
| `SUPABASE_URL` | "Project URL" → `https://vmelydczrdyszbrvlypv.supabase.co` |
| `SUPABASE_ANON_KEY` | "Project API keys" → `anon` `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | "Project API keys" → `service_role` `secret` ⚠️ **nunca** no frontend |
| `SUPABASE_JWT_SECRET` | **Project Settings → API → JWT Settings** → "JWT Secret" |

---

## Passo 1 — Backend no Render

1. [Render Dashboard](https://dashboard.render.com) → **New → Web Service**
2. Conecte o repositório do GitHub
3. Configure:
   - **Root Directory**: deixe em branco (o blueprint aponta para `backend/`)
   - **Runtime**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `backend`
   - **Plan**: `Free`
   - **Health Check Path**: `/api/healthz`
4. Em **Environment**, adicione as variáveis (valores do Supabase acima):
   ```
   SUPABASE_URL=https://vmelydczrdyszbrvlypv.supabase.co
   SUPABASE_ANON_KEY=<sua anon key>
   SUPABASE_SERVICE_ROLE_KEY=<sua service role key>
   SUPABASE_JWT_SECRET=<seu jwt secret>
   CORS_ORIGINS=http://localhost:5173
   WEB_CONCURRENCY=1
   ```
   > `CORS_ORIGINS` é provisório aqui — ajustamos no Passo 3.
5. **Create Web Service**. Aguarde o build (~3-5 min).
6. Anote a URL gerada, algo como `https://portal-backend-xxxx.onrender.com`
7. Teste: abra `https://portal-backend-xxxx.onrender.com/api/healthz` — deve retornar `{"status":"ok"}`

> 💡 **Alternativa (Blueprint)**: em vez dos passos 2-4, use **New → Blueprint** e
> aponte para o repositório — o [render.yaml](render.yaml) já descreve o serviço.
> Você só preenche os segredos no painel.

> ⚠️ **Plano Free do Render**: o serviço "dorme" após 15 min sem tráfego e leva
> ~50s para acordar na primeira requisição (cold start). Para uso real, considere
> o plano Starter (US$7/mês) que mantém o serviço sempre ativo.

---

## Passo 2 — Frontend na Vercel

1. [Vercel Dashboard](https://vercel.com/dashboard) → **Add New → Project**
2. Importe o repositório do GitHub
3. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite` (detectado automaticamente)
   - Build Command e Output já vêm do [frontend/vercel.json](frontend/vercel.json)
4. Em **Environment Variables**, adicione:
   ```
   VITE_SUPABASE_URL=https://vmelydczrdyszbrvlypv.supabase.co
   VITE_SUPABASE_ANON_KEY=<sua anon key>
   VITE_API_BASE_URL=https://portal-backend-xxxx.onrender.com
   ```
   > `VITE_API_BASE_URL` é a URL do backend do Passo 1 (**sem** barra no fim).
   > Use apenas a `anon key` aqui — **nunca** a service_role.
5. **Deploy**. Aguarde (~1-2 min).
6. Anote a URL gerada, algo como `https://portal-xxxx.vercel.app`

---

## Passo 3 — Ajustar o CORS do backend

Agora que você tem a URL da Vercel:

1. Render → seu serviço → **Environment**
2. Edite `CORS_ORIGINS` para a URL da Vercel (pode listar várias separadas por vírgula):
   ```
   CORS_ORIGINS=https://portal-xxxx.vercel.app
   ```
3. Salve → o Render faz redeploy automático

> Para manter o dev local funcionando junto:
> `CORS_ORIGINS=https://portal-xxxx.vercel.app,http://localhost:5173`

---

## Passo 4 — Liberar reset de senha no Supabase

Supabase → **Authentication → URL Configuration**:

1. **Site URL**: `https://portal-xxxx.vercel.app`
2. **Redirect URLs** — adicione:
   ```
   https://portal-xxxx.vercel.app/reset-password
   http://localhost:5173/reset-password
   ```

Isso faz o link do email de recuperação funcionar em produção. (O `ResetPasswordPage`
já usa `window.location.origin`, então não precisa mudar código.)

---

## Verificação final (smoke test)

Acesse `https://portal-xxxx.vercel.app` e confirme:

- [ ] Tela de login carrega
- [ ] Login com um usuário existente funciona (primeira request pode demorar ~50s se o Render estiver dormindo)
- [ ] Dashboard mostra dados
- [ ] Lançar uma nota salva (testa backend + CORS + auth)
- [ ] "Esqueci minha senha" envia email e o link abre `/reset-password`
- [ ] Baixar um boletim PDF funciona
- [ ] Recarregar a página em `/dashboard` (F5) não dá 404 (testa o rewrite SPA)

---

## Atualizações futuras

Com `autoDeploy` ligado, **todo push para `main` redeploia automaticamente** os dois
serviços. O CI roda antes (pytest + tsc + build) e barra o deploy se algo quebrar.

Fluxo recomendado: trabalhe em branch → abra PR → CI valida → merge em `main` → deploy automático.

---

## Notas importantes

- **Banco compartilhado**: dev local e produção usam o **mesmo** projeto Supabase.
  Para isolar, crie um segundo projeto Supabase só para produção e reaplique as
  migrações (`supabase/migrations/`) nele — recomendado quando a aplicação tiver
  usuários reais.
- **Migrações novas**: ao criar `0007_*.sql` etc., aplique no Supabase de produção
  (via SQL Editor ou `supabase db push`) **antes** de fazer deploy do código que
  depende delas.
- **Domínio próprio (futuro)**: tanto Vercel quanto Render permitem adicionar
  domínio customizado nas configurações. Depois é só atualizar `CORS_ORIGINS`,
  `VITE_API_BASE_URL` e os Redirect URLs do Supabase com o novo domínio.
