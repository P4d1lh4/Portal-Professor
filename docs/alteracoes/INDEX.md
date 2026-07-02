# Índice de Alterações

Controle de progresso das melhorias da auditoria. Fluxo por melhoria:
**Planejamento → Implementação → Revisão → Testes → Documentação → Validação**.

Status: Não iniciada · Em andamento · Em revisão · Em testes · Concluída · Bloqueada.

## Correções pós-merge (revisão adversarial do PR #28)

Bugs encontrados por revisão adversarial multi-agente do estado já mergeado (código novo do main Q4/Q5/S2 + minhas mudanças). 4 confirmados, 0 refutados.

| Etapa | Correção | Severidade | Status | Testes | Documento |
|:-----:|----------|:----------:|--------|--------|-----------|
| 20 | IDOR de coordenador em /professor/students/{id} | 🟠 Alta | ✅ Concluída | ✅ 159 pytest (+4) | [20-idor-coordenador-students.md](20-idor-coordenador-students.md) |
| 21 | Security headers ausentes em respostas 500 | 🟡 Média | ✅ Concluída | ✅ 159 pytest (+1) | [21-security-headers-500.md](21-security-headers-500.md) |
| 22 | GradeCell double-commit + rollback otimista concorrente | 🟢 Baixa | ✅ Concluída | ✅ lint/tsc/build | [22-grades-double-commit-rollback.md](22-grades-double-commit-rollback.md) |

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

> ⏳ **Ações manuais do responsável pelo deploy:** aplicar `0008`, `0009` e `0010` no SQL Editor do Supabase (nesta ordem; a `0010` **antes** de subir o backend novo); rotacionar segredos (A6).

> Backlog completo e prioridades: `docs/auditoria/00-estado-atual.md` (seções 6 e 8).
