# Runbook de produção

Para quando algo quebra em produção. Cada seção segue a mesma ordem: sintoma, diagnóstico, ação e como confirmar. Deploy do zero e configuração ficam no [DEPLOY.md](../DEPLOY.md).

| Peça | Onde | Plano |
|---|---|---|
| Frontend | Vercel (`frontend/`) | Hobby |
| Backend | Render, `https://portal-professor.onrender.com` | Free (dorme após 15 min) |
| Banco + Auth + Storage | Supabase, projeto `vmelydczrdyszbrvlypv` | Free (pausa após 7 dias sem tráfego; sem backup) |
| Keep-alive e backup | GitHub Actions: `keepalive.yml` (10 min) e `backup.yml` (semanal) | Grátis |

**Aviso automático:** quando o `readyz` não responde 200, o workflow *Keep-alive* falha e o GitHub manda e-mail ao dono do repositório.

---

## 1. Triagem: o que caiu?

```bash
curl -s -o /dev/null -w "healthz %{http_code}\n" --max-time 70 https://portal-professor.onrender.com/api/healthz
curl -s -w "  readyz %{http_code}\n" --max-time 70 https://portal-professor.onrender.com/api/readyz
```

A primeira chamada pode levar até 50 s, porque o Render free acorda o serviço.

| `healthz` | `readyz` | Onde está o problema | Seção |
|---|---|---|---|
| 200 | 200 | Backend e banco ok: o problema está no frontend, no CORS ou nas chaves | [4](#4-tudo-verde-mas-ninguém-entra) |
| 200 | 503 | Backend de pé, Supabase não responde | [2](#2-readyz-503-supabase-indisponível) |
| erro ou timeout | — | Render | [3](#3-backend-render-fora) |

O `healthz` só diz que o processo está vivo. O `readyz` faz uma consulta real em `profiles` com a service role (`backend/app/main.py`).

---

## 2. `readyz` 503: Supabase indisponível

**Nos logs do Render** (serviço → *Logs*) aparece `readyz: Supabase indisponível`. Causas, da mais provável para a menos:

### 2.1 Projeto pausado

Aconteceu em 2026-08-05 e em 2026-09-03. **Sinais:** o painel do Supabase mostra *Paused*, e `nslookup vmelydczrdyszbrvlypv.supabase.co` não resolve.

1. Painel do Supabase → projeto → **Restore project**. Leva alguns minutos, e o DNS volta antes do resto: por um tempo o `readyz` segue 503, o PostgREST responde `PGRST205` (tabela fora do *schema cache*) e o pooler recusa conexão com `tenant/user … not found`. É esperado; aguarde o `readyz` dar 200 (em 2026-09-15 foram uns 5 min).
2. Confirme: `readyz` volta a 200. Rode *Actions → Keep-alive → Run workflow* e veja se fica verde.
3. Confira as migrações. Com o `DATABASE_URL` de produção no `backend/.env`:
   ```bash
   python backend/scripts/apply_migration.py --status
   ```
   Tudo o que está em `supabase/migrations/` precisa aparecer como aplicado. Para aplicar: `--all`, lendo antes o cabeçalho de pré-condições de cada arquivo (a 0012 aborta com e-mail repetido ou datas invertidas).
4. **Por que pausou, com o keep-alive rodando?**
   - O GitHub desliga `schedule` em repositório público depois de 60 dias sem commit. Em *Actions → Keep-alive*, se aparecer *"This scheduled workflow is disabled"*, clique em **Enable workflow**.
   - Ou o keep-alive já estava falhando e os e-mails passaram despercebidos.

**Pausado há mais de 90 dias:** o Supabase não restaura mais o projeto, só oferece o download dos dados no painel. Nesse caso, crie um projeto novo e siga a [seção 6](#6-restore-de-backup).

### 2.2 Supabase fora do ar

Veja <https://status.supabase.com>. Não há o que fazer além de esperar. O keep-alive avisa quando voltar: o próximo run fica verde.

### 2.3 Chave ou URL errada no Render

**Sinal:** logo depois de uma rotação ou de mexer nas env vars, os logs mostram 401 do PostgREST (`Invalid API key`, `JWSError`). Confira `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no Render ([seção 5](#5-rotação-de-chaves)).

---

## 3. Backend (Render) fora

- **Deploy quebrado:** em Render → serviço → *Events*, o último deploy falhou ou o serviço não sobe. Volte ao deploy anterior (*Rollback* no evento, ou *Manual Deploy* do commit bom) e corrija em branch. Todo push em `main` redeploia; veja *Atualizações futuras* no DEPLOY.md.
- **Não sobe por falta de variável:** o `backend/app/config.py` exige `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_JWT_SECRET`. O erro de validação aparece nos logs de boot.
- **Horas grátis do mês esgotadas:** são 750 h por conta. O serviço fica suspenso até o mês virar. A saída é o plano Starter (O-02).

---

## 4. Tudo verde, mas ninguém entra

| Sintoma | Causa provável | Ação |
|---|---|---|
| Erro de CORS no console do navegador | `CORS_ORIGINS` no Render sem a URL da Vercel | DEPLOY.md, Passo 3 |
| Login funciona, toda chamada dá 401 e volta ao login | O backend não valida o token: `SUPABASE_URL` do Render aponta para outro projeto, ou `SUPABASE_JWT_SECRET` desatualizado (projeto HS256) | [Seção 5](#5-rotação-de-chaves) |
| "E-mail ou senha incorretos" para todo mundo, ou erro de API key no login | `VITE_SUPABASE_ANON_KEY`/`VITE_SUPABASE_URL` da Vercel de outro projeto ou rotacionada | [Seção 5](#5-rotação-de-chaves) (a Vercel exige *Redeploy*) |
| Link de redefinir senha abre página errada | *Redirect URLs* do Supabase | DEPLOY.md, Passo 4 |
| Tela em branco depois de um deploy | Variável `VITE_` faltando no build | Vercel → *Deployments* → logs do build |

---

## 5. Rotação de chaves

Pendência I-12. **Rotacione na hora se a `service_role` vazar** (commit, log, print, máquina perdida): ela dá acesso total ao banco, sem RLS. A `anon` é pública por natureza; o RLS e a migração 0011 protegem, então rotacione só se houver abuso.

**Onde cada segredo vive:**

| Segredo | Supabase | Render | Vercel | GitHub (backup) | Local |
|---|---|---|---|---|---|
| service_role | *Settings → API Keys* | `SUPABASE_SERVICE_ROLE_KEY` | — | `SUPABASE_SERVICE_ROLE_KEY` | `backend/.env` |
| anon | *Settings → API Keys* | `SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` | — | `backend/.env`, `frontend/.env` |
| JWT secret (legacy) | *Settings → JWT Keys* | `SUPABASE_JWT_SECRET` | — | — | `backend/.env` |
| Senha do banco | *Settings → Database* | — | — | `SUPABASE_DB_URL` | `DATABASE_URL` em `backend/.env` |

**Passos:**

1. **Supabase.** O backend (`backend/app/auth.py`) aceita os dois modos de assinatura de token:
   - **Chaves legacy** (anon e service_role são JWTs HS256): gerar um novo JWT secret cria **também novas anon e service_role** e derruba todas as sessões; todo mundo faz login de novo.
   - **JWT signing keys** (ES256/RS256): crie uma chave *standby* e promova-a (*Rotate keys*). O backend recarrega o JWKS sozinho quando vê um `kid` novo. Tokens antigos valem até expirar; depois, revogue a chave anterior.
2. **Render:** atualize as env vars e salve. O redeploy é automático.
3. **Vercel:** atualize `VITE_SUPABASE_ANON_KEY` e faça **Redeploy**. Variável `VITE_` é embutida no build; sem redeploy, nada muda.
4. **GitHub:** atualize `SUPABASE_SERVICE_ROLE_KEY` e, se a senha do banco mudou, `SUPABASE_DB_URL`.
5. **`.env` locais.**
6. **Confirme:**
   - `readyz` 200;
   - login no site;
   - lançar uma nota;
   - *Actions → Backup → Run workflow* verde.

> ⚠️ Chaves no formato novo (`sb_secret_…`/`sb_publishable_…`) não servem hoje. O backend está no `supabase-py` 2.8.1, que valida a chave como JWT e recusa esse formato. Use as legacy até o upgrade do #68 (supabase 2.31).

**Senha do banco vazada:** *Settings → Database → Reset database password*. Depois, atualize o `DATABASE_URL` local e o `SUPABASE_DB_URL` no GitHub.

---

## 6. Restore de backup

**Quando usar:**
- projeto perdido ou irrecuperável (pausado há mais de 90 dias, excluído);
- dados apagados por engano. Nesse caso, restaure num projeto **à parte** e copie o que falta. Nunca restaure por cima da produção sem antes exportar o estado atual.

**Passo a passo:** [DEPLOY.md → Backup → Restore](../DEPLOY.md#restore).

- Precisa da `BACKUP_PASSPHRASE`, guardada fora do GitHub.
- Os artifacts duram 90 dias.

**Se a produção passar a apontar para o projeto novo,** tudo muda: URL, anon, service_role e JWT. Refaça a [seção 5](#5-rotação-de-chaves) inteira, os Passos 3 e 4 do DEPLOY.md (CORS e Redirect URLs) e o secret `SUPABASE_URL` do backup. O keep-alive não muda, porque bate na URL do Render.

---

## 7. Depois do incidente

- Se algo mudou no código ou na infra, registre em `docs/alteracoes/` o que houve, a causa e a ação.
- Na semana seguinte, confira se *Keep-alive* e *Backup* estão verdes.
- Se o incidente revelou um passo que falta aqui, atualize este runbook no mesmo PR.
