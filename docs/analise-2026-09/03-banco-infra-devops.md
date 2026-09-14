# 03 — Relatório: Banco de dados, Infra, CI/CD e Documentação

> Parte da [Análise completa de 2026-09-03](README.md). Achados com prefixo **I-** (infra/banco) e **O-** (operacional, verificados ao vivo hoje).
> Método: leitura das 12 migrations, scripts (`apply_migration.py`, `seed.py`, `diagnose.py`), Dockerfiles, `docker-compose.yml`, `render.yaml`, `vercel.json`, CI, Dependabot, `.gitignore`, `.env.example`, README, DEPLOY.md e docs anteriores; mais checagens ao vivo (curl, DNS, `gh`, `git`).

## 1. Estado operacional verificado em 2026-09-03 (ao vivo)

| Verificação | Resultado |
|---|---|
| `https://portalprofessor.vercel.app/` | ✅ HTTP 200 (1,6 s) |
| `https://portal-professor.onrender.com/api/healthz` | ✅ HTTP 200 — **23 s** (cold start do free tier) |
| `https://portal-professor.onrender.com/api/readyz` | ❌ **HTTP 503** `{"status":"unavailable"}` |
| `nslookup vmelydczrdyszbrvlypv.supabase.co` | ❌ **Non-existent domain** (controle `supabase.com` resolve normalmente) |
| `https://vmelydczrdyszbrvlypv.supabase.co/auth/v1/health` | ❌ sem resposta (HTTP 000) |
| Último CI em `main` | ✅ success |
| PRs abertos | 10 (todos Dependabot, #49–#58); 2 com CI falhando |
| Branches remotas mescladas em `main` e não apagadas | 50 |
| Branches locais mescladas | 7 (`docs/q6-rls`, `fix/*`, `refactor/q5-pyjwt`, `test/q4-integration`) |
| Último commit humano | 2026-08-05 (só Dependabot desde então) |

### O-01 · Produção está fora do ar: projeto Supabase pausado — **Crítico · confirmado · P**
O DNS do projeto não existe mais e o backend devolve 503 no `readyz`. É o comportamento do free tier do Supabase após 7 dias sem requisições: o projeto é **pausado** e o host é removido. Já aconteceu em 2026-08-05 (restaurado manualmente na época). Efeito: o frontend carrega, mas login, dashboard e qualquer chamada à API falham. Não há alerta automático; ninguém foi avisado.
**Causa-raiz:** ausência de tráfego + plano free + nenhum monitor.
**Fix imediato:** restaurar o projeto no painel Supabase (Project → Restore).
**Fix estrutural (escolher um):**
1. **Keep-alive por cron** (custo zero): um workflow do GitHub Actions com `schedule: cron "0 */6 * * *"` fazendo `curl https://portal-professor.onrender.com/api/readyz`. O `readyz` consulta `profiles` com service_role, o que conta como atividade no Supabase **e** acorda o Render. Um workflow de ~10 linhas.
2. **Plano Pro do Supabase** (US$ 25/mês) — sem pausa, com backups diários (resolve I-09 junto).
3. Ambos, se houver uso real.
**Monitor:** o mesmo cron falha (exit ≠ 0) quando o `readyz` não for 200, e o GitHub envia e-mail. Alternativa: UptimeRobot/BetterStack free apontando para `/api/readyz`.

### O-02 · Cold start de 23 s no backend — **Alto (UX) · confirmado · decisão de custo**
Render free dorme após 15 min. O primeiro login do dia leva 20–50 s. O cron do O-01 a cada 10–15 min mitiga (o Render free não proíbe pings, mas consome as 750 h/mês do plano — um serviço único cabe). Alternativa: Starter (US$ 7/mês).

### O-03 · Dependabot: 10 PRs abertos, 2 quebrando o CI — **Médio · confirmado · P/M**
- #58 `typescript 5.9→7.0`: `npm ci` falha por peer dep de `@typescript-eslint` (ERESOLVE). Fechar ou aguardar `typescript-eslint` compatível.
- #54 `pytest-asyncio 0.24→1.4`: `pip` não resolve junto com `pytest==8.3.3`. Precisa subir `pytest` para 9.x na mesma PR.
- #52 `vite 5→8`, #49 `uvicorn 0.31→0.52`, #50 `httpx 0.27→0.28` (breaking em `supabase-py`?), #51 `python-multipart 0.0.18→0.0.32` (**este fecha B-01**), #53 `respx`, #55 `eslint-plugin-react-hooks 5→7`, #56 `next-themes 0.3→0.4`, #57 `zustand`.
**Fix:** mesclar os patch/minor verdes (#51, #53, #57, #56); tratar os majors um a um em branch dedicada; configurar `groups:` no `dependabot.yml` para agrupar minors e reduzir o ruído (hoje até 15 PRs simultâneos).

### O-04 · Higiene de branches — **Baixo · confirmado · P**
50 branches remotas já mescladas e 7 locais mescladas. Ligar **Settings → General → Automatically delete head branches** no GitHub e rodar uma limpeza única:
```bash
git branch --merged main | grep -v main | xargs git branch -d
```
```bash
git branch -r --merged main | grep -v main | sed 's|origin/||' | xargs -n1 git push origin --delete
```

### O-05 · Sem tags/releases — **Baixo · P**
Nada marca "o que está em produção". Tag leve a cada deploy (`prod-2026-09-03`) já resolve rollback e forense.

## 2. Banco de dados

### Diagrama (texto)
```
auth.users ──1:1 (trigger handle_new_user)──> profiles (role, is_active, username UNIQUE, email SEM unique)
profiles ──< academic_periods (coordinator_id RESTRICT; UNIQUE name; is_active = trava de edição)
academic_periods ──< students (CASCADE; student_number UNIQUE GLOBAL; is_active)
academic_periods ──< modules (CASCADE; professor_id RESTRICT; UNIQUE(code, period); max_absences)
students ──< enrollments >── modules   (UNIQUE(student, module); status enum nunca alterado)
enrollments ──1:1 grades (CHECK 0–10, absences ≥ 0 [0008]; last_updated manual)
modules ──< attendance_records (UNIQUE(module, date)) ──< attendance_entries (trigger recalcula grades.absences)
students ──< medical_certificates (CHECK end ≥ start) ──< medical_certificate_attachments (bucket privado)
profiles ──< audit_log (SET NULL; imutável; só service_role grava)
public.schema_migrations  (criada em runtime pelo apply_migration.py, não versionada)
```

### Pontos fortes
`NUMERIC(4,2)` para notas, `TIMESTAMPTZ` em tudo, CHECKs de nota/faltas/créditos, `updated_at` por trigger em 4 tabelas, índices cobrindo os `.eq/.in/.ilike/.order` reais dos routers (b-tree + GIN trigram da `0009`), soft delete consistente, `ON DELETE` semântico, RPCs transacionais com `search_path` fixado, bucket privado sem policy em `storage.objects` (só o backend assina URLs), `audit_log` só-leitura para clientes. `apply_migration.py` rastreia por checksum, roda cada arquivo em transação e trata o caso dos dois `0002`. A `0011` é uma correção de causa-raiz exemplar.

### Achados

| ID | Achado | Local | Sev. | Esf. |
|---|---|---|---|---|
| I-01 | `academic_periods` sem `CHECK (end_date >= start_date)` (padrão já usado em `medical_certificates`) | `0001:37-38` | Médio | P |
| I-02 | `profiles_select_authenticated USING (true)`: qualquer autenticado lê e-mail/username/role de todos via anon key (ver F-07). Frontend só lê a própria linha. | `0002:24-27` | Médio | P |
| I-03 | Apagar período cascateia `students → enrollments → grades → attendance → certificates` no banco; o bloqueio existe **só** no app (`periods.py:234-255`). Um caminho de escrita alternativo (SQL Editor, RPC futura) apaga o histórico do período inteiro. | `0001:54,72` | Médio | P |
| I-04 | `profiles.email` sem `UNIQUE` (`seed.py`/`diagnose.py` fazem `.eq("email").single()` assumindo unicidade) | `0001:22` | Médio | P |
| I-05 | Trigger de defesa contra troca de `role`/`is_active` pelo próprio usuário foi **projetado** no comentário da `0011:41-43` mas nunca criado. Hoje só o REVOKE protege; se alguém restaurar GRANT de UPDATE para uma feature futura, a escalação volta. | `0002:30-34`, `0011` | Médio | M |
| I-06 | `current_user_role()`, `is_admin()`, `is_coordinator_of()`, `is_professor_of_module()` são `SECURITY DEFINER` **sem** `SET search_path` (as RPCs 0007/0010 e `handle_new_user` fixam corretamente) | `0001:202-244` | Baixo | P |
| I-07 | Dois arquivos `0002_*` (`seed_instructions` só tem comentário). O script Python lida; o Supabase CLI não. | `supabase/migrations/` | Baixo | P |
| I-08 | `grades.last_updated` setado à mão (router + trigger 0005) em vez de trigger `set_updated_at` como as outras tabelas | `0001:106` | Baixo | P |
| I-09 | `schema_migrations` não existe como `.sql` versionado; quem aplica pelo SQL Editor (como o README instrui) nunca a cria | `apply_migration.py:42-52` | Baixo | P |
| I-10 | Policies de escrita de `0002/0003/0005` estão inalcançáveis desde a `0011` (GRANT revogado). Intencional, mas quem lê só a `0002` acha que estão ativas. | `0002` | Baixo | P (comentário) |

> **Nota:** migrações 0008–0011 **já estão aplicadas em produção** (verificado por leitura direta do banco em 2026-08-05). O item "aplicar 0008/0009/0010" do `docs/alteracoes/INDEX.md:71` está obsoleto e deve ser marcado como concluído.

## 3. Auth, seed e segredos

| ID | Achado | Local | Sev. | Esf. |
|---|---|---|---|---|
| I-11 | `seed.py` usa senhas fracas como **default** (`"Admin@1234!"`, `"Escola@2024!"`) quando as env vars faltam. Dev e prod compartilham o Supabase: rodar o seed com o `.env` errado cria/atualiza usuários reais com senha documentada no README. | `seed.py:39-40` | **Alto** | P |
| I-12 | `backend/.env` com `SERVICE_ROLE_KEY` de **produção** no disco de dev (não versionado; rotação A6 pendente desde julho) | disco local | Alto | M (rotação) |
| I-13 | `DATABASE_URL` exigida por `apply_migration.py` não está em `backend/.env.example` | `.env.example` | Médio | P |
| I-14 | Sem `SENTRY_DSN`/`LOG_LEVEL`/`ENV` em `config.py` — não há como diferenciar ambiente nem plugar APM sem código | `config.py` | Baixo | P |

Bem feito: `handle_new_user` com `ON CONFLICT DO NOTHING`; desativação em vez de deleção de usuário; reset de senha documentado passo a passo no DEPLOY.md; troca de senha revalida a atual e tem rate limit.

## 4. CI/CD e deploy

| ID | Achado | Local | Sev. | Esf. |
|---|---|---|---|---|
| I-15 | CI não roda migrations contra nenhum Postgres. `0008–0011` foram testadas pela primeira vez em produção. | `ci.yml` | Alto | M |
| I-16 | CI não builda a imagem Docker; o Dockerfile hardened de julho nunca rodou `docker build` (registrado em `alteracoes/17`) | `ci.yml` | Alto | P |
| I-17 | `render.yaml` diz `autoDeploy: true`, mas o serviço real foi criado manualmente e estava com auto-deploy **desligado** em 2026-08-05 (deploys "Manually triggered"). Confirmar no painel; se continuar desligado, os merges em `main` não chegam à produção. | `render.yaml:15`, DEPLOY.md:184-198 | Médio | P |
| I-18 | `--cov-fail-under=50` é baixo para código em que a authz é 100% app-layer; a suíte já está em 61% | `ci.yml:39` | Médio | P |
| I-19 | `pip-audit`/`npm audit` com `continue-on-error` (decisão documentada); hoje ambos acusam highs (B-01 e `nanoid`/`postcss`) — reavaliar virar gate após os bumps | `ci.yml:45,71` | Baixo | P |
| I-20 | Sem keep-alive/monitor (ver O-01) | `.github/workflows/` | Crítico | P |
| I-21 | Sem job de backup agendado (ver I-24) | `.github/workflows/` | Alto | M |
| I-22 | `docker-compose.yml` com `version: "3.9"` obsoleto; base images pinadas só por tag (sem digest); Dependabot não cobre ecossistema `docker` | compose, Dockerfiles, `dependabot.yml` | Baixo | P |
| I-23 | Sem staging: dev e prod no mesmo Supabase. Riscos concretos: `0008` falha se houver linha fora de faixa; seed sobrescreve aluno real com `student_number` colidente; janela 0001→0002 totalmente aberta. Proposta: 2º projeto Supabase free + `DATABASE_URL` de staging no `.env` + 2º serviço Render free + preview da Vercel. | — | Alto | M |

Bem feito: Dockerfile backend non-root com `HEALTHCHECK` respeitando `$PORT`; frontend Dockerfile explicitamente dev-only; `.dockerignore` exclui `.env`; CORS restritivo; HSTS/nosniff/frame-deny nas duas camadas; cache de pip/npm no CI; lint + tsc + vitest + build no pipeline.

## 5. Backup e recuperação

| ID | Achado | Sev. | Esf. |
|---|---|---|---|
| I-24 | Supabase free **não** tem backup automático nem PITR. Não há script nem cron de `pg_dump` no repositório. Perda do projeto = perda de notas/matrículas. | **Alto** | M |
| I-25 | Bucket `medical-certificates` (PDFs de atestados) sem cópia; registros em `medical_certificate_attachments` ficariam órfãos | Alto | M |
| I-26 | Sem runbook: o que fazer quando `readyz` cai (exatamente o cenário de hoje), quando a anon key vaza, como rotacionar `service_role` | Médio | M |

**Mínimo viável:** workflow semanal (`schedule`) com `pg_dump "$DATABASE_URL" | gzip` enviado como artifact do GitHub Actions (retenção 90 dias, custo zero) + `supabase storage` download do bucket. Documentar restore em `DEPLOY.md`.

## 6. Documentação

| ID | Achado | Local | Sev. | Esf. |
|---|---|---|---|---|
| I-27 | README diz "0001–0007 (+ seed)" na árvore de pastas (linha 40-43) e lista 0001–0011 na seção de setup (97-108) — contradição interna | `README.md` | Alto | P |
| I-28 | DEPLOY.md checklist: "Migrações 0001–0007 aplicadas" (linha 18) vs "aplique todas até 0011" (158-166) | `DEPLOY.md` | Alto | P |
| I-29 | DEPLOY.md assume autoDeploy ligado (184-198) — ver I-17 | `DEPLOY.md` | Médio | P |
| I-30 | `docs/alteracoes/INDEX.md:71` ainda pede "aplicar 0008/0009/0010" — já aplicadas | `INDEX.md` | Baixo | P |
| I-31 | Faltam: `CONTRIBUTING.md` (o fluxo de `docs/alteracoes/` já é o padrão, só formalizar), ADR único sobre "service_role bypassa RLS; authz é app-layer", runbook de incidentes, menção ao `diagnose.py` e ao `apply_migration.py` no README | — | Médio | M |

O formato de `docs/alteracoes/NN-*.md` (Problema → Objetivo → Arquivos → Alterações → Motivo → Impactos → Testes → Observações) é muito bom e deve virar o template obrigatório de PR.
