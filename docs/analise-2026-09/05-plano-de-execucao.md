# 05 — Plano de execução

> Derivado dos relatórios [01](01-backend.md)–[04](04-produto-lacunas.md). IDs referenciam os achados. Esforço: **P** < 1 h · **M** 1–4 h · **G** > 4 h. Cada item vira uma branch + PR + `docs/alteracoes/NN-*.md` (template já em uso). Marque `[x]` ao concluir.

## Regras do jogo

- **Ordem dentro da fase é sugestão; ordem entre fases não.** Fase 0 antes de tudo.
- Todo item de backend ganha teste de trava (padrão `test_students_authz.py`). Todo item de frontend passa por `lint + tsc + vitest + build`.
- Mudança de banco = migração numerada (`0012+`) com rollback comentado, aplicada **primeiro em staging** (a partir da Fase 2).
- Itens marcados 🧭 dependem de decisão do dono do produto (lista em [00](00-resumo-executivo.md)). Não iniciar sem resposta.

---

## Fase 0 — Emergência operacional (hoje · ~3 h)

Critério de pronto: `readyz` 200, login funcionando, cron rodando, CVEs de upload/JWT fechados em produção.

- [ ] **O-01a** Restaurar o projeto Supabase no painel (Project → Restore). *Manual.*
- [x] **O-01b** Workflow `.github/workflows/keepalive.yml`: `schedule` a cada 10 min → `curl -f https://portal-professor.onrender.com/api/readyz`. Falha = e-mail do GitHub. Mantém Supabase ativo **e** Render acordado (O-02). — P · ✅ #67 (2026-09-14)
- [ ] **I-17** Confirmar no Render se Auto-Deploy está ligado; se não, ligar. *Manual.* — P
- [x] **B-01** Bumps de segurança: `python-multipart>=0.0.31` (mesclar #51), `PyJWT>=2.13`, `fastapi` que puxe `starlette>=0.49.1`; `npm audit fix` (`nanoid`, `postcss`). Rodar suíte, redeploy. — P/M · ✅ backend #51 #62 #67 (pip-audit limpo); frontend #60 #69 (sobram 2 moderados do `react-router` 6 → migrar para o 7)
- [x] **I-11** `seed.py`: `os.environ["SEED_ADMIN_PASSWORD"]` sem default (falhar se ausente). — P · ✅ #67
- [x] **I-27 / I-28 / I-30** Corrigir "0001–0007" no README (árvore) e no DEPLOY.md (checklist); marcar 0008–0010 como aplicadas no `docs/alteracoes/INDEX.md`. — P · ✅ #67
- [ ] **Local** `pip install -r requirements.txt --upgrade` no ambiente de dev (está com fastapi 0.115.0 / starlette 0.38.6 / multipart 0.0.12). — P · validado em venv isolado; o Python global segue antigo

## Fase 1 — Integridade e segurança (semana 1 · ~2 dias)

Critério: nenhum achado Alto de código aberto; migração 0012 aplicada; dashboard consistente.

### Backend
- [x] **B-02** `sheets.py`: recusar sync em período inativo (exceto admin) — reutilizar a checagem de `guards.py`. Teste: coordenador em período inativo → 403. — P · ✅ 409, como o `PUT /grades` (alteração 31)
- [ ] **B-03** `sheets.py:128-131`: `student:students!student_id!inner(...)` + `.eq("student.academic_period_id", …)`. Teste de integração contra staging/real. — P
- [x] **B-04** `exports.py`: `fetch_all` nos dois endpoints. Teste com fake que devolve páginas. — P · ✅ alteração 31
- [x] **B-06** `create_user`: validar `username` antes do Auth; logar exceção e devolver mensagem genérica. — M · ✅ alteração 31
- [x] **B-09** `EmailStr` em `StudentCreate`; `ge=0` em `credits`/`max_absences`; `max_length` em textos livres. — P · ✅ alteração 31

### Frontend
- [x] **F-01** `AttendancePage`: `useConfirm` antes de trocar módulo/data quando `isDirty`. — P · ✅ alteração 32
- [x] **F-02** Invalidar `["dashboard"]` nas mutations de students/modules/grades/attendance. — P · ✅ global, via `MutationCache` (alteração 32)
- [x] **F-03** Trocar os 4 `confirm()` nativos por `useConfirm` (`ModulesPage:53`, `PeriodsPage:72`, `UsersPage:124,134`). — P · ✅ alteração 32
- [x] **F-04** `<Fragment key>` em `AuditLogPage:208`. — P · ✅ alteração 32
- [x] **F-05** `formatGrade()` em `lib/utils.ts`; usar em `GradesPage:471` e `StudentDetailSheet`. — P · ✅ alteração 32
- [x] **F-06** `aria-label` nos `GradeCell`. — P · ✅ alteração 32
- [x] **F-16** `console.error` de `useAuth.ts:112` atrás de `isDev`. — P · ✅ alteração 32

### Banco — migração `0012_hardening.sql`

> 📝 I-01..I-06 escritos e validados em Postgres 18 local (alteração 33). ⏳ Falta **aplicar** no Supabase, depois do restore (O-01a); por isso seguem desmarcados.

- [ ] **I-02** `profiles_select`: `USING (id = auth.uid() OR is_admin())`. — P
- [ ] **I-01** `CHECK (end_date >= start_date)` em `academic_periods`. — P
- [ ] **I-03** `students.academic_period_id` e `modules.academic_period_id` → `ON DELETE RESTRICT`. — P
- [ ] **I-04** `UNIQUE (email)` em `profiles` (checar duplicatas antes). — P
- [ ] **I-05** Trigger `BEFORE UPDATE ON profiles` rejeitando troca de `role`/`is_active` por não-admin (projetado na `0011`). — M
- [ ] **I-06** `SET search_path = public, pg_temp` nas 4 funções de `0001:202-244`. — P
- [x] **I-13** `DATABASE_URL=` em `backend/.env.example`. — P · ✅ alteração 33

### Dependências
- [x] **O-03** (✅ 2026-09-14: #49 #51 #53 #55–#57 #62 #63 #65 mesclados; #50 #58 fechados com ignore; #54 #52 superados por #59 #60) Triage dos 10 PRs: mesclar verdes (#51 #53 #56 #57); fechar #58 (TS 7) até `typescript-eslint` suportar; #54 junto com `pytest 9`; majors (#49 #50 #52 #55) um por branch. Adicionar `groups:` no `dependabot.yml`. — M

## Fase 2 — Rede de segurança (semanas 2–3 · ~5 dias)

Critério: backup semanal rodando, staging existindo, CI validando migrações e Docker, cobertura ≥ 60%, suítes HTTP para todos os routers.

- [x] **I-24 / I-25** Workflow `backup.yml` semanal: `pg_dump | gzip` + download do bucket → artifact (90 dias). Documentar restore no DEPLOY.md. — M · ✅ com `supabase db dump` e **gpg** (repo público: artifact é baixável por qualquer um); restore ensaiado localmente. ⏳ Cadastrar os 4 secrets e rodar à mão após o restore do Supabase (alteração 40)
- [ ] **I-23** Staging: 2º projeto Supabase free + `apply_migration.py --all` + seed + 2º serviço Render + preview Vercel. Fluxo "migração vai primeiro para staging". — M
- [ ] **I-12** Rotacionar `service_role` e `jwt_secret` no painel; atualizar Render e `.env` local. *Manual.* — M
- [x] **I-15** Job de CI com `services: postgres` rodando `apply_migration.py --all`. — M · ✅ + `supabase/ci/checks.sql` (alteração 34)
- [x] **I-16** Job de CI `docker build ./backend`. — P · ✅ + smoke test (healthz, non-root) (alteração 35)
- [x] **I-18** `--cov-fail-under=60`. — P · ✅ alteração 35
- [x] **B-12** Fake de DB único em `conftest.py` que **registra** os filtros aplicados (`.eq/.in_/.or_`) para asserção. Migrar os 6 fakes duplicados. — M · ✅ `tests/fakes.py` + `as_user` no conftest; eram 11 fakes (alteração 36)
- [x] **B-13** Testes HTTP (3 papéis × dono/não-dono) para `users`, `medical_certificates`, `sheets`, `reports`, `exports`, `audit`; `professor` no dashboard. — G · ✅ +69 testes, cobertura 73,6%, piso 70% (alteração 37)
- [x] **F-17a** Infra: `environment: "jsdom"` + `setupFiles` no `vite.config.ts`; `@testing-library/react`, `jest-dom`, `user-event`, `msw`. — M · ✅ sem `msw` (entra no F-17b quando uma suíte precisar de rede); smoke test do `useConfirm` (alteração 38)
- [x] **F-17b** Suítes: `axios.ts` interceptors → `ProtectedRoute` → `useAuth` → `GradesPage` (edit → PUT → indicador, rollback) → `AttendancePage` (rascunho, F-01). — G · ✅ 33 testes em 5 suítes, sem `msw` (`vi.mock` nas apis + adapter no axios); 6 mutações pegas (alteração 39)
- [x] **I-26** Runbook `docs/runbook.md`: Supabase pausado, `readyz` 503, rotação de chaves, restore de backup. — M · ✅ + triagem healthz/readyz, Render fora, "tudo verde mas ninguém entra" (alteração 41)

## Fase 3 — Fechar fluxos de produto (semanas 4–6 · ~6 dias)

Critério: jornada do coordenador completa ponta a ponta; professor vê risco antes do fechamento; CSV round-trip.

- [x] **P-Q1 / B-S2** `POST /api/modules/{id}/enrollments` (aluno existente) + `DELETE` de matrícula + botão em `ModulesPage`/`StudentDetailSheet`. Ao criar aluno com `student_number` existente, oferecer "matricular o existente". — M · ✅ endpoints (admin/coordenador) + controles na ficha do aluno; o 409 aponta o caminho. Botão em lote na `ModulesPage` fica para junto do P-Q5 (alteração 42)
- [x] **P-Q2** Import aceita cabeçalhos pt-BR e snake_case (mapa de aliases). — P · ✅ + sem acento, data DD/MM/AAAA e regra de data do formulário; teste de round-trip com o CSV do export (alteração 43)
- [x] **P-Q3 / B-05** `write_audit_log` em `users` (role/is_active), `sheets` (resumo), `attendance` delete, `medical_certificates`; `action="insert"` nas criações. — M · ✅ + anexos, import (resumo), URL da planilha, encerrar/reabrir período; atestado sem motivo no log; chamada excluída guarda as marcações (alteração 44)
- [x] **P-N1 / B-S1 / F-S2** `GET /api/modules/{id}/students/at-risk` + card no dashboard do professor + destaque na Chamada. — M · ✅ sem endpoint novo: campo `risk` em `/modules/{id}/students` + `at_risk` no dashboard, regra única `risk_reasons` (alteração 45)
- [x] **P-N2** Seção "atenção" no relatório de período em PDF. — P · ✅ mesma regra/ordem do P-N1 via `grade_risk`/`risk_sort_key` (alteração 46)
- [x] **P-Q5 / B-S3** `POST /api/periods/{id}/clone` (módulos sem alunos) + botão em `PeriodsPage`. — M · ✅ + import acusa matrícula de outro período (`student_number` é único global). Levar os alunos depende do 🧭 B-08; a matrícula em lote do P-Q1 não foi necessária (o import já matricula em todos os módulos) (alteração 47)
- [x] **P-Q4 / B-S4 / F-S4** Export CSV de frequência + botão na Chamada. — P · ✅ matriz aluno × dia (P/F/J + totais), mesmo padrão e permissão do export de notas (alteração 48)
- [x] **P-Q8** Paginar `/api/professor/students`. — P · ✅ + busca no servidor, detalhe só da página, matrículas com `fetch_all` (antes cortava em 1000) (alteração 50)
- [x] **F-S1** Filtro por situação na GradesPage. — P · ✅ + "Em risco" (alteração 51)
- [x] **F-08** Cards mobile em Notas e Chamada (padrão de `StudentsPage`). — M · ✅ só com CSS sobre a mesma tabela (sem duplicar linhas); P/F/J com 44 px (alteração 53)
- [x] **P-N4** "faltas / chamadas registradas" ao lado de "faltas / máximo". — P · ✅ na tela de Notas: "N chamadas registradas" + "% das aulas" por aluno (alteração 52)
- [x] **P-06** `reports.py` usar `classify_status`; teste que compara as 4 implementações. — P · ✅ + selo da ficha do aluno; tabela `classification.cases.json` lida por pytest e vitest (alteração 49)

## Fase 4 — Consistência e dívida técnica (contínuo · ~4 dias)

- [x] **B-07** Mover `_assert_can_access_student` e `_assert_professor_has_student` para `services/permissions.py`; migrar `sheets`, `import_csv`, `reports`, `medical_certificates`. Um router por PR, teste antes. — M cada · ✅ students, reports e atestados num PR só; `sheets`/`import_csv`/`exports` mantêm a comparação com a linha já carregada (alteração 59)
- [ ] **B-S8** Sentry (`sentry-sdk[fastapi]`, DSN por env) + `ENV`/`LOG_LEVEL` em `config.py` (I-14). — P
- [x] **F-10 / F-11** Remover 5 tipos mortos, `UnderConstruction`, `RoleBadge`, `tooltip.tsx` + `@radix-ui/react-tooltip`. — P · ✅ + `EnrollmentStatus` e a entrada no `optimizeDeps` (alteração 54)
- [x] **F-12** `<AsyncSelectField>`, `usePagination()`, `date-fns` na Chamada, `aria-describedby` nos dialogs. — M · ✅ `<SelectOptionsStatus>`, `<Pagination>` e aria nos 6 dialogs; `usePagination()` e `date-fns` na Chamada ficaram de fora, com o motivo (alteração 60)
- [x] **F-13** Página 404. — P · ✅ `NotFoundPage` com o `EmptyState`, dentro do AppShell (alteração 55)
- [x] **I-07 / I-08 / I-09 / I-10** Apagar `0002_seed_instructions.sql`; trigger `updated_at` em `grades`; versionar `schema_migrations`; comentário na `0002` apontando para `0011`. — P · ✅ 0013 (trigger `last_updated` + `schema_migrations` com RLS); a nota da 0011 foi para o DEPLOY.md para não mudar o checksum da 0002. ⏳ aplicar 0012+0013 após o restore (alteração 56)
- [x] **I-22** Remover `version:` do compose; pinar base images por digest; `docker` no Dependabot. — P · ✅ tag + digest, Dependabot semanal para /backend e /frontend (alteração 57)
- [ ] **O-04 / O-05** Auto-delete de branches no GitHub + limpeza única; tag por deploy. — P
- [x] **I-31** `CONTRIBUTING.md` (formalizar o fluxo de `docs/alteracoes/`), ADR "authz é app-layer; service_role bypassa RLS", citar `diagnose.py`/`apply_migration.py` no README. — M · ✅ + template de PR; README de Segurança corrigido (alteração 58)
- [x] **B-11** Convenção sync/async em uma linha no CONTRIBUTING. — P · ✅ (alteração 58)
- [ ] **F-09** `React.memo` em linhas de Notas/Chamada (só se turmas > 150). — M
- [x] **F-14** Reavaliar `refetchOnReconnect` para `grades`/`attendance`. — P · ✅ decidido manter `false`: na Chamada o refetch apagaria o rascunho não salvo (alteração 60)

## Fase 5 — Novas funcionalidades (após decisões 🧭)

- [ ] 🧭 **P-11** Definir papel de `tutor_grade` (entra na média? remover?). — decisão
- [ ] 🧭 **P-Q6 / P-08** Fonte de verdade das faltas: aviso, bloqueio da edição manual, ou trigger não sobrescreve. — P após decisão
- [ ] 🧭 **P-Q7** Atestado → marcar `justified` no intervalo (automático ou com revisão). — M
- [ ] 🧭 **P-Q9 / P-04** Liberar `/audit-log` para coordenador/professor. — P
- [ ] 🧭 **B-08** Modelagem aluno × período (manter 1:1 ou introduzir "pessoa"). — decisão (G se mudar)
- [ ] **P-N3** `student_notes` append-only (migração + endpoint + lista no `StudentDetailSheet`). — M
- [ ] **P-Q10** Campo "conteúdo ministrado" na chamada. — P
- [ ] **B-S5** Reset de senha de usuário pelo admin. — P
- [ ] **B-S6 / P-09** Boletim lista os atestados reais. — P
- [ ] **P-N9 / B-S7** Import CSV de notas. — M
- [ ] 🧭 **P-N5** E-mail (lembrete de fechamento, aluno em risco) via Edge Function/cron. — M
- [ ] 🧭 **P-N6** Portal do aluno/responsável (4º papel, só leitura). — G
- [ ] 🧭 **O-02** Render Starter e/ou Supabase Pro quando houver uso real. — custo

---

## Dependências entre itens

- **O-01b** (keep-alive) desbloqueia qualquer teste contra produção (B-03 precisa de banco vivo).
- **I-23** (staging) deve existir antes de **0012** ir para produção e antes de **B-03** ser validado.
- **B-12** (fake que registra filtros) antes de **B-13** (evita duplicar o 7º fake).
- **F-17a** (infra de testes) antes de **F-17b** e antes de **F-08** (refactor grande de UI sem rede).
- **P-Q1** (matrícula) antes de **P-Q5** (clonar período faz sentido com matrícula manual disponível).
- **P-N1** (at-risk) antes de **P-N2** e **P-N5**.
- **B-07** (permissions) por último em cada router, depois que ele tiver testes (B-13).

## Estimativa total

| Fase | Esforço | Calendário sugerido |
|---|---|---|
| 0 | ~3 h | hoje |
| 1 | ~2 dias | semana 1 |
| 2 | ~5 dias | semanas 2–3 |
| 3 | ~6 dias | semanas 4–6 |
| 4 | ~4 dias | contínuo |
| 5 | depende das decisões | após Fase 3 |
