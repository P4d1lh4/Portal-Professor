# 04 — Relatório: Produto, jornadas e lacunas funcionais

> Parte da [Análise completa de 2026-09-03](README.md). Achados com prefixo **P-**.
> Método: leitura do schema (0001, 0003, 0005, 0006, 0007, 0010), de todos os routers e services, e de todas as páginas/dialogs do frontend, para descrever o que o produto **faz** hoje e, a partir disso, o que falta.

## 1. Modelo de domínio (como está implementado)

- **Período** (`academic_periods`) é a raiz. Tem um único coordenador. `is_active` não é só visibilidade: é a **trava de edição** — `assert_module_period_active` (`services/guards.py:9-44`) bloqueia `PUT /grades` e toda a chamada quando o período está inativo (admin passa). A UI mostra Notas e Chamada em somente-leitura. "Reabrir" é o mesmo toggle no `PeriodDialog`; não há fechamento formal.
- **Aluno** (`students`) pertence a **exatamente um** período (`academic_period_id NOT NULL`) e `student_number` é único **globalmente**. Não existe entidade "pessoa" cross-período: quem continua no ano seguinte precisa de um registro novo, mas a matrícula única impede reutilizar o número. Não há histórico entre períodos em lugar nenhum.
- **Módulo** (`modules`) tem **um** professor e seu próprio `max_absences`.
- **Matrícula** (`enrollments`) liga aluno↔módulo. O `status` (`active/dropped/completed`) existe no schema e na API mas **nunca é escrito** por nenhum endpoint (só INSERT via RPCs). Sempre `"active"`.
- **Nota** (`grades`, 1:1 com matrícula): `tutor_grade`, `regular_exam_grade`, `makeup_exam_grade`, `final_grade`, `absences`. Regra em `services/grades.py:8-12`: `final = max(regular, makeup)` se `makeup > 0`, senão `regular`. **`tutor_grade` não entra na fórmula** — é armazenada, exibida na grade, no PDF e no CSV, mas puramente informativa. Não está documentado se é intencional.
- **Falta** tem **dois caminhos** para o mesmo dado: (1) chamada por dia (`attendance_records/entries`) com trigger que recalcula `grades.absences` = contagem de `absent`; (2) edição manual de `absences` na tela de Notas via `PUT /grades`. Se o professor edita manualmente e depois salva qualquer chamada do módulo, o trigger **sobrescreve** o valor sem aviso.
- **Atestado** (`medical_certificates` + anexos PDF) é puramente documental. **Não** abona faltas: o professor precisa marcar os dias como `justified` na Chamada à parte. Só sincroniza o contador legado `students.medical_certificates`.
- **Classificação** (`services/classification.py:19-26`): reprovado por faltas se `absences > max_absences`; senão `≥ 7` aprovado, `≥ 5` recuperação, `< 5` reprovado. Espelhada em `frontend/lib/classification.ts` (testada) e em `exports.py`, **mas reimplementada à mão** em `reports.py:37-45` (PDF) — quarta cópia sem teste conjunto. O relatório de período ainda tem uma agregação por aluno (`reports.py:79-84`) com regra própria.
- **Boletim PDF** (`GET /students/{id}/report`): tabela por módulo + média geral + total de faltas. **Relatório de período** (`GET /periods/{id}/report`): por aluno, com status geral.
- **CSV**: exportação usa cabeçalhos em **português** ("Matrícula", "Nome"…); importação exige **`student_number`, `full_name`, `enrollment_date`** em inglês. O CSV exportado **não é reimportável** sem editar o cabeçalho.
- **Google Sheets** (`sheets.py`): casa por `student_number` e aplica os mesmos valores a **todas** as matrículas do aluno no período (a planilha não tem coluna de módulo). Só funciona bem se cada aluno tiver um módulo.

## 2. Jornadas por papel e onde quebram

### Admin
Cria período → define coordenador → cria usuários → acompanha dashboard e auditoria.
- ❌ Não há clonar período/módulos: cada semestre exige recriar todos os módulos à mão.
- ❌ Admin não acessa Módulos/Alunos/Notas/Chamada na UI (decisão coerente entre router e Sidebar, mas vale confirmar).

### Coordenador
Vê módulos/alunos dos seus períodos, cria módulos, importa CSV, sincroniza planilha, gera relatório do período.
- ❌ **P-01 (quebra central):** `POST /api/periods/{id}/students` (`students.py:190-225`) insere em `students` **sem criar matrícula** — não chama a RPC `create_student_with_enrollments` (usada só pelas rotas de professor e pelo import). Não existe em lugar nenhum um endpoint ou tela para **matricular um aluno existente em um módulo**. Resultado: aluno criado pelo coordenador no `StudentDialog` fica **invisível** em Notas e Chamada (que listam por `enrollments`), e o professor não consegue recriá-lo porque `student_number` já existe (409).
- ❌ Sem transferir aluno entre módulos nem desmatricular de um módulo específico.

### Professor (usuário primário)
Vê seus módulos, cadastra aluno com auto-matrícula em todos os seus módulos ativos, lança notas inline, faz chamada por dia, gerencia atestados, baixa boletim, exporta CSV de notas. **É a jornada mais completa e coesa do sistema.**
- ❌ Se o aluno já existe em módulo de **outro** professor, o segundo professor não consegue adicioná-lo ao seu módulo (a criação tenta novo `student_number` e dá 409, sem oferecer "matricular o existente").
- ❌ Sem exportar/imprimir lista de chamada (nem em branco, nem preenchida).
- ❌ Perde a chamada em rascunho ao trocar de data (F-01).

### Dashboard
É genuinamente diferente por papel: professor vê agregação dos próprios módulos (`dashboard.py:43-122`); coordenador/admin veem por período (`124-263`). Não é cosmético.

## 3. Inconsistências de domínio

| ID | Inconsistência | Onde | Sev. |
|---|---|---|---|
| P-02 | CSV exportado ≠ CSV importável (cabeçalhos pt-BR vs snake_case inglês) | `exports.py:71-82` vs `import_csv.py:26-28` | Alto |
| P-03 | `enrollments.status` existe, é exposto na API, mas nunca é escrito | `0001:89`, `schemas/modules.py:56` | Médio |
| P-04 | `/audit-log` restrito a admin na UI, mas o backend já filtra por `actor_id` para coordenador/professor verem as próprias ações | `routes/index.tsx:94-104` vs `audit.py:26-30` | Baixo (decisão) |
| P-05 | Auditoria nunca registra `insert`; atestados, chamada (delete), usuários e sync de planilha não geram rastro (detalhe em B-05) | routers | Médio |
| P-06 | Regra de classificação em 4 cópias (uma manual no PDF) sem teste que trave as 4 | `reports.py:37-45` | Médio |
| P-07 | Sync de planilha aplica a mesma linha a todas as matrículas do aluno | `sheets.py:152-186` | Médio (decisão) |
| P-08 | Faltas manuais vs chamada: dois caminhos, o trigger vence sem aviso | `0005:75-101`, `GradesPage.tsx:476-489` | Médio (decisão) |
| P-09 | Boletim PDF mostra o **contador** `students.medical_certificates`, não a lista real de atestados | `reports.py` | Baixo |
| P-10 | `/api/professor/students` não é paginado (comentário admite em `StudentsPage.tsx:121-122`); a rota de coordenador é | `students.py:237-283` | Médio |
| P-11 | `tutor_grade` fora da fórmula da nota final — intencional ou herança morta? | `services/grades.py` | **Decisão de produto** |

## 4. Quick wins (fecham fluxos existentes)

| ID | Lacuna | Onde entra | Esf. | Valor |
|---|---|---|---|---|
| P-Q1 | **Matricular aluno existente em módulo** (`POST /api/modules/{id}/enrollments` + botão em `ModulesPage`/`StudentDetailSheet`) — fecha P-01 | backend + frontend | P/M | Alto |
| P-Q2 | Aceitar os dois formatos de cabeçalho no import (ou exportar em snake_case) — fecha P-02 | `import_csv.py` | P | Alto |
| P-Q3 | Auditar `insert` + usuários + atestados + delete de chamada + sync (B-05) | routers | P | Alto |
| P-Q4 | Export CSV de frequência (mesma base do export de notas, fonte `attendance_entries`) | `exports.py` + botão | P | Médio |
| P-Q5 | Clonar módulos de um período para outro (sem alunos) | `periods.py` + `PeriodsPage` | M | Alto |
| P-Q6 | Aviso antes de salvar chamada quando `absences` manual difere do recalculado (P-08) | `attendance.py` + toast | P | Médio |
| P-Q7 | Botão "aplicar ao período" no atestado: marca `justified` nos dias do intervalo via `save_attendance_day` | `MedicalCertificateDialog` | M | Alto (decisão: automático ou revisão do professor?) |
| P-Q8 | Paginar `/api/professor/students` (P-10) | `students.py` + `StudentsPage` | P | Médio |
| P-Q9 | Liberar `/audit-log` para coordenador/professor (P-04) | `routes/index.tsx`, `Sidebar` | P | Médio (decisão) |
| P-Q10 | Campo dedicado "conteúdo ministrado" na chamada (`attendance_records.notes` já é usado como proxy, placeholder "Conteúdo da aula…") | migração + `AttendancePage` | P | Médio |

## 5. Novas funcionalidades (avaliadas)

| ID | Funcionalidade | Papel | MVP | Esf. | Valor | Decisão? |
|---|---|---|---|---|---|---|
| P-N1 | **Alunos em risco** (faltas ≥ 80% do limite ou média < 5): endpoint reaproveitando `classify_status` + card no dashboard + destaque na Chamada | prof/coord | sem e-mail | P/M | Alto | não |
| P-N2 | Seção "atenção" no relatório de período em PDF (estende P-N1) | coord | — | P | Alto | não |
| P-N3 | Observações do aluno como **histórico append-only** (`student_notes`: autor, texto, data) em vez do campo único sobrescrito | prof/coord | lista no `StudentDetailSheet` | M | Médio/Alto | não |
| P-N4 | Frequência % real: "faltas / chamadas registradas" ao lado de "faltas / max" (dado já existe) | prof | — | P | Médio | não |
| P-N5 | E-mail: lembrete N dias antes do `end_date` do período; aviso de aluno em risco | prof/coord | Supabase Edge Function ou cron + SMTP (projeto não tem e-mail transacional hoje) | M | Médio | sim (gatilho/destinatário) |
| P-N6 | **Portal do aluno/responsável** (4º papel, só leitura: notas, faltas, atestados, boletim) | aluno | novo enum, RLS restrita, convite | G | Alto | sim (maior investimento) |
| P-N7 | Múltiplos professores por módulo (N:N) | — | — | G | Médio | sim — não construir sem caso real |
| P-N8 | Calendário acadêmico/feriados com dias letivos previstos | — | P-N4 é o MVP barato | G | Médio | sim |
| P-N9 | Import CSV de notas (alternativa ao Google Sheets) reaproveitando o parser | coord | — | M | Médio | não |
| — | Multi-tenant, WhatsApp, PWA offline, assinatura digital de ata | — | **descartados** como over-engineering para instituição única, projeto solo, free tier | — | — | — |

## 6. Priorização (valor × esforço, top 15)

| # | Item | Esf. | Valor | Decisão do dono? |
|---|---|---|---|---|
| 1 | P-Q1 matricular aluno existente (bug de fluxo) | P/M | Alto | não |
| 2 | P-Q2 CSV export ↔ import | P | Alto | não |
| 3 | P-Q3 auditoria completa | P | Alto | não |
| 4 | P-N1 alunos em risco | P/M | Alto | não |
| 5 | P-Q5 clonar módulos entre períodos | M | Alto | não |
| 6 | P-Q4 export de frequência | P | Médio | não |
| 7 | P-Q8 paginar alunos do professor | P | Médio | não |
| 8 | P-N4 frequência % real | P | Médio | não |
| 9 | P-Q10 conteúdo ministrado | P | Médio | não |
| 10 | P-Q6 aviso faltas manuais vs chamada | P | Médio | **sim** — qual fonte vence? |
| 11 | P-Q7 atestado → abono automático | M | Alto | **sim** |
| 12 | P-11 propósito de `tutor_grade` | — | — | **sim** — regra pura de negócio |
| 13 | P-N3 histórico de observações | M | Médio/Alto | não |
| 14 | P-N5 e-mail | M | Médio | **sim** |
| 15 | P-N6 portal do aluno | G | Alto | **sim** — decidir antes de iniciar |

Recomendação: atacar 1 → 2 → 3 → 4 → 5 primeiro. Fecham quebras reais e reaproveitam mais de 80% do código existente, sem depender de nenhuma decisão pendente.
