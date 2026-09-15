# 66 — Incidente: Supabase pausado; validações pós-restore (O-01a, B-03, #68)

## Problema identificado

- **Incidente:** a produção ficou fora do ar de ~2026-09-03 a 2026-09-15.
  - O Supabase free pausa o projeto após 7 dias sem tráfego.
  - O keep-alive (alteração 29) só entrou em 2026-09-14, com o projeto já pausado, e falhou em todas as execuções.
  - Triagem do runbook: `healthz` 200, `readyz` 503, `vmelydczrdyszbrvlypv.supabase.co` sem DNS.
- **Pendências que esperavam o banco vivo:**
  - aplicar a 0012 e a 0013;
  - validar o B-03 e o #68 (supabase-py 2.31);
  - rodar a consulta de divergência do contador de atestados (alteração 64);
  - conferir o Q6 do plano de maio (RLS no projeto).
- **O keep-alive não roda a cada 10 min.** O cron pede `*/10`, mas o GitHub rodou 5 vezes em ~16 h (19:35, 22:44, 00:59, 06:06 e 11:41 UTC). O comentário do workflow e o plano diziam que ele mantinha o Render acordado.

## Objetivo

Confirmar a volta da produção sem perda de dados e fechar o que dependia do restore.

## Arquivos alterados

- `docs/runbook.md`: §2.1, os sinais transitórios logo depois do restore
- `.github/workflows/keepalive.yml`: comentário com o intervalo real do cron
- `.github/dependabot.yml`: o `ignore` do httpx passa de `>=0.28` para `>=0.29`
- `backend/app/routers/sheets.py`: comentário do B-03, sem mudança de código
- `docs/analise-2026-09/05-plano-de-execucao.md`: O-01a, O-01b, B-03
- `docs/alteracoes/INDEX.md`

## Alterações realizadas

- **Restore (dono, no painel):**
  - O DNS voltou primeiro.
  - Por uns 5 min, o PostgREST respondeu `PGRST205` (`public.profiles` fora do *schema cache*) e o pooler recusou conexão com `tenant/user postgres.vmelydczrdyszbrvlypv not found`.
  - Às 14:56:57 UTC o `readyz` deu 200. O *Keep-alive* disparado à mão ficou verde.
- **Dados intactos:** 12 tabelas em `public`; 4 profiles, 3 alunos, 2 notas e 4 usuários no Auth; `schema_migrations` até a 0011.
- **Backup antes de migrar:** `pg_dump -Fc -n public` pelo `postgres:17` no Docker. Não há `pg_dump` local, e o `backup.yml` segue sem secrets. Saíram 12 tabelas com dados (74 KB), guardadas fora do repositório.
- **Pré-condições da 0012:** nenhum período com datas invertidas (I-01) e nenhum e-mail repetido em `profiles` (I-04).
- **Divergência do contador de atestados (alteração 64):** nenhum aluno. Não há o que recontar.
- **Q6 (RLS):** todas as tabelas de `public` têm RLS, menos `schema_migrations`. A 0013 liga a dela.
- **B-03, refutado.** Rodei a consulta do sync, só leitura, com um período inexistente:
  - voltaram as 2 matrículas, com `student` nulo nas duas;
  - sem `!inner`, o PostgREST aplica o filtro ao embed, e não às linhas;
  - o índice por `student_number` do `_apply_sheet_grades` pula as linhas sem `student`, então nenhuma nota de outro período é gravada;
  - com `!inner` e o filtro no alias (`student.`), o período inexistente volta 0 linhas e o real volta as 2.

  O código fica como está. Um comentário explica o comportamento, e o `ponytail:` marca o custo.
- **#68 (supabase-py 2.31), validado.** Num venv limpo com o `requirements.txt` (supabase 2.31.0, httpx 0.27.2):
  - o `get_admin_db` do backend leu `profiles`;
  - a consulta do sync, pelo `fetch_all`, repetiu o B-03: no período real, 2 linhas com `student`; no inexistente, 2 linhas sem `student`.

  O `readyz` do Render também deu 200. Daqui não dá para saber se o deploy do #68 (mesclado às 14:45 UTC) já estava no ar (I-17).
- **Dependabot:** o `ignore httpx>=0.28` do #50 existia por causa do supabase-py 2.8.1. O 2.31 e os pacotes dele (postgrest, supabase_auth, storage3, supabase_functions) pedem `httpx>=0.26,<0.29`, então o `ignore` passa para `>=0.29`. O Dependabot pode propor o 0.28, que instala, e não o 0.29, que não instalaria.
- **Runbook:** o passo 1 da §2.1 descreve os sinais transitórios, para que um restore em andamento não seja tomado por falha.
- **Keep-alive:** o comentário registra o intervalo real e diz que o Render não fica acordado.

## Motivo técnico

- **B-03 sem mudança de código:** o resultado já está certo. Trocar para `!inner` mudaria os filtros que os testes de sheets conferem (`db.calls`) só para trazer menos linhas. Com poucos períodos, o `fetch_all` pagina poucas centenas de matrículas.
- **Validação no banco real, e não em staging (I-23):** as consultas do B-03 e do #68 só leem, então não havia o que proteger num staging.
- **Backup só do `public`:** a 0012 e a 0013 mexem só nele. O backup completo (roles, `auth`, anexos) é o do `backup.yml`.
- **`ignore` em `>=0.29`, e não removido:** sem ele, o Dependabot poderia abrir o bump para uma versão que o supabase-py recusa. Quando o supabase-py subir o teto, o `ignore` sobe junto.
- **Keep-alive como está:** um cron de 1 a 5 h cobre os 7 dias do Supabase. Manter o Render acordado pede um pinger externo ou o plano Starter (O-02), e isso é decisão do dono.

## Impactos positivos

- A produção voltou sem perda de dados.
- O B-03 fechou sem código novo, e a divergência do contador foi descartada.
- O Dependabot pode propor o httpx 0.28.
- O próximo restore tem os sinais transitórios no runbook.

## Testes executados

- Triagem do runbook (`healthz`, `readyz`, DNS), antes e depois do restore.
- `apply_migration.py --status`.
- Consultas só de leitura: sanidade, pré-condições da 0012, divergência (64) e RLS (Q6).
- B-03: consultas ao PostgREST com a service role, na forma atual e com `!inner`.
- #68: venv limpo com o `requirements.txt`, usando `get_admin_db` e `fetch_all` do backend contra o banco real.
- `pg_restore -l` no dump.

## Resultado dos testes

✅ **Passou**:
- `readyz` 200 e *Keep-alive* verde.
- Pré-condições da 0012 ok; divergência vazia; Q6 só com a `schema_migrations`.
- B-03 refutado.
- #68 validado com o client do `requirements.txt`.
- Dump legível, com as 12 tabelas.

## Observações

- ⏳ **0012 e 0013 seguem sem aplicar:** aguardam o aval do dono, porque o plano pede staging antes da 0012 (I-23). O backup e as pré-condições estão prontos. Depois de aplicar:
  - conferir constraints, policies, trigger e RLS;
  - tirar o `last_updated` manual de `grades.py`, `sheets.py` e `import_csv.py`.
- **I-17** (Auto-Deploy no Render) segue sem conferência.
- **Pinger externo para o Render:** decisão do dono (O-02).
