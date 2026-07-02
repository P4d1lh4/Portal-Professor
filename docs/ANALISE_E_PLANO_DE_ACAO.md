# Análise da Aplicação Professor — Pontos Fortes, Melhorias e Plano de Ação

> Documento gerado em 2026-05-21. Revisão arquitetural completa (backend FastAPI + frontend React + Supabase).
> Cada item de melhoria traz `arquivo:linha`, impacto e severidade. O plano de ação no final está priorizado e pronto para execução.

---

## 0. Visão geral da arquitetura

- **Backend**: FastAPI + Pydantic v2 + supabase-py. Routers finos, schemas tipados, services para regras de negócio, `deps.py` para auth/RBAC.
- **Frontend**: React 18 + TS + Vite + Tailwind + shadcn/ui + TanStack Query + RHF + Zod. Organização por *features*.
- **Banco**: Supabase Postgres. Schema com FKs, índices e triggers. RLS habilitada com policies granulares (migração `0002`).
- **Decisão central**: o backend usa **`get_admin_db()` (service role, que faz bypass de RLS) em praticamente todos os endpoints**. Consequência: **a autorização efetiva é 100% na camada de aplicação** (`require_role`, `_assert_access`). O RLS granular existe como defesa em profundidade, mas **não protege** se um endpoint esquecer de filtrar. Isso torna qualquer lacuna de autorização nos routers um risco real, não apenas teórico.

---

## 1. Pontos fortes

### Backend
- **Separação de camadas limpa**: routers / schemas / services / deps bem divididos; routers permanecem finos.
- **Autenticação robusta**: validação de JWT do Supabase com suporte a ES256/RS256 (via JWKS) e HS256 legado; pré-aquecimento do JWKS no `lifespan` para reduzir latência do primeiro login (`auth.py`, `main.py:30`).
- **Cache de profile com TTL** (5 min) protegido por lock, com invalidação manual e bloqueio imediato de contas desativadas (`deps.py:16-83`).
- **RBAC reutilizável**: factory `require_role(*roles)` e helpers em `services/guards.py`.
- **Mitigação de N+1 já presente** em vários pontos (batch de enrollments no dashboard, `_build_details_batch` em students).
- **Validação de upload sólida**: import CSV detecta encoding, sanitiza delimitador e limita linhas; atestados validam magic bytes `%PDF-` além do MIME e sanitizam nome do arquivo.
- **Auditoria**: captura before/after com diff (`services/audit.py`), sem derrubar a request principal se a gravação falhar.
- **Patch defensivo do supabase-py** para `maybe_single()` retornando `None` — interface consistente nos routers (`db.py`).

### Frontend
- **Organização por feature consistente**: cada uma com `api.ts`, hooks `use*.ts`, páginas e dialogs.
- **TanStack Query bem configurado** (`staleTime` 3 min, `gcTime` 10 min) com `queryKey`s centralizadas por feature.
- **Auth resiliente**: bootstrap único (sem listeners duplicados), *safety timeout* de 5 s para nunca travar em `isLoading`, fetch de profile via `setTimeout(0)` para evitar deadlock do GoTrueClient, logout que limpa estado antes da rede (`hooks/useAuth.ts`).
- **GradesPage (tela mais crítica) muito bem feita**: navegação por teclado entre células, *commit* com clamp de range, indicadores de salvamento por linha.
- **Interceptors do Axios**: injeção síncrona do token e tradução de erros HTTP para mensagens em pt-BR (`lib/axios.ts`).
- **Acessibilidade acima da média**: labels ligadas, `aria-*` em botões de ícone, empty states reutilizáveis, tema claro/escuro.
- **Type safety geral boa** e reuso de componentes (`GradeCell`, `GradeBadge`, dialogs com padrão uniforme).

### Banco
- Schema normalizado com `UNIQUE` corretos (`code+period`, `student+module`, `enrollment_id`), `ON DELETE` coerentes e **índices em todas as FKs/colunas de filtro**.
- Trigger `handle_new_user` cria profile automaticamente; funções helper (`is_admin`, `is_coordinator_of`, `is_professor_of_module`) para RLS.

---

## 2. Pontos de melhoria

> Severidade: **Crítico** (corrigir antes de produção) · **Alto** · **Médio** · **Baixo**.

### 2.1 Segurança & Autorização

| # | Item | Arquivo:linha | Sev. |
|---|------|---------------|------|
| S1 | **`GET /periods/{id}` não filtra por papel** — qualquer usuário autenticado lê qualquer período por ID (RLS está bypassada pelo service role). Inconsistente com `list_periods`, que filtra. | `backend/app/routers/periods.py:104-119` | **Alto** |
| S2 | **`GET /modules/{id}` verifica acesso só DEPOIS do fetch** (`_assert_access` pós-SELECT). Deve validar antes; e auditar padrão similar em outros GETs por ID. | `backend/app/routers/modules.py:72-90` | Médio |
| S3 | **`PUT /professor/students/{id}` sem whitelist de campos** — professor pode enviar `is_active`/campos que não deveria editar. Aplicar allowlist por papel. | `backend/app/routers/students.py:371-409` | **Alto** |
| S4 | **Vazamento de detalhe de exceção** em troca de senha: `detail=f"...: {exc}"` expõe internals do Supabase. Logar interno, retornar mensagem genérica. | `backend/app/routers/users.py:77-81` | **Alto** |
| S5 | **`professor_id` em `POST /modules` não é validado** — admin/coord pode passar UUID inexistente ou de não-professor (FK pode aceitar lixo conforme constraint). Validar existência + papel. | `backend/app/routers/modules.py:149-179` | Médio |
| S6 | **Possível SSRF na sincronização de Sheets** — `csv_sync_url` vinda do banco é buscada com `follow_redirects=True` sem validação de host. Restringir a domínios do Google Sheets / validar esquema+host. | `backend/app/routers/sheets.py:39-47` | Médio |
| S7 | **Busca `ilike` monta filtro PostgREST por string** com o termo do usuário interpolado; sanitizar/escapar `%` `,` `\` e validar termo. | `backend/app/routers/users.py:106-113` | Médio |
| S8 | **Cache do TanStack não é limpo no logout** — ao trocar de conta na mesma aba, dados do usuário anterior podem aparecer. Chamar `queryClient.clear()` no `signOut`. | `frontend/src/hooks/useAuth.ts:43-55`, `frontend/src/App.tsx:8-18` | **Alto** |
| S9 | **Sem tratamento de 401 no interceptor** — sessão expirada vira erro genérico em vez de redirecionar para `/login` e limpar sessão. | `frontend/src/lib/axios.ts:19-40` | Médio |
| S10 | **`console.log`/`console.warn` com dados de sessão/`user.id`** sem guard de ambiente — vaza em produção. Envolver em `import.meta.env.DEV`. | `frontend/src/hooks/useAuth.ts:108-149` | Médio |

### 2.2 Robustez & Integridade de dados

| # | Item | Arquivo:linha | Sev. |
|---|------|---------------|------|
| R1 | **`except Exception: pass` em auto-matrícula do import** — falhas silenciosas geram alunos órfãos sem nota e sem auditoria. Logar e reportar em `errors_on_save`. | `backend/app/routers/import_csv.py:183-197` | **Alto** |
| R2 | **Operações multi-tabela sem transação** (criar aluno → matrícula → notas). supabase-py não dá transação nativa; mover para uma **RPC/função Postgres** ou compensar falhas. | `import_csv.py`, `students.py` (criação) | Médio |
| R3 | **Comparação de datas por string** em atestados (`str(end) < str(start)`) — frágil se algum lado for `None`. Usar `date.fromisoformat`. | `backend/app/routers/medical_certificates.py:257-261` | Baixo |
| R4 | **`enrollment_date` sem validação** (futuro / muito antigo). Adicionar `@field_validator`. | `backend/app/routers/students.py:240-246` | Baixo |
| R5 | **`fetchProfile` faz `as Profile` sem validar** — schema divergente passa silencioso. Validar com Zod. | `frontend/src/hooks/useAuth.ts:80` | Médio |

### 2.3 Performance & Escala

| # | Item | Arquivo:linha | Sev. |
|---|------|---------------|------|
| P1 | **`GET /modules` sem paginação/limite** — retorna todos os módulos. Adicionar `limit`/`offset` (padrão 100). | `backend/app/routers/modules.py:36-69` | Médio |
| P2 | **`list_professor_students` faz ~4 queries sequenciais por chamada**. Consolidar em RPC/view agregada se a base crescer. | `backend/app/routers/students.py:253-295` | Médio |
| P3 | **GradesPage filtra client-side sem debounce** — OK hoje, mas com 500+ alunos causa lag por keystroke (StudentsPage já debouncia). | `frontend/src/features/grades/GradesPage.tsx:191-199` | Baixo |

### 2.4 UX & Consistência (frontend)

| # | Item | Arquivo:linha | Sev. |
|---|------|---------------|------|
| U1 | **Sem optimistic update ao salvar nota** — cada save invalida a query inteira e re-renderiza a tabela (flicker). Usar `onMutate`/`setQueryData` + rollback. | `frontend/src/features/grades/GradesPage.tsx:129-156`, `useGrades.ts:20` | Médio |
| U2 | **`MAX_ATTACHMENT_SIZE` definido mas não usado** no componente de upload — usuário só descobre o limite após o erro do servidor. Validar antes de enviar. | `frontend/src/features/medical-certificates/api.ts:7` | Baixo |
| U3 | **Botão de upload sem `disabled={isPending}`** — risco de uploads duplicados por cliques repetidos. | `frontend/src/features/medical-certificates/*` | Baixo |
| U4 | **Clamp silencioso de nota** [0–10] sem avisar — usuário digita "15", vira "10" sem feedback. Toast informativo + validação Zod no schema. | `frontend/src/features/grades/GradesPage.tsx:70-79` | Baixo |
| U5 | **Ordem de checagem em `ProtectedRoute`** — avaliar `isPasswordRecovery` antes de `isLoading`. | `frontend/src/routes/ProtectedRoute.tsx:10-33` | Baixo |
| U6 | **Código morto no `Switch`**: import de `@radix-ui/react-separator` como `SwitchPrimitive` apenas para `void`. Remover. | `frontend/src/components/ui/switch.tsx:2,46` | Baixo |

### 2.5 Qualidade, testes & manutenção

| # | Item | Arquivo:linha | Sev. |
|---|------|---------------|------|
| Q1 | **`_recalc_final` duplicada** em `grades.py` e `sheets.py` (idênticas). Extrair para `services/grades.py`. | `backend/app/routers/grades.py:26`, `sheets.py:33` | Médio |
| Q2 | **Regra de classificação (aprovado/recuperação/reprovado) espalhada** em dashboard/exports/frontend. Centralizar em `services/classification.py` e reusar. | `dashboard.py:84`, `services/exports.py:118`, `GradeBadge.tsx` | Médio |
| Q3 | **Testes só de unidade (schemas/parsers)** — falta E2E de autorização ("professor não acessa aluno de outro professor"). É o maior risco dado que toda authz é app-layer. | `backend/tests/` | **Alto** |
| Q4 | **Sem testes de integração com banco** (nenhum `conftest` com fixture Supabase). | `backend/tests/` | Médio |
| Q5 | **`python-jose` (3.3.0, legado)** — considerar migrar para PyJWT puro. | `backend/requirements.txt` | Baixo |
| Q6 | **RLS granular precisa ser confirmada como aplicada** no projeto Supabase (migrações existem; validar que rodaram). Como o backend bypassa RLS, ela é a única rede de proteção caso uma credencial anon vaze ou o frontend acesse o banco direto. | `supabase/migrations/0002_rls_granular.sql` | Médio |

---

## 3. Plano de ação (priorizado e executável)

> Estimativas relativas. Cada fase é independente e pode virar uma série de PRs pequenos. Sugestão: 1 branch por item, commit em pt-BR.

### Fase 1 — Segurança crítica (antes de qualquer produção/escala)
- [ ] **S1** Filtrar `GET /periods/{id}` por papel (espelhar `list_periods`). _(~30 min)_
- [ ] **S3** Whitelist de campos editáveis por professor em `PUT /professor/students/{id}`. _(~30 min)_
- [ ] **S4** Não vazar `exc` na troca de senha — logar interno, retornar mensagem genérica. _(~15 min)_
- [ ] **S8** `queryClient.clear()` no `signOut` (passar o client ao store ou expor um hook). _(~30 min)_
- [ ] **Q3** Criar `tests/test_authz.py` com casos de isolamento por papel para os endpoints acima (trava regressões). _(~3 h)_

**Critério de pronto:** suíte de authz passando; revisão manual confirmando que professor/coordenador só enxergam seus dados.

### Fase 2 — Robustez & exposição de erros
- [ ] **R1** Substituir `except: pass` no import por log + acumulação em `errors_on_save`. _(~1 h)_
- [ ] **S9** Tratar 401 no interceptor do Axios (limpar sessão + redirect `/login`). _(~30 min)_
- [ ] **S10** Guardar logs de auth atrás de `import.meta.env.DEV`. _(~20 min)_
- [ ] **S6** Validar host de `csv_sync_url` (allowlist Google Sheets) antes do fetch. _(~45 min)_
- [ ] **S7** Sanitizar/escapar termo de busca antes do filtro `ilike`. _(~30 min)_
- [ ] **R5** Validar resposta de `fetchProfile` com Zod. _(~30 min)_

### Fase 3 — Consistência de dados & regras de negócio
- [ ] **Q1** Extrair `_recalc_final` para `services/grades.py` e reusar nos dois routers. _(~30 min)_
- [ ] **Q2** Criar `services/classification.py` (`classify_status`) e consumir em dashboard/exports; espelhar no frontend (`GradeBadge`). _(~1,5 h)_
- [ ] **R2** Migrar criação aluno→matrícula→notas e auto-matrícula do import para uma **RPC Postgres transacional**. _(~3 h)_
- [ ] **S5** Validar `professor_id` (existe + papel professor) ao criar módulo. _(~30 min)_
- [ ] **R3/R4** Validações de data (atestado e `enrollment_date`). _(~30 min)_

### Fase 4 — UX da tela de notas (usuário primário) & performance
- [ ] **U1** Optimistic update em `useGrades` (`onMutate` + rollback + invalidação no `onSuccess`). _(~2 h)_
- [ ] **U4** Toast ao clampar nota + validação Zod de range [0–10]. _(~30 min)_
- [ ] **P1** Paginação em `GET /modules`. _(~45 min)_
- [ ] **P3** Debounce na busca da GradesPage (consistência com StudentsPage). _(~20 min)_
- [ ] **U2/U3** Validar tamanho de anexo no cliente + `disabled={isPending}` no upload. _(~30 min)_

### Fase 5 — Higiene & cobertura
- [ ] **Q4** `conftest.py` + testes de integração com Supabase de teste. _(~4 h)_
- [ ] **S2** Padronizar "validar acesso antes do fetch" nos GETs por ID. _(~1 h)_
- [ ] **Q6** Confirmar/aplicar RLS granular no projeto e documentar no `DEPLOY.md`. _(~1 h)_
- [ ] **U5/U6** Reordenar checks do `ProtectedRoute`; remover código morto do `Switch`. _(~20 min)_
- [ ] **Q5** Avaliar migração `python-jose` → PyJWT. _(~1 h)_

---

## 4. Resumo executivo

A aplicação está **bem arquitetada e madura** para o estágio — padrões modernos, auth resiliente, boa acessibilidade e a tela crítica (notas) cuidadosamente feita. Os riscos concentram-se em **autorização na camada de aplicação** (já que o RLS é bypassado pelo service role), **falhas silenciosas no import** e **higiene de cache/erros no frontend**. Nenhum é bloqueador estrutural; a **Fase 1** deve ser concluída antes de uso em produção real, e a **Fase 3** elimina a maior parte da dívida de manutenção (lógica de negócio duplicada e operações não transacionais).
</content>
</invoke>
