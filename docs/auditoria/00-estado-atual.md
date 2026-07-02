# 00 — Estado Atual do Projeto (ponto de partida)

> Documento-base do processo de melhorias. Consolida a auditoria técnica de **2026-07-01**.
> Detalhamento completo dos achados: ver a auditoria em `docs/ANALISE_E_PLANO_DE_ACAO.md` e o histórico de melhorias em `docs/alteracoes/`.

## 1. Arquitetura atual

Monorepo de portal acadêmico (gestão de alunos, módulos, notas, faltas, atestados), 3 papéis: **admin**, **coordinator**, **professor**.

- **Frontend** (`frontend/`): SPA React 18 + Vite 5 + TypeScript. Organização **feature-based** (`features/<dominio>/` com `api.ts` + `useX.ts` + `Page`/`Dialog`). Estado: TanStack Query (servidor) + Zustand (auth) + React Hook Form/Zod (forms). UI: shadcn/ui (Radix) + Tailwind. Rotas lazy (`routes/index.tsx`) com `ProtectedRoute` por papel. Deploy: **Vercel**.
- **Backend** (`backend/`): API FastAPI + Pydantic v2. Camadas `routers/` + `schemas/` + `services/`. Auth via JWT do Supabase validado por JWKS (`auth.py`), autorização por papel via `deps.require_role` + guards. Deploy: **Render** (Docker, worker único).
- **Banco** (`supabase/migrations/`): PostgreSQL/Supabase, 8 arquivos SQL (0001–0007 + seed). RLS granular por papel + RPC transacional.

> **Fato arquitetural crítico:** a API usa **exclusivamente** `get_admin_db()` (service role, que **bypassa RLS**). O `get_db()` (anon/RLS) não é usado. Portanto a autorização em runtime depende **100% da camada de aplicação** — as policies RLS só valeriam para acesso direto via anon key. Um guard esquecido = vazamento/IDOR entre papéis.

## 2. Estrutura do projeto

```
frontend/src/{features,components/{ui,shared,layout},hooks,lib,routes,types}
backend/app/{routers,schemas,services,auth.py,deps.py,db.py,config.py,main.py}
backend/tests/            # 119 testes (só backend)
supabase/migrations/      # 0001–0007 + seed
docs/{auditoria,alteracoes}/   # este processo
docker-compose.yml · render.yaml · frontend/vercel.json · .github/workflows/ci.yml
```

## 3. Tecnologias

| Camada | Stack |
|---|---|
| Frontend | React 18, Vite 5, TS 5, Tailwind, shadcn/Radix, TanStack Query v5, Zustand 5, RHF+Zod, axios, recharts, sonner |
| Backend | FastAPI 0.115, Pydantic v2, supabase-py 2.8, python-jose (JWT), reportlab, pytest |
| Banco/Infra | Supabase (Postgres+Auth+RLS), Docker, Render, Vercel, GitHub Actions |

## 4. Pontos fortes (auditoria)

- Frontend feature-based **muito consistente**; design system tokenizado com dark mode; estado sem sobreposição.
- Segurança de base sólida: segredos **fora do git**, JWT via JWKS, RBAC com checagens de ownership, CORS restritivo, sanitização anti-injeção e anti-SSRF.
- Banco maduro: FKs com `ON DELETE` semântico, RLS granular, RPC transacional.
- Comentários que documentam o *porquê* (deadlocks, N+1, quirks do supabase-py). `DEPLOY.md` excelente.
- 119 testes de backend com boa qualidade (regressão, authz, anti-injeção).

## 5. Pontos fracos (auditoria)

Sem achado **Crítico** confirmado. Principais **Alta**/**Média** (pós-verificação adversarial):

- **[A2]** `grades` não escopava o papel `coordinator` → IDOR entre períodos. ✅ *resolvido na melhoria 01*.
- **[A1]** Event loop bloqueado: endpoints `async` chamam supabase-py síncrono sem `to_thread`.
- **[A3]** Sem handlers globais de erro / contrato de erro padronizado.
- **[A4]** Sem ErrorBoundary global no frontend (tela branca em erro de render).
- **[A5]** Frontend com **zero** testes automatizados.
- **[A6]** Segredos reais de produção em disco local (`backend/.env`) — não versionados, mas exigem rotação.
- **[A7]** README materialmente desatualizado (2 de 8 migrations, 5 features omitidas).
- **[M1–M15]** services anêmica/god files, duplicação de authz, RLS inerte em runtime, fluxos sem transação, faltam CHECK constraints e índices trigram, paginação inconsistente, sem rate limit, re-render global, PDF/CSV síncrono, Docker sem non-root, observabilidade rasa, CI sem lint/cobertura, `python-jose` legado.

## 6. Backlog de melhorias (por categoria e prioridade)

Prioridade: 🟠 Alta · 🟡 Média · 🟢 Baixa.

| ID | Categoria | Melhoria | Prioridade |
|----|-----------|----------|:----------:|
| A2 | Segurança | Escopar `coordinator` em `grades` (authz) | 🟠 |
| A6 | Segurança | Rotacionar segredos + gestor de segredos | 🟠 |
| A1 | Performance/Backend | Corrigir modelo async (fim do bloqueio de event loop) | 🟠 |
| A4 | Frontend | ErrorBoundary global + `errorElement` | 🟠 |
| A3 | Backend | Handlers globais de erro + `ErrorResponse` + request-id | 🟠 |
| A5 | Testes | Suíte de frontend (Vitest+RTL) + e2e (Playwright) | 🟠 |
| A7 | Documentação | Atualizar README (migrations + features) | 🟠 |
| M5 | Banco | CHECK constraints (notas/faltas/créditos) | 🟠 |
| S1 | Segurança | Rate limiting + security headers + política de senha | 🟡 |
| M1 | Arquitetura | Camada `repositories/` + `*Service` por domínio | 🟡 |
| M2 | Clean Code | `services/permissions.py` (fim da duplicação de authz) | 🟡 |
| M4 | Backend | Transacionalidade (import CSV, attendance, users) | 🟡 |
| M6 | Banco | `pg_trgm` + índices GIN/trigram + b-tree ORDER BY | 🟡 |
| M15 | Testes | Testes de RLS (pgTAP) + integração dos ~50 endpoints | 🟡 |
| M12 | DevOps | Observabilidade (Sentry, logs JSON, healthz profundo) | 🟡 |
| M13 | DevOps | Lint/cobertura no CI + staging | 🟡 |
| M7 | API | Paginação uniforme + `/api/v1` + response_model tipado | 🟡 |
| M11 | Docker | Multi-stage + non-root + HEALTHCHECK | 🟡 |
| M14 | Dependências | Migrar `python-jose`→PyJWT; limpar deps mortas | 🟡 |
| M9 | Performance/Front | Seletores Zustand + `React.memo` nas células | 🟢 |
| U1 | UX/UI/A11y | ErrorBoundary UX, `AlertDialog`, skip-link, `DialogDescription`, contraste | 🟢 |
| D1 | Documentação | LICENSE/CONTRIBUTING/CHANGELOG/ADRs | 🟢 |

## 7. Riscos conhecidos

- **RLS inerte:** toda authz é de app; mudanças em routers precisam revisar guard de cada papel.
- **Worker único (Render free):** qualquer bloqueio síncrono congela o processo (agrava A1).
- **Zero teste de frontend:** mudanças de UI sem rede de segurança (mitigar com A5 antes de refactors grandes de front).
- **Dev e prod compartilham o mesmo Supabase:** cuidado com migrations/seed até existir staging (M13).

## 8. Dependências entre melhorias

- **M2** (permissions compartilhado) depende conceitualmente de **A2** já feito (grades já tem a regra a extrair). Idealmente **M1/M2 juntos**.
- **A3** (handlers de erro) facilita **M12** (observabilidade/request-id).
- **A1** (async) e **M10** (PDF/CSV) resolvem-se com o mesmo padrão (`def`/`to_thread`) → fazer juntos.
- **A5** (testes de front) deve preceder refactors grandes de frontend (U1, M9).
- **M13** (staging) reduz risco de **M4/M6/M5** (mudanças de banco) em produção.
