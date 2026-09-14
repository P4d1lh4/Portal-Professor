# Índice de Alterações

Controle de progresso das melhorias da auditoria. Fluxo por melhoria:
**Planejamento → Implementação → Revisão → Testes → Documentação → Validação**.

Status: Não iniciada · Em andamento · Em revisão · Em testes · Concluída · Bloqueada.

## Análise 2026-09

| Etapa | Item | Severidade | Status | Testes | Documento |
|:-----:|------|:----------:|--------|--------|-----------|
| 27 | [O-03] Triagem dos 10 PRs do Dependabot + `groups`/`ignore` | 🟡 Média | ✅ Concluída | ✅ 162 pytest · CI verde | [27-triagem-prs-dependabot.md](27-triagem-prs-dependabot.md) |
| 28 | [O-03] Vite 8 (Rolldown) + plugin-react 6 + vitest 4 | 🟢 Baixa | ✅ Concluída | ✅ lint/tsc/vitest/build | [28-vite-8.md](28-vite-8.md) |
| 29 | [Fase 0] Keep-alive, B-01 backend, seed sem default, docs de migração | 🔴 Crítica | ✅ Concluída | ✅ 162 pytest · pip-audit limpo | [29-fase-0-emergencia.md](29-fase-0-emergencia.md) |
| 30 | [O-03/B-01] recharts 3 + eslint 10 + `npm audit fix` (e fim do `vendor-charts`) | 🟡 Média | ✅ Concluída | ✅ lint/tsc/vitest/build + chunks | [30-recharts-3-eslint-10.md](30-recharts-3-eslint-10.md) |
| 31 | [Fase 1] Backend: sync em período fechado, exports paginados, `create_user`, schemas (B-02/04/06/09) | 🟠 Alta | ✅ Concluída | ✅ 174 pytest (+12) | [31-fase-1-backend.md](31-fase-1-backend.md) |
| 32 | [Fase 1] Frontend: rascunho da Chamada, dashboard invalidado, `useConfirm`, `formatGrade`, a11y (F-01..06, F-16) | 🟠 Alta | ✅ Concluída | ✅ lint/tsc/vitest/build | [32-fase-1-frontend.md](32-fase-1-frontend.md) |
| 33 | [Fase 1] Migração `0012_hardening` (I-01..I-06) + `DATABASE_URL` no `.env.example` (I-13) + `credits > 0` | 🟡 Média | ✅ Concluída | ✅ PG 18 local: 11 checks + rollback · ⏳ aplicar no Supabase | [33-migracao-0012-hardening.md](33-migracao-0012-hardening.md) |
| 34 | [Fase 2] I-15: job de CI aplica 0001→última em `postgres:17` + checks de schema | 🟡 Média | ✅ Concluída | ✅ local PG 18: apply `--all` + 12 checks | [34-ci-migracoes-postgres.md](34-ci-migracoes-postgres.md) |
| 35 | [Fase 2] I-16: CI builda e sobe a imagem do backend (healthz + non-root) · I-18: cobertura ≥ 60% | 🟠 Alta | ✅ Concluída | ✅ docker build + smoke local · pytest ≥ 60% | [35-ci-docker-cobertura.md](35-ci-docker-cobertura.md) |
| 36 | [Fase 2] B-12: fake de banco único (`tests/fakes.py`) com registro de filtros + `as_user` no conftest; 11 fakes migrados | 🟡 Média | ✅ Concluída | ✅ 174 pytest · −599 linhas · mutação pega | [36-fake-db-unico.md](36-fake-db-unico.md) |
| 37 | [Fase 2] B-13: testes HTTP de authz em users, atestados, sheets, reports, exports, audit + professor no dashboard; piso de cobertura 70% | 🟠 Alta | ✅ Concluída | ✅ 243 pytest (+69) · cobertura 73,6% · 3 mutações pegas | [37-testes-http-routers.md](37-testes-http-routers.md) |
| 38 | [Fase 2] F-17a: infra de testes de componente (jsdom + Testing Library) + smoke test do `useConfirm` | 🟠 Alta | ✅ Concluída | ✅ vitest 10/10 · lint/tsc/build · mutação pega | [38-infra-testes-componente.md](38-infra-testes-componente.md) |
| 39 | [Fase 2] F-17b: suítes de componente (interceptors do axios, `ProtectedRoute`, `useAuth`, Notas, Chamada/F-01), sem `msw` | 🟠 Alta | ✅ Concluída | ✅ vitest 43/43 (+33) · lint/tsc/build · 6 mutações pegas | [39-suites-componente.md](39-suites-componente.md) |
| 40 | [Fase 2] I-24/I-25: workflow `backup.yml` semanal (banco via `supabase db dump` + anexos do bucket), criptografado com gpg por o repo ser público; restore no DEPLOY.md | 🟠 Alta | ✅ Concluída (⏳ secrets) | ✅ dump → restore local idêntico · gpg ida e volta · 3 pytest | [40-backup-semanal.md](40-backup-semanal.md) |
| 41 | [Fase 2] I-26: runbook `docs/runbook.md` (triagem healthz/readyz, Supabase pausado, Render, chaves, restore) | 🟡 Média | ✅ Concluída | ✅ comandos, variáveis e links conferidos | [41-runbook.md](41-runbook.md) |
| 42 | [Fase 3] P-Q1/B-S2: matricular aluno existente e desmatricular (`POST /modules/{id}/enrollments`, `DELETE /enrollments/{id}`) + controles na ficha do aluno | 🟠 Alta | ✅ Concluída | ✅ 15 pytest + 4 vitest · 6 mutações pegas | [42-matricular-aluno-existente.md](42-matricular-aluno-existente.md) |
| 43 | [Fase 3] P-Q2: import de alunos aceita o cabeçalho pt-BR do export (sem acento também) e data DD/MM/AAAA; round-trip export → import | 🟠 Alta | ✅ Concluída | ✅ 6 pytest novos · 21/21 import · 4 mutações pegas | [43-import-cabecalhos-ptbr.md](43-import-cabecalhos-ptbr.md) |
| 44 | [Fase 3] P-Q3/B-05: auditoria em usuários (papel/ativo), atestados e anexos (sem dado de saúde), exclusão de chamada (com as marcações), planilha, import e `insert` nas criações de período/módulo/aluno; encerrar período | 🟡 Média | ✅ Concluída | ✅ 13 pytest · cobertura 79,9% · 9 mutações pegas | [44-auditoria-completa.md](44-auditoria-completa.md) |

## Correções pós-merge (revisão adversarial do PR #28)

Bugs encontrados por revisão adversarial multi-agente do estado já mergeado (código novo do main Q4/Q5/S2 + minhas mudanças). 4 confirmados, 0 refutados.

| Etapa | Correção | Severidade | Status | Testes | Documento |
|:-----:|----------|:----------:|--------|--------|-----------|
| 20 | IDOR de coordenador em /professor/students/{id} | 🟠 Alta | ✅ Concluída | ✅ 159 pytest (+4) | [20-idor-coordenador-students.md](20-idor-coordenador-students.md) |
| 21 | Security headers ausentes em respostas 500 | 🟡 Média | ✅ Concluída | ✅ 159 pytest (+1) | [21-security-headers-500.md](21-security-headers-500.md) |
| 22 | GradeCell double-commit + rollback otimista concorrente | 🟢 Baixa | ✅ Concluída | ✅ lint/tsc/build | [22-grades-double-commit-rollback.md](22-grades-double-commit-rollback.md) |
| 23 | [M9] Bundle: manualChunks + untrack configs compilados | 🟡 Média | ✅ Concluída | ✅ build (549→341kB) | [23-bundle-manualchunks.md](23-bundle-manualchunks.md) |
| 24 | Acessibilidade: skip-link, título do drawer e do command palette | 🟢 Baixa | ✅ Concluída | ✅ lint/tsc/build | [24-acessibilidade.md](24-acessibilidade.md) |
| 25 | UX: `useConfirm` (diálogo) no lugar de `window.confirm` (3 usos) | 🟢 Baixa | ✅ Concluída | ✅ lint/tsc/build | [25-confirm-dialog.md](25-confirm-dialog.md) |
| 26 | a11y: contraste AA do `warning` + `aria-live` no SaveIndicator | 🟢 Baixa | ✅ Concluída | ✅ lint/tsc/build | [26-contraste-arialive.md](26-contraste-arialive.md) |

## Concluídas (backlog Alta)

| Etapa | Melhoria | Prioridade | Status | Testes | Documento |
|:-----:|----------|:----------:|--------|--------|-----------|
| 01 | [A2] Escopar `coordinator` em `grades` (authz) | 🟠 Alta | ✅ Concluída | ✅ 121 passed | [01-authz-coordenador-grades.md](01-authz-coordenador-grades.md) |
| 02 | [A7] Atualizar README (migrations + features) | 🟠 Alta | ✅ Concluída | ✅ docs (revisão) | [02-readme-desatualizado.md](02-readme-desatualizado.md) |
| 03 | [M5] CHECK constraints no banco (notas/faltas) | 🟠 Alta | ✅ Concluída | ✅ offline · ⏳ aplicar no Supabase | [03-check-constraints-notas.md](03-check-constraints-notas.md) |
| 04 | [A4] ErrorBoundary global no frontend | 🟠 Alta | ✅ Concluída | ✅ tsc --noEmit | [04-errorboundary-global.md](04-errorboundary-global.md) |
| 05 | [A3] Handlers globais de erro + contrato | 🟠 Alta | ✅ Concluída | ✅ 121 passed | [05-handlers-globais-erro.md](05-handlers-globais-erro.md) |
| 06 | [A1+M10] Corrigir modelo async (event loop) | 🟠 Alta | ✅ Concluída | ✅ 121 passed | [06-event-loop-bloqueado.md](06-event-loop-bloqueado.md) |
| 07 | [A5] Suíte de testes de frontend (Vitest) | 🟠 Alta | ✅ Concluída | ✅ 7 passed + tsc | [07-testes-frontend.md](07-testes-frontend.md) |

## Concluídas (backlog Média)

| Etapa | Melhoria | Prioridade | Status | Testes | Documento |
|:-----:|----------|:----------:|--------|--------|-----------|
| 08 | [M14] Higiene de dependências (jose 3.5, remove deps mortas) | 🟡 Média | ✅ Concluída | ✅ 121 pytest + build | [08-higiene-dependencias.md](08-higiene-dependencias.md) |
| 09 | [S1] Rate limit + security headers + política de senha | 🟡 Média | ✅ Concluída | ✅ 127 pytest (+6) | [09-rate-limit-headers-senha.md](09-rate-limit-headers-senha.md) |
| 10 | [M2] Consolidação de authz (`services/permissions.py`, núcleo) | 🟡 Média | ✅ Concluída (parcial) | ✅ 130 pytest (+3) | [10-permissions-consolidacao.md](10-permissions-consolidacao.md) |
| 11 | [M6] Índices trigram + ordenação | 🟡 Média | ✅ Concluída | ✅ offline · ⏳ aplicar no Supabase | [11-indices-busca.md](11-indices-busca.md) |
| 12 | [M15] Testes de integração de authz em /modules | 🟡 Média | ✅ Concluída | ✅ 4 passed (pré-refactor) | [12-testes-integracao-modules.md](12-testes-integracao-modules.md) |
| 13 | [M2] Migrar /modules p/ helper canônico | 🟡 Média | ✅ Concluída | ✅ 134 pytest | [13-permissions-modules.md](13-permissions-modules.md) |
| 14 | [M4] Save de chamada atômico (RPC 0010) | 🟡 Média | ✅ Concluída | ✅ 137 pytest · ⏳ aplicar 0010 | [14-attendance-transacional.md](14-attendance-transacional.md) |
| 15 | [M13] Lint funcional + cobertura no CI | 🟡 Média | ✅ Concluída (parcial) | ✅ lint 0 erros · cov 57% > 50% | [15-lint-cobertura-ci.md](15-lint-cobertura-ci.md) |
| 16 | [M12] Observabilidade: request-id + readyz | 🟡 Média | ✅ Concluída (parcial) | ✅ 142 pytest (+5) | [16-observabilidade.md](16-observabilidade.md) |
| 17 | [M11] Docker: non-root + HEALTHCHECK + dev-only | 🟡 Média | ✅ Concluída | ✅ revisão · ⏳ build (sem daemon) | [17-docker-hardening.md](17-docker-hardening.md) |
| 18 | [M2] Migrar /attendance p/ helper canônico | 🟡 Média | ✅ Concluída | ✅ 143 pytest | [18-permissions-attendance.md](18-permissions-attendance.md) |
| 19 | [M4] Import CSV atômico por aluno (RPC 0007) | 🟡 Média | ✅ Concluída | ✅ 145 pytest (+2) | [19-import-csv-transacional.md](19-import-csv-transacional.md) |

## Pendências / Bloqueadas

| Melhoria | Prioridade | Status | Motivo |
|----------|:----------:|--------|--------|
| [A6] Rotação de segredos | 🟠 Alta | 🔒 Bloqueada | Ação manual no painel Supabase |
| [M2 restante] Migrar `sheets`/`import_csv`/`attendance`/`medical`/`dashboard` | 🟡 Média | ⏸ Em progresso | `modules` já migrado (13); demais após travar comportamento com testes |
| [M15 RLS] Testes de RLS (pgTAP) | 🟡 Média | ⚠ Requer ambiente | Precisa de Postgres com troca de role (`SET ROLE`) — não há banco local |
| [M13 restante] Staging + CD acoplado | 🟡 Média | ⚠ Requer infra | 2º projeto Supabase + deploy hooks — ação do responsável |
| [M4 restante] Criação de usuário atômica (Auth+profile) | 🟡 Média | ⏸ Parcial | attendance (14) e import CSV (19) feitos; user Auth não é transacionável via RPC (serviço separado) |

## Avaliadas e conscientemente NÃO feitas (ponytail)

| Item | Decisão | Razão |
|------|---------|-------|
| [M7] `total` no `GET /modules` + `/api/v1` | ⛔ YAGNI | Frontend não pagina módulos (carrega a lista inteira, sem UI de paginação nem uso de `total`); `le=500` já limita a resposta. Seria breaking change back+front por um `total` que ninguém consome, num API de consumidor único. `/api/v1` é prematuro (um só cliente). Reavaliar quando houver integração externa ou paginação real na UI. |

## Próximas (backlog Média — ainda não iniciadas)

`M12 restante` Sentry (precisa DSN) + formatter JSON · `M2 restante` (`sheets`/`import_csv`/`medical`/`dashboard` + professor↔aluno) · `M1` camada de repositório (grande — reavaliar escopo/necessidade).

> ✅ `0008`–`0011` já aplicadas em produção (confirmado em 2026-08-05). ⏳ **Ação manual pendente:** rotacionar segredos (A6).

> Backlog completo e prioridades: `docs/auditoria/00-estado-atual.md` (seções 6 e 8).
