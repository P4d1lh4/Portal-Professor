# 14 — Salvamento atômico da chamada via RPC (M4, parte 1)

## Problema identificado

`PUT /api/modules/{id}/attendance/{date}` fazia **3 escritas separadas** via PostgREST: upsert do `attendance_record`, `DELETE` de todas as `attendance_entries` e `INSERT` das novas. Uma falha (rede, timeout) entre o DELETE e o INSERT deixava a **chamada do dia vazia** — perda silenciosa dos dados de frequência já registrados. Além disso, a validação de matrículas rodava *depois* do upsert do record, então um 400 deixava rastro no banco.

## Objetivo

Tornar o salvamento da chamada tudo-ou-nada, seguindo o padrão de RPC transacional já estabelecido no projeto (`0007_create_student_with_enrollments`).

## Arquivos alterados

- `supabase/migrations/0010_save_attendance_day_rpc.sql` (novo)
- `backend/app/routers/attendance.py`
- `backend/tests/test_attendance_save.py` (novo — escrito ANTES do refactor)

## Alterações realizadas

- **RPC `save_attendance_day`** (PL/pgSQL, `SECURITY DEFINER` + `REVOKE` de `PUBLIC/anon/authenticated`): upsert do record via `ON CONFLICT (module_id, attendance_date)` (preservando `created_by` original no update), delete + insert das entries a partir de JSONB — tudo numa transação. O trigger de `grades.absences` (0005) dispara normalmente dentro dela.
- **Router:** a validação de enrollments foi movida para **antes** de qualquer escrita; o bloco de 3 escritas virou uma chamada `db.rpc("save_attendance_day", ...)`.
- **Testes (trava, escritos antes):** professor salva chamada → 200 com record; matrícula de outro módulo → 400 **sem nenhuma escrita** em entries; professor de outro módulo → 403 sem escrita.

## Motivo técnico

Atomicidade exige o banco — não há como compor 3 chamadas PostgREST numa transação pelo cliente. A RPC replica exatamente a semântica anterior (upsert + replace), então o contrato HTTP não muda — comprovado pelos testes de trava, que passaram inalterados antes e depois do refactor. Mover a validação para antes da escrita é correção de acurácia que a transação torna natural (400 = zero efeito).

## Impactos positivos

- Fim da janela de perda de dados no fluxo mais usado por professores (chamada diária).
- 400 de validação não deixa mais um record órfão/alterado para trás.
- Menos round-trips ao banco por save (3+ escritas → 1 RPC).

## Testes executados

- **Trava pré-refactor:** `pytest tests/test_attendance_save.py` → 3 passed contra o código antigo.
- **Suíte completa pós-refactor:** `pytest` → **137 passed** (os mesmos 3 testes verdes, contrato preservado).
- **SQL:** validado offline contra o schema (`0005`: `UNIQUE (module_id, attendance_date)`, enum `attendance_status`, colunas das entries). ⏳ **Aplicação no Supabase pendente** (SQL Editor, como as demais migrations).

## Resultado dos testes

✅ **Passou** — `137 passed`. ⏳ Migration `0010` pendente de aplicação.

## Observações

- **Ordem de deploy obrigatória:** aplicar a `0010` ANTES de subir este backend — o endpoint passa a depender da RPC.
- Restante do M4: import CSV em lote (RPC análoga recebendo array de alunos) e criação de usuário (Auth + profile — não transacionável via RPC, pois o Auth é serviço separado; mitigar com compensação/retry). Ficam para iteração futura.
- `_assert_module_access` em attendance contém mais uma cópia do padrão coordenador↔período — candidata à migração M2 (agora já há testes de 403 aqui).
