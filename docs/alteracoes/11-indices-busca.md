# 11 — Índices de busca (trigram) e ordenação (M6)

## Problema identificado

As listagens fazem `ilike '%termo%'` em `students.full_name`/`student_number` e `profiles.full_name`/`email`/`username`, e ordenam por colunas de texto (`full_name`, `modules.name`) — sem índices adequados. `ilike` com curinga à esquerda **não usa b-tree**, então cada busca vira sequential scan; combinado com `ORDER BY` sem índice, custa scan + sort da tabela inteira conforme os dados crescem. Não havia `pg_trgm` nem índices GIN/trigram.

## Objetivo

Tornar buscas e ordenações escaláveis com índices apropriados, sem alterar as queries da aplicação.

## Arquivos alterados

- `supabase/migrations/0009_search_indexes.sql` (novo)

## Alterações realizadas

- `CREATE EXTENSION IF NOT EXISTS pg_trgm`.
- **GIN trigram** (`gin_trgm_ops`) para os `ilike`: `students.full_name`, `students.student_number`, `profiles.full_name`, `profiles.email`, `profiles.username`.
- **b-tree** para `ORDER BY`/filtro: `students.full_name`, `profiles.full_name`, `modules.name`, `profiles.role`.
- Idempotente (`IF NOT EXISTS`) + rollback comentado.

## Motivo técnico

O trigram é a solução idiomática para `LIKE/ILIKE '%x%'` no Postgres (b-tree só ajuda com prefixo `'x%'`). Colunas que já são `UNIQUE` (`students.student_number`, `profiles.username`, `academic_periods.name`) já possuem b-tree — por isso **não** dupliquei b-tree nelas (só adicionei o trigram onde há `ilike`). Os índices seguem o padrão de nomenclatura `idx_` existente no schema.

## Impactos positivos

- Buscas por nome/matrícula/email deixam de fazer full scan.
- `ORDER BY full_name/name` e filtro por `role` passam a usar índice.
- Ganho cresce com o volume de alunos/usuários.

## Testes executados

- **Build/Lint/Unit:** N/A (migration SQL).
- **Validação offline:** nomes de coluna conferidos contra `0001_initial_schema.sql` (`students.full_name/student_number`, `profiles.full_name/email/username/role`, `modules.name`); confirmado que `student_number`/`username`/`academic_periods.name` já são UNIQUE (não redundar b-tree).
- **Aplicação no banco:** ⏳ **pendente** — aplicar no SQL Editor do Supabase (fluxo do projeto; sem banco local aqui).
  - *Esperado:* extensão + índices criados sem erro.
  - *Obtido (offline):* migration válida por inspeção; execução a cargo do deploy.

## Resultado dos testes

✅ **Passou (offline)** — migration consistente com o schema. ⏳ Aplicação no Supabase pendente.

## Observações

- Em produção com volume, preferir `CREATE INDEX CONCURRENTLY` (fora de transação) para não bloquear escritas — anotado no cabeçalho da migration.
- Índice composto `audit_log(actor_id, created_at desc)` (apontado na auditoria) fica para quando o volume de auditoria justificar.
