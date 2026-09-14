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

- [ ] **I-24 / I-25** Workflow `backup.yml` semanal: `pg_dump | gzip` + download do bucket → artifact (90 dias). Documentar restore no DEPLOY.md. — M
- [ ] **I-23** Staging: 2º projeto Supabase free + `apply_migration.py --all` + seed + 2º serviço Render + preview Vercel. Fluxo "migração vai primeiro para staging". — M
- [ ] **I-12** Rotacionar `service_role` e `jwt_secret` no painel; atualizar Render e `.env` local. *Manual.* — M
- [x] **I-15** Job de CI com `services: postgres` rodando `apply_migration.py --all`. — M · ✅ + `supabase/ci/checks.sql` (alteração 34)
- [ ] **I-16** Job de CI `docker build ./backend`. — P
- [ ] **I-18** `--cov-fail-under=60`. — P
- [ ] **B-12** Fake de DB único em `conftest.py` que **registra** os filtros aplicados (`.eq/.in_/.or_`) para asserção. Migrar os 6 fakes duplicados. — M
- [ ] **B-13** Testes HTTP (3 papéis × dono/não-dono) para `users`, `medical_certificates`, `sheets`, `reports`, `exports`, `audit`; `professor` no dashboard. — G
- [ ] **F-17a** Infra: `environment: "jsdom"` + `setupFiles` no `vite.config.ts`; `@testing-library/react`, `jest-dom`, `user-event`, `msw`. — M
- [ ] **F-17b** Suítes: `axios.ts` interceptors → `ProtectedRoute` → `useAuth` → `GradesPage` (edit → PUT → indicador, rollback) → `AttendancePage` (rascunho, F-01). — G
- [ ] **I-26** Runbook `docs/runbook.md`: Supabase pausado, `readyz` 503, rotação de chaves, restore de backup. — M

## Fase 3 — Fechar fluxos de produto (semanas 4–6 · ~6 dias)

Critério: jornada do coordenador completa ponta a ponta; professor vê risco antes do fechamento; CSV round-trip.

- [ ] **P-Q1 / B-S2** `POST /api/modules/{id}/enrollments` (aluno existente) + `DELETE` de matrícula + botão em `ModulesPage`/`StudentDetailSheet`. Ao criar aluno com `student_number` existente, oferecer "matricular o existente". — M
- [ ] **P-Q2** Import aceita cabeçalhos pt-BR e snake_case (mapa de aliases). — P
- [ ] **P-Q3 / B-05** `write_audit_log` em `users` (role/is_active), `sheets` (resumo), `attendance` delete, `medical_certificates`; `action="insert"` nas criações. — M
- [ ] **P-N1 / B-S1 / F-S2** `GET /api/modules/{id}/students/at-risk` + card no dashboard do professor + destaque na Chamada. — M
- [ ] **P-N2** Seção "atenção" no relatório de período em PDF. — P
- [ ] **P-Q5 / B-S3** `POST /api/periods/{id}/clone` (módulos sem alunos) + botão em `PeriodsPage`. — M
- [ ] **P-Q4 / B-S4 / F-S4** Export CSV de frequência + botão na Chamada. — P
- [ ] **P-Q8** Paginar `/api/professor/students`. — P
- [ ] **F-S1** Filtro por situação na GradesPage. — P
- [ ] **F-08** Cards mobile em Notas e Chamada (padrão de `StudentsPage`). — M
- [ ] **P-N4** "faltas / chamadas registradas" ao lado de "faltas / máximo". — P
- [ ] **P-06** `reports.py` usar `classify_status`; teste que compara as 4 implementações. — P

## Fase 4 — Consistência e dívida técnica (contínuo · ~4 dias)

- [ ] **B-07** Mover `_assert_can_access_student` e `_assert_professor_has_student` para `services/permissions.py`; migrar `sheets`, `import_csv`, `reports`, `medical_certificates`. Um router por PR, teste antes. — M cada
- [ ] **B-S8** Sentry (`sentry-sdk[fastapi]`, DSN por env) + `ENV`/`LOG_LEVEL` em `config.py` (I-14). — P
- [ ] **F-10 / F-11** Remover 5 tipos mortos, `UnderConstruction`, `RoleBadge`, `tooltip.tsx` + `@radix-ui/react-tooltip`. — P
- [ ] **F-12** `<AsyncSelectField>`, `usePagination()`, `date-fns` na Chamada, `aria-describedby` nos dialogs. — M
- [ ] **F-13** Página 404. — P
- [ ] **I-07 / I-08 / I-09 / I-10** Apagar `0002_seed_instructions.sql`; trigger `updated_at` em `grades`; versionar `schema_migrations`; comentário na `0002` apontando para `0011`. — P
- [ ] **I-22** Remover `version:` do compose; pinar base images por digest; `docker` no Dependabot. — P
- [ ] **O-04 / O-05** Auto-delete de branches no GitHub + limpeza única; tag por deploy. — P
- [ ] **I-31** `CONTRIBUTING.md` (formalizar o fluxo de `docs/alteracoes/`), ADR "authz é app-layer; service_role bypassa RLS", citar `diagnose.py`/`apply_migration.py` no README. — M
- [ ] **B-11** Convenção sync/async em uma linha no CONTRIBUTING. — P
- [ ] **F-09** `React.memo` em linhas de Notas/Chamada (só se turmas > 150). — M
- [ ] **F-14** Reavaliar `refetchOnReconnect` para `grades`/`attendance`. — P

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
