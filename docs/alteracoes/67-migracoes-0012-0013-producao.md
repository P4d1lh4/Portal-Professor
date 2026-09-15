# 67 — 0012 e 0013 aplicadas em produção; sai o `last_updated` manual

## Problema identificado

- **Migrações pendentes:** a 0012 (I-01..I-06) e a 0013 (I-08, I-09) estavam escritas e validadas no CI desde as alterações 33 e 56. Não tinham ido para produção porque o Supabase estava pausado (alteração 66).
- **`last_updated` duplicado:** `grades.last_updated` seguia gravado à mão em três caminhos (PUT de nota, sync da planilha, import CSV de notas), repetindo o trigger da 0013. Não dava para tirar antes: sem a 0013 no banco, o campo pararia de atualizar.

## Objetivo

Aplicar as duas migrações com o aval do dono e deixar o trigger como a única origem do `last_updated`.

## Arquivos alterados

- `backend/app/routers/grades.py`: sai a atribuição e o import de `datetime`
- `backend/app/routers/sheets.py`: sai o campo do patch
- `backend/app/routers/import_csv.py`: saem a atribuição, o `now_iso` e o `timezone`
- `docs/analise-2026-09/05-plano-de-execucao.md`: I-01..I-06 marcados; nota do I-07..I-10
- `docs/alteracoes/INDEX.md`: linhas 33, 56, 66 e 67
- `docs/alteracoes/66-incidente-supabase-pausado.md`: nota de atualização

## Alterações realizadas

- **Produção (2026-09-15, 15:13 UTC):** o `apply_migration.py --all` aplicou a 0012 e a 0013 na mesma transação. Antes disso:
  - backup do `public` com `pg_dump -Fc` (alteração 66);
  - pré-condições da 0012 conferidas: nenhum período com datas invertidas e nenhum e-mail repetido.
- **Conferência no banco:**
  - constraints `academic_periods_dates_order` e `profiles_email_key`; as duas FKs de período com `ON DELETE RESTRICT`;
  - policy `profiles_select_own_or_admin` no lugar da antiga;
  - trigger `trg_grades_last_updated`;
  - nenhuma tabela de `public` sem RLS (a `schema_migrations` ganhou a dela);
  - `--status`: 0012 e 0013 OK.
- **Visto de fora:** a chave `anon`, sem login, recebe `[]` de `profiles` (I-02), e o `readyz` segue 200.
- **Código:** as três atribuições manuais saem. O PUT de nota ganha um comentário apontando o trigger. O `sheets.py` mantém o `now_iso` para o `csv_last_sync`.

## Motivo técnico

- **Sem staging (I-23):** o plano pedia aplicar primeiro em staging. O dono autorizou aplicar direto em produção porque havia:
  - o backup do `public`;
  - as pré-condições conferidas;
  - o job de CI que aplica 0001→0013 num `postgres:17` e roda os checks.

  O `apply_migration.py` aplica as pendentes numa transação só, então um erro desfaria as duas.
- **Nenhum teste novo:** o comportamento é do banco e já tem trava no `checks.sql` (check I-08, com prova de mutação na alteração 56). Os testes do backend usam o `FakeDb`, que não tem trigger. Um teste de "o patch não leva `last_updated`" travaria a ausência de uma linha, e não uma regra.
- **Por que agora:** com a 0013 no ar, a atribuição manual só repetia o trigger. Um caminho novo de escrita já não precisa lembrar do campo.

## Impactos positivos

- As travas da análise 2026-09 estão em produção. O banco agora também barra:
  - período com datas invertidas;
  - e-mail repetido;
  - exclusão de período com vínculos;
  - troca de papel por quem não é admin.
- O `last_updated` tem uma só origem.

## Testes executados

- Conferência no banco e pelo PostgREST (acima).
- Suíte do backend num venv limpo com o `requirements.txt`, igual ao CI, com o `DATABASE_URL` apontando para um banco inexistente.

## Resultado dos testes

✅ **Passou**:
- 0012 e 0013 aplicadas e conferidas.
- 361 pytest passaram e 2 foram pulados; cobertura de 83,86% (piso de 70%).

## Observações

- **Login depois da 0012:** o frontend só lê a própria linha de `profiles` (`useAuth.ts`), e a policy nova permite isso. A confirmação é um login no site.
- **Rollback:** o da 0012 está na alteração 33; o da 0013, no cabeçalho do arquivo.
- **I-17** (Auto-Deploy no Render) segue sem conferência.
