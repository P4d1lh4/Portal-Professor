# 01 — Relatório: Backend (FastAPI)

> Parte da [Análise completa de 2026-09-03](README.md). Achados com prefixo **B-**.
> Método: leitura integral de `backend/app/` (13 routers, 9 services, schemas, `deps.py`, `auth.py`, `db.py`, `main.py`) e de 23 dos 27 arquivos de teste, seguida de verificação manual dos achados de maior impacto.

## 1. Estado verificado em 2026-09-03

| Item | Resultado |
|---|---|
| `pytest` (162 testes) | ✅ 162 passed |
| Cobertura total | 61% (piso do CI: 50%) |
| Endpoints | 55 (27 GET · 12 POST · 9 PUT · 7 DELETE) em 13 routers |
| Linhas em `app/` | ~5.5k (8.8k com testes) |
| `pip-audit` sobre `requirements.txt` | ⚠️ advisories novos em `python-multipart`, `pyjwt`, `starlette`, `pytest` (ver B-01) |
| Ambiente local (`pip list`) | ⚠️ divergente do `requirements.txt` (fastapi 0.115.0 / starlette 0.38.6 / python-multipart 0.0.12 instalados vs 0.115.6 / 0.41 / 0.0.18 pinados) — os CVEs "corrigidos" em julho continuam instalados localmente |

Cobertura por arquivo (os piores):

| Arquivo | Cobertura |
|---|---|
| `routers/dashboard.py` | 17% |
| `routers/reports.py` | 22% |
| `routers/medical_certificates.py` | 25% |
| `routers/sheets.py` | 26% |
| `routers/users.py` | 28% |
| `routers/exports.py` | 34% |
| `routers/periods.py` | 39% |

## 2. Mapa de endpoints e guards

Legenda: **CANÔNICO** = `assert_coordinator_owns_period` (`services/permissions.py:12`) · **CÓPIA** = mesma regra reimplementada localmente · **EMBUTIDO** = escopo só pela query · **—** = admin-only.

| Router | Rotas | Guard predominante | Teste de authz |
|---|---|---|---|
| `periods.py` | 7 | CÓPIA `_assert_period_access` (`periods.py:18-44`) | GET `{id}`: 5 casos ✅ |
| `modules.py` | 7 | CANÔNICO (POST/PUT/DELETE) + CÓPIA `_assert_read_access` (GET) | ✅ 9 casos |
| `students.py` | 10 | CANÔNICO via `_assert_can_access_student` (`students.py:556-581`) | ✅ 8 casos |
| `grades.py` | 2 | CÓPIA `_get_grade_with_permission` (`grades.py:27-69`) | PUT: 3 casos ✅ |
| `attendance.py` | 4 | CANÔNICO via `_assert_module_access` (`attendance.py:45-49`) | PUT: 4 casos ✅ |
| `import_csv.py` | 1 | CÓPIA inline (`import_csv.py:130-131`) | persistência ✅ · authz negativa ❌ |
| `sheets.py` | 2 | CÓPIA inline (`sheets.py:104-105`, `216-217`) | ❌ (só validador de URL) |
| `dashboard.py` | 1 | CANÔNICO (`dashboard.py:130-133`) | 1 caso ✅ |
| `medical_certificates.py` | 8 | CÓPIA `_assert_can_access_student` (`medical_certificates.py:45-91`) | ❌ **zero testes no router** |
| `reports.py` | 2 | CÓPIA (`reports.py:236-267`) | ❌ (só serviço PDF) |
| `exports.py` | 2 | CÓPIA + CANÔNICO | ❌ (só serviço CSV) |
| `audit.py` | 1 | EMBUTIDO (`audit.py:27-30`) | ❌ |
| `users.py` | 9 | — (admin) | ❌ **zero testes no router** |

**Conclusão do mapa:** nenhuma rota item-level está sem guard de escopo (os IDORs de julho foram fechados). A dívida é de **consistência** (4 variantes da mesma regra de coordenador) e de **cobertura de teste** (5 routers sem nenhum teste HTTP).

## 3. Achados

### B-01 · Advisories de segurança novos nas dependências pinadas — **Alto · confirmado · P**
`pip-audit -r requirements.txt` (rodado hoje):

| Pacote | Pinado | Advisories | Corrige em |
|---|---|---|---|
| `python-multipart` | 0.0.18 | 6 (PYSEC-2026-1852, -3036…-3040) | 0.0.31 |
| `pyjwt` | 2.9.0 | 7 (PYSEC-2026-120, -175…-179, PYSEC-2025-183) | 2.13.0 |
| `starlette` (via fastapi 0.115.6) | 0.41.3 | 8 (PYSEC-2026-161, -248, -249, -1941, -1942, -2280, -2281) | 0.49.1 / 1.x |
| `pytest` | 8.3.3 | 1 (PYSEC-2026-1845) | 9.0.3 |

`python-multipart` e `starlette` estão no caminho de upload (atestados PDF, import CSV); `pyjwt` valida **todo** token de sessão. O Dependabot já abriu PRs #49–#54, mas dois falham no CI (ver [03-banco-infra-devops.md](03-banco-infra-devops.md) I-05).
**Fix:** subir `python-multipart>=0.0.31`, `PyJWT>=2.13.0`, `fastapi` para versão que puxe `starlette>=0.49.1`, rodar a suíte, redeployar. Reinstalar o ambiente local (`pip install -r requirements.txt --upgrade`).

### B-02 · Sync de planilha grava notas em período fechado — **Alto · confirmado · P**
`_apply_sheet_grades` (`routers/sheets.py:114-197`) faz `db.table("grades").update(...)` por matrícula sem nunca chamar `assert_module_period_active` (`services/guards.py:28`). O chamador `sync_sheets` (`sheets.py:200-239`) só verifica dono do período. Não há **nenhuma** referência a `is_active` em todo o `sheets.py`. O `PUT /api/grades/{id}` bloqueia edição em período encerrado (`grades.py:92`), mas o mesmo dado entra pela planilha sem trava.
**Fix:** antes do loop, carregar `academic_periods.is_active` e recusar (403) se inativo e `current_user.role != "admin"`; ou filtrar as matrículas por módulos de período ativo.

### B-03 · Filtro de embed no sync de planilha provavelmente inerte — **Alto · provável · P**
`sheets.py:128-131`:
```python
.select("id, module_id, student:students!student_id(id, student_number), grade:grades!enrollment_id(...)")
.eq("students.academic_period_id", period_id)
```
Dois problemas independentes:
1. O filtro referencia `students` (nome da tabela) mas o embed foi aliasado como `student`. No PostgREST, filtros em recursos embutidos usam o nome **conforme aparece no select** (o alias). Um filtro que não casa com nenhum nó do select é descartado silenciosamente.
2. Mesmo com o alias correto, sem `!inner` o filtro em embed **não filtra as linhas-pai**; apenas anula o objeto embutido. Para restringir `enrollments` ao período é obrigatório `students!student_id!inner(...)`.

Consequência provável: `fetch_all` traz **todas as matrículas de todos os períodos** e, como `student_number` é único globalmente (B-08), uma planilha com matrículas de outro período **atualiza notas de alunos que o coordenador não coordena** (bypass de escopo). Os testes não detectam porque o fake de DB ignora os argumentos de `.eq()` (B-12).
**Fix:** `student:students!student_id!inner(id, student_number)` + `.eq("student.academic_period_id", period_id)` e um teste de integração contra Supabase real. Enquanto o Supabase de produção estiver pausado, validar no projeto de staging (I-08).

### B-04 · Exports ignoram o teto de 1000 linhas do PostgREST — **Médio · confirmado · P**
`routers/exports.py:73-83` (`q.order("full_name").execute()`) e `exports.py:135-145` (`.execute()`) fazem a query sem `.range()` e sem o helper `fetch_all` (`db.py:62`) já usado em `reports.py`, `sheets.py`, `dashboard.py`. Período com mais de 1000 alunos, ou módulo com mais de 1000 matrículas, gera CSV truncado sem aviso. A auditoria de julho marcou "paginação em exports" como feita, mas esses dois pontos ficaram de fora.
**Fix:** `rows = fetch_all(lambda lo, hi: q.order("full_name").range(lo, hi))` nos dois endpoints.

### B-05 · Auditoria com cobertura desigual — **Médio · confirmado · M**
`write_audit_log` é chamado só em `grades.py:128`, `modules.py:257,310`, `periods.py:268`, `students.py:403,462`, e **nunca com `action="insert"`** (o enum de `0006_audit_log.sql:13` e o rótulo "Criação" da UI existem sem uso). Sem rastro em:
- `users.py` — criar, **mudar role**, desativar, reativar usuário.
- `medical_certificates.py` — CRUD e anexos (dado sensível).
- `attendance.py` — salvar e **apagar** chamada de um dia.
- `sheets.py` — sync que altera dezenas de notas de uma vez.
- `import_csv.py` — importação de alunos.
**Fix:** adicionar `write_audit_log` nas mutações de `users.py` (prioridade: `role`/`is_active`), no sync de planilha (um registro agregado) e no delete de chamada; registrar `insert` nas criações de aluno/módulo/período/usuário.

### B-06 · Criação de usuário vaza exceção crua e não é atômica — **Médio · confirmado · M**
`users.py:189-196`: `raise HTTPException(400, detail=str(exc))` devolve a mensagem interna do SDK do Supabase ao cliente (o `change_my_password` na mesma file já faz o certo: loga e devolve texto genérico). Além disso o fluxo Auth → update profile → select profile (`users.py:169-209`) não tem rollback: `username` duplicado deixa conta no Auth sem profile consistente.
**Fix:** validar unicidade de `username` **antes** de `auth.admin.create_user`; capturar a exceção, logar com `logger.exception` e devolver mensagem genérica.

### B-07 · Quatro variantes do mesmo guard de coordenador — **Médio · confirmado · M**
A regra "coordenador só acessa período próprio" existe em: `assert_coordinator_owns_period` (canônico), `_assert_period_access` (`periods.py:18`), `_assert_coord_owns_period` (`reports.py:255`), inline em `sheets.py:104`/`import_csv.py:130`. Status codes divergem (403 vs 404) e mensagens também. `_assert_can_access_student` está duplicado entre `students.py:556-581` e `medical_certificates.py:45-91`; `_assert_professor_has_student` entre `students.py:584-604` e `reports.py:236-252`. É o "M2 restante" do backlog anterior, confirmado.
**Fix:** mover `_assert_can_access_student` e `_assert_professor_has_student` para `services/permissions.py`; migrar `sheets`, `import_csv`, `reports`, `medical_certificates` para os helpers. Fazer router por router, cada um com teste de trava antes.

### B-08 · `student_number` único globalmente vs aluno 1:1 com período — **Médio · decisão de produto**
`students.student_number` tem `UNIQUE` global (`0001:55`) mas cada linha pertence a exatamente um `academic_period_id`. Um aluno que cursa dois períodos não pode ser recadastrado com a mesma matrícula. Isso agrava B-03 e explica por que não existe histórico cross-período (ver [04-produto-lacunas.md](04-produto-lacunas.md) P-05). Não é bug de código; é uma decisão de modelagem que precisa ser explícita.

### B-09 · Schemas com validação fraca em pontos específicos — **Baixo · confirmado · P**
- `StudentCreate.email: str | None` (`schemas/students.py:51`) em vez de `EmailStr`.
- `ModuleCreate.credits`/`max_absences: int` sem `ge=0` (o banco tem CHECK, mas o erro chega como 500 em vez de 422).
- Texto livre (`full_name`, `observations`, `referral_info`) sem `max_length` (o único exemplo bom é `MedicalCertificateBase.reason`, `max_length=500`).

### B-10 · TOCTOU em `delete_period` — **Baixo · confirmado**
`periods.py:234-255` conta alunos/módulos e depois deleta, sem transação. Exige duas requisições admin simultâneas. Mitigação estrutural está em I-03 (`ON DELETE RESTRICT`).

### B-11 · Convenção sync/async sem critério documentado — **Baixo**
A maioria dos routers usa `def` (threadpool automático do FastAPI); `dashboard.py`, `sheets.py`, `import_csv.py` usam `async def` + `asyncio.to_thread`. Ambos corretos, mas sem regra escrita. Uma linha em `CONTRIBUTING.md` resolve.

### B-12 · Fakes de DB nos testes ignoram os argumentos de filtro — **Alto (risco de teste) · confirmado · M**
Cada arquivo de teste define sua própria `_Query`/`_FakeDb` (duplicada em `test_authz.py`, `test_modules_authz.py`, `test_students_authz.py`, `test_attendance_save.py`, `test_import_save.py`, `test_grades_endpoint.py`). Em todas, `.eq()`, `.in_()`, `.or_()`, `.order()` retornam `self` sem olhar os argumentos (`test_authz.py:108-119`). A suíte valida os **branches de role em Python**, mas **não** valida que a query PostgREST gerada está certa. B-03 é exatamente a classe de bug invisível a essa suíte. A fixture `integration_db` (`conftest.py:30-46`) existe, mas só 2 testes triviais a usam e ela é pulada por padrão.
**Fix:** (1) consolidar o fake em `conftest.py` e fazê-lo **registrar** os filtros aplicados para asserção; (2) criar 5–8 testes de integração reais para as queries com embed/alias (`sheets`, `exports`, `students` batch), rodando no CI contra o Supabase de staging (I-08).

### B-13 · Cinco routers sem nenhum teste HTTP — **Alto · confirmado · G**
`users.py` (9 rotas, incluindo mudança de role), `medical_certificates.py` (8 rotas, upload de PDF), `sheets.py` (2), `reports.py` (2), `exports.py` (2) e `audit.py` (1). Como a authz é 100% de app, essas 24 rotas não têm rede de segurança contra regressão. Papel `professor` nunca é testado no dashboard; `admin` como bypass só é testado em 3 routers.
**Fix:** replicar o padrão de `test_students_authz.py` (3 papéis × dono/não-dono) para cada router. Começar por `users` e `medical_certificates`.

## 4. O que está bem feito (manter)

- **Injeção em filtros PostgREST**: `services/search.py` sanitiza `,()"\%*:` antes de `or_()`, reutilizado em `users`/`students`.
- **SSRF no sync de planilha**: allowlist de host + HTTPS obrigatório + revalidação da URL salva antes do fetch (`sheets.py:224`), com testes de bypass.
- **Upload de PDF**: MIME + tamanho (10 MB) + magic bytes `%PDF-` + nome sanitizado + signed URL de 1 h.
- **CSV/formula injection** neutralizada e testada (`services/exports.py:50-55`).
- **Mass assignment** bloqueado em `grades.py` (patch campo a campo) e whitelist por papel em `PUT /professor/students/{id}`.
- **Transações** onde importava: RPCs `create_student_with_enrollments` e `save_attendance_day`.
- **N+1** eliminados (`_build_details_batch` com teste dedicado; `asyncio.gather` no dashboard).
- **Observabilidade base**: request-id propagado em logs e header, `healthz`/`readyz` separados, handler global de 500 sem stack trace, JWKS pré-aquecido no `lifespan`, cache de profile com TTL e lock.
- **Datas** sempre `timezone.utc`.

## 5. Sugestões de evolução (backend)

| ID | Sugestão | Esforço | Valor |
|---|---|---|---|
| B-S1 | `GET /api/modules/{id}/students/at-risk` reaproveitando `classify_status` (alunos perto do limite de faltas ou média < 5) | P/M | Alto |
| B-S2 | `POST /api/modules/{id}/enrollments` — matricular aluno existente (fecha P-01) | P/M | Alto |
| B-S3 | `POST /api/periods/{id}/clone` — copia módulos (código, nome, professor, créditos, `max_absences`) para um novo período | M | Alto |
| B-S4 | `GET /api/modules/{id}/attendance/export.csv` — exporta frequência (mesma base do export de notas) | P | Médio |
| B-S5 | `POST /api/users/{id}/reset-password` (admin) via Admin API do Supabase | P | Médio |
| B-S6 | Boletim PDF listar os atestados reais de `medical_certificates` em vez do contador `students.medical_certificates` | P | Médio |
| B-S7 | Import CSV de **notas** reaproveitando o parser de `import_csv.py` (alternativa ao Google Sheets) | M | Médio |
| B-S8 | Sentry (DSN em env, `sentry-sdk[fastapi]`) — única lacuna concreta de observabilidade para produção | P | Alto |
