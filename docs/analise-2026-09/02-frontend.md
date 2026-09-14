# 02 — Relatório: Frontend (React + Vite)

> Parte da [Análise completa de 2026-09-03](README.md). Achados com prefixo **F-**.
> Método: leitura integral de `frontend/src` (features, components, hooks, lib, routes, types) e das configs (`vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `eslint.config.js`, `package.json`), com verificação manual dos achados de maior impacto.

## 1. Estado verificado em 2026-09-03

| Item | Resultado |
|---|---|
| `npm run lint` | ✅ 0 erros · 4 warnings (fast-refresh em `badge`/`button`/`routes`, `exhaustive-deps` em `StudentsPage:123`) |
| `tsc --noEmit` | ✅ 0 erros |
| `vitest run` | ✅ 7 testes (só `lib/classification.test.ts` e `lib/grades.test.ts`) |
| `npm run build` | ✅ ok · JS total 1.57 MB (não gzipado) |
| `npm audit --omit=dev` | ⚠️ 8 vulnerabilidades (4 high: `nanoid`, `postcss`, `postcss-selector-parser`) — todas com fix via `npm audit fix` |
| Linhas em `src/` | ~10.9k |
| Rotas | 13 (+ coringa) · 14 `lazy()` |
| Testes de componente | **zero** (sem `jsdom`, RTL ou MSW instalados) |

Maiores chunks do build:

| Chunk | Tamanho |
|---|---|
| `vendor-charts` (recharts) | 363 KB |
| `index` (app) | 334 KB |
| `vendor-react` | 202 KB |
| `AppShell` | 92 KB |

## 2. Mapa de rotas

| Rota | Página | Papéis | Obs. |
|---|---|---|---|
| `/login`, `/forgot-password`, `/reset-password` | auth | público | tratamento de link expirado em `routes/index.tsx:44-54` ✅ |
| `/dashboard`, `/profile` | — | todos | |
| `/users`, `/audit-log` | — | admin | backend do audit-log já filtra por ator para outros papéis (P-04) |
| `/periods`, `/import` | — | admin, coordinator | |
| `/modules`, `/students`, `/grades`, `/attendance` | — | coordinator, professor | admin **não** acessa (coerente entre router e Sidebar; decisão de produto) |
| `*` | redirect `/dashboard` | — | sem página 404 |

## 3. Achados

### F-01 · Chamada descarta rascunho não salvo sem aviso — **Alto · confirmado · P**
`AttendancePage.tsx` calcula `isDirty` (linha 176) mas `handleModuleChange` (208) e `handleDateChange` (213) trocam módulo/data sem consultá-lo. O `useEffect` em `[day]` (167-174) então sobrescreve `draft` com os dados do novo dia. Não há `beforeunload` nem `useBlocker` em todo o `src/`. Um professor que marca a chamada inteira e clica em outra data perde tudo silenciosamente. Diferente da GradesPage (auto-save por célula), aqui o modelo é rascunho + botão Salvar, o que torna o gap grave.
**Fix:** a tela já importa `useConfirm` (usado no delete, linha 244). Antes de trocar módulo/data, `if (isDirty && !(await confirm({...}))) return;`. Opcional: `useBlocker` do React Router para navegação de saída.

### F-02 · Mutations não invalidam o dashboard — **Médio · confirmado · P**
Nenhuma mutation de `useStudents.ts` (criar/desativar), `useModules.ts` (CRUD), `useGrades.ts` (nota) ou `useAttendance.ts` (chamada) invalida `["dashboard"]`. Com `staleTime` global de 3 min (`lib/queryClient.ts:13`), o dashboard mostra contagens e taxa de aprovação obsoletas após qualquer alteração. A invalidação cruzada existe para attendance→grades e certificates→students, só não foi estendida ao dashboard.
**Fix:** `qc.invalidateQueries({ queryKey: ["dashboard"] })` no `onSuccess` dessas mutations (match por prefixo cobre todos os `period_id`).

### F-03 · Quatro `confirm()` nativos remanescentes — **Médio · confirmado · P**
`ModulesPage.tsx:53`, `PeriodsPage.tsx:72`, `UsersPage.tsx:124` e `:134` usam o `confirm()` do navegador (nenhum desses arquivos importa `useConfirm`). A melhoria 25 de julho trocou 3 usos, mas deixou estes 4. Quebra o tema escuro e o design system.
**Fix:** trocar pelo `useConfirm()` já existente (`components/shared/ConfirmDialog.tsx`).

### F-04 · Fragment sem `key` na lista de auditoria — **Médio · confirmado · P**
`AuditLogPage.tsx:208`: o `.map()` retorna `<>…</>` com a `key` apenas no `<TableRow>` interno. React exige a key no elemento retornado; fragment shorthand não aceita. Gera warning e pode reconciliar errado ao expandir/recolher linhas.
**Fix:** `<Fragment key={entry.id}>`.

### F-05 · Nota final sem vírgula decimal na tela mais usada — **Médio · confirmado · P**
`GradesPage.tsx:471` renderiza `row.final_grade.toFixed(1)` ("7.5"), enquanto `StudentDetailSheet.tsx:169,200` faz `.replace(".", ",")` ("7,5"). Inconsistência visível no coração do produto.
**Fix:** helper `formatGrade(n)` em `lib/utils.ts` (ao lado de `formatFileSize`) e usar nos 3 lugares.

### F-06 · Célula de nota sem `aria-label` — **Médio · confirmado · P**
Os `<Input type="number">` de `GradeCell` (`GradesPage.tsx:98-123`) não têm `aria-label`; um leitor de tela anuncia "spinbutton, 7" sem aluno nem coluna. A `AttendancePage` faz isso certo (`aria-label` "Marcar {nome} como presente", linha 451).
**Fix:** `aria-label={`${label} de ${row.full_name}`}` em cada `GradeCell`.

### F-07 · `profiles` legível por qualquer autenticado via anon key — **Médio · confirmado · P (migração)**
`0002_rls_granular.sql:24-27`: `profiles_select_authenticated … USING (true)`. O comentário diz que é "necessário para listar professores/coordenadores em selects", mas o frontend busca essas listas pelo backend (`/api/professors`, `/api/coordinators`) e o **único** acesso direto ao Supabase fora de `auth` é `fetchProfile` (`hooks/useAuth.ts:95-101`), que lê a **própria** linha. Qualquer professor logado pode, no devtools, listar e-mail, username e role de todos os usuários (inclusive admins). O backend não é afetado (service_role).
**Fix:** migração `0012`: `USING (id = auth.uid() OR is_admin())`. Ver I-02.

### F-08 · Sem view mobile em Notas e Chamada — **Alto (UX) · confirmado · M**
`GradesPage` (9 colunas) e `AttendancePage` só têm `overflow-x-auto`; `StudentsPage`/`UsersPage` têm `hidden md:block` + cards. "Fazer a chamada andando pela sala com o celular" é o caso de uso clássico e hoje exige scroll horizontal.
**Fix:** layout em cards abaixo de `md` para as duas telas, reaproveitando o padrão de `StudentsPage`.

### F-09 · Linhas de tabela não memoizadas em Notas/Chamada — **Baixo hoje · M**
`statuses`/`draft` vivem no componente pai; cada save re-renderiza todas as linhas. Imperceptível até ~150 alunos; extrair `<GradeRow>`/`<AttendanceRow>` com `React.memo` quando houver turmas maiores.

### F-10 · Cinco tipos mortos em `types/index.ts` — **Baixo · confirmado · P**
`Student`, `Module`, `Enrollment`, `Grade`, `ImportResult` não são importados em lugar nenhum; cada feature define seu próprio (`Grade` é cópia exata de `GradeRow` em `features/grades/api.ts:3-12`). Risco de o próximo dev usar o tipo errado.
**Fix:** remover os 5 (manter `UserRole`, `Profile`, `AcademicPeriod`, `MedicalCertificate*`).

### F-11 · Código morto — **Baixo · confirmado · P**
Arquivos sem nenhum importador: `components/shared/UnderConstruction.tsx`, `components/shared/RoleBadge.tsx`, `components/ui/tooltip.tsx` (e a dependência `@radix-ui/react-tooltip`). `AppShell.tsx` e `CommandPalette.tsx` só aparecem "órfãos" porque são carregados via `lazy()` dinâmico — estão em uso.
**Fix:** apagar os 3 arquivos e desinstalar `@radix-ui/react-tooltip`.

### F-12 · Padrões duplicados entre features — **Baixo · M**
- Bloco "loading / erro com Tentar novamente / vazio" replicado em `ModuleDialog.tsx:210-224,264-286` e `PeriodDialog.tsx:155-181` → `<AsyncSelectField>`.
- Paginação (`page`, `totalPages`, `canPrev/canNext`, reset ao filtrar) reimplementada em `StudentsPage:93-144`, `UsersPage:75-109`, `AuditLogPage:109-128` → `usePagination()`.
- `formatDateBR` manual em `AttendancePage.tsx:56-60` vs `date-fns`+`ptBR` no resto.
- `aria-describedby` ligando input ao erro só nos forms de auth, não nos dialogs de CRUD.

### F-13 · Sem página 404 — **Baixo · P**
Rota `*` redireciona para `/dashboard` sem explicação.

### F-14 · `refetchOnReconnect: false` global — **Baixo · decisão**
`lib/queryClient.ts:16-17`. Se a rede cair durante lançamento de notas, ao voltar nada revalida. Reavaliar `true` ao menos para `grades`/`attendance`.

### F-15 · Sem validação runtime das respostas da API — **Baixo · G**
Só `fetchProfile` valida com Zod. O resto confia em `api.get<T>()`. Mudança de campo no backend vira `undefined` na UI. Se investir, começar por `grades`/`attendance`.

### F-16 · `console.error` fora do guard `isDev` — **Baixo · P**
`useAuth.ts:112` loga `parsed.error.issues` em produção; o resto do arquivo usa `debugError`. Só inconsistência (payload não é sensível).

### F-17 · Zero testes de componente e sem infra para eles — **Alto · confirmado · G (infra) + M por suíte**
Não há `environment: "jsdom"` nem `setupFiles` no `vite.config.ts`; `@testing-library/*` e `msw` não estão em `devDependencies`. Prioridade por risco:
1. `lib/axios.ts` — header Authorization, 401 → logout, parse de erro em blob.
2. `hooks/useAuth.ts` — bootstrap único, safety timeout 5 s, Zod do profile.
3. `routes/ProtectedRoute.tsx` — 4 branches (recovery / loading / sem sessão / role).
4. `GradesPage` — digita → debounce → PUT → indicador, com optimistic update e rollback.
5. `AttendancePage` — rascunho, `isDirty`, salvar, F-01.

## 4. O que está bem feito (manter)

- **Auth**: token em memória (Zustand), injeção síncrona no axios, 401 limpa sessão, `queryClient.clear()` no logout, safety timeout, Zod no profile, link de recovery expirado tratado antes do router montar.
- **Sem XSS**: zero `dangerouslySetInnerHTML`; `redirectTo` do reset fixo em `window.location.origin`.
- **Query keys** consistentes por feature, invalidação cruzada attendance→grades e certificates→students.
- **Optimistic update** em `useUpdateGrade` com `cancelQueries`, recálculo local via `recalcFinal` (testado) e rollback **só da linha que falhou**.
- **GradesPage**: auto-save por célula com debounce 300 ms sem double-commit, navegação por setas/Enter, `SaveIndicator` com `aria-live`, clamp com toast, modo somente-leitura em período encerrado.
- **AttendancePage**: "Todos presentes/faltas", contadores ao vivo, histórico de datas clicável, botão Salvar desabilitado sem mudanças.
- **Loading/empty states** uniformes (`Skeleton`, `EmptyState` com mensagens distintas para vazio vs busca).
- **Performance**: `manualChunks`, todas as rotas `lazy()`, prefetch no hover da Sidebar, `cmdk` carregado sob demanda.
- **Dark mode** via tokens HSL sem cores hardcoded; contraste AA já ajustado.
- **`strict: true`** e nenhum `any` explícito em todo o `src/`.

## 5. Sugestões de evolução (frontend)

| ID | Sugestão | Esforço | Valor |
|---|---|---|---|
| F-S1 | Filtro por situação (aprovado/recuperação/reprovado/faltas) na tela de Notas | P | Alto |
| F-S2 | Card "alunos perto do limite de faltas" no dashboard do professor e na própria Chamada (dado já calculado em `StudentsPage` via `AbsenceProgress`) | P/M | Alto |
| F-S3 | Visão consolidada de frequência por aluno ao longo do período (grade aluno × datas) | M | Alto |
| F-S4 | Botão "Exportar chamada" (CSV) na AttendancePage (depende de B-S4) | P | Médio |
| F-S5 | Exportar CSV respeitando a busca ativa na GradesPage | P | Baixo |
| F-S6 | Atalho Ctrl+S na Chamada e "salvar e ir para o próximo módulo" | P | Médio |
| F-S7 | Indicador "X alterações pendentes" na Chamada (além do `isDirty` binário) | P | Médio |
| F-S8 | Página 404 simples | P | Baixo |
| F-S9 | Destacar linhas com nota não lançada vs 0 lançado (exige `NULL` no backend ou flag) | M | Médio |
