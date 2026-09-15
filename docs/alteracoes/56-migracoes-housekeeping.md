# 56 — Manutenção das migrações (I-07, I-08, I-09, I-10)

## Problema identificado

Quatro achados baixos da análise 2026-09 (`03-banco-infra-devops.md`):

- **I-07:** havia dois arquivos `0002_*`. O `0002_seed_instructions.sql` só tinha comentários apontando para o `seed.py`. O `apply_migration.py` lidava com isso; o Supabase CLI não.
- **I-08:** `grades.last_updated` era preenchido à mão em cada caminho de escrita: PUT de nota, sync de planilha e o trigger de faltas da 0005. As outras tabelas têm trigger de `updated_at`. Um caminho novo que esquecesse o campo o deixaria velho.
- **I-09:** `schema_migrations` não existia como migração versionada. Só o `apply_migration.py` a criava, então quem aplicava pelo SQL Editor (como o README orienta) ficava sem ela e sem `--status`/`--mark-applied`.
- **I-10:** desde a 0011 (GRANT de escrita revogado para `anon`/`authenticated`), as policies de escrita da 0002, 0003 e 0005 são inalcançáveis. É intencional, mas quem lê só a 0002 acha que estão ativas.

## Objetivo

Arrumar essas pontas sem criar ruído no controle de migrações de produção.

## Arquivos alterados

- `supabase/migrations/0002_seed_instructions.sql`: apagado
- `supabase/migrations/0013_housekeeping.sql` (novo)
- `supabase/ci/checks.sql`: checks I-08 e I-09
- `DEPLOY.md`: nota do I-10 na seção de RLS; lista de migrações até a 0013
- `backend/scripts/apply_migration.py`: docstring de `_version_of` (citava o arquivo apagado)
- `backend/app/routers/grades.py`, `sheets.py`: comentário marcando o `last_updated` manual como redundante

## Alterações realizadas

- **I-07:** `0002_seed_instructions.sql` apagado. O `README` já documenta o `seed.py`, então nada se perde.
- **I-09:** a 0013 cria `schema_migrations` com o mesmo DDL do script (`CREATE TABLE IF NOT EXISTS`; no fluxo do script é no-op) e **liga RLS sem policies**. É metadado de deploy e não tem uso pela API; o script conecta como dono da tabela e não passa por RLS.
- **I-08:** a 0013 cria `public.set_last_updated()` (com `search_path` fixo, como os da 0012) e o trigger `trg_grades_last_updated` (`BEFORE UPDATE`) em `grades`.
- **I-10:** em vez de comentar a 0002, a seção "Segurança: RLS e service role" do `DEPLOY.md` explica que, desde a 0011, as policies de escrita não recebem nenhuma escrita pela API e só as de leitura valem.

## Motivo técnico

- **Por que não mexer na 0002:** o `apply_migration.py` guarda o checksum de cada migração aplicada. Editar a 0002 em produção, mesmo só com comentário, faria o `--status` mostrar **MODIFICADA** e o `--all` avisar "conteúdo mudou" para sempre. A mesma informação cabe no `DEPLOY.md`, que é onde se lê sobre RLS.
- **Linha órfã:** produção provavelmente tem `0002_seed_instructions` registrado em `schema_migrations`. Isso não causa problema, porque o `--status` e o `--all` partem dos arquivos existentes.
- **Por que o `last_updated` manual fica por enquanto:** o Render publica o código ao mesclar, mas a 0013 só entra em produção depois do restore do Supabase. Tirar a atribuição agora faria o campo parar de atualizar nesse intervalo. Os dois pontos ganharam um comentário dizendo quando podem sair.

## Testes executados

- **Validação local, como no job `migrations` do CI:** `postgres:17` descartável, `stub.sql`, `apply_migration.py --all` (com `DATABASE_URL` explícito para o contêiner) e `checks.sql`, que agora inclui:
  - **I-08:** uma nota com `last_updated` de ontem é atualizada e o campo precisa vir para agora;
  - **I-09:** `schema_migrations` precisa ter RLS ligada.
- **Prova de mutação:** num segundo contêiner, com o trigger trocado para `BEFORE INSERT`, o check I-08 tem de falhar.
- Suíte completa do backend.

## Resultado dos testes

✅ **Passou**:
- 0013 aplicada sobre 0001–0012; checks I-08 e I-09 ok.
- Com a mutação, o I-08 falhou como devia.
- Suíte do backend verde. A única falha local é a conhecida, do FastAPI 0.115 do Python global.

## Observações

- ⏳ **0012 e 0013 seguem pendentes em produção**, a aplicar juntas depois do restore do Supabase.
- Depois disso, as atribuições manuais de `last_updated` em `grades.py` e `sheets.py` podem sair.
