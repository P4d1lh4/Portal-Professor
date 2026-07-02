# 13 — Migração de /modules para o helper canônico de authz (M2, parte 2)

## Problema identificado

`modules.py` mantinha uma cópia própria (`_assert_coord_owns_period`, assinatura por `coordinator_id`) da checagem "coordenador é dono do período", usada em 4 call sites (create, coordinator_create, update, delete). Cópias de lógica de autorização divergem silenciosamente — o helper canônico `services/permissions.py` já existia (melhoria 10) mas `modules` ainda não o consumia.

## Objetivo

Eliminar a cópia local, fazendo os 4 call sites usarem `assert_coordinator_owns_period` do módulo canônico, **sem alterar o contrato observável** (403 + mesma mensagem).

## Arquivos alterados

- `backend/app/routers/modules.py`

## Alterações realizadas

- 4 call sites migrados para `assert_coordinator_owns_period(db, period_id, current_user, detail="Você não tem permissão para gerenciar módulos neste período.")` — mensagem original preservada via `detail`.
- Helper local `_assert_coord_owns_period` removido (sem uso).
- Os `if current_user.role == "coordinator"` existentes foram mantidos (o helper também é no-op para outros papéis, mas o `if` documenta a intenção e mantém o diff mínimo).

## Motivo técnico

Refatoração feita **depois** de travar o comportamento com os testes da melhoria 12 — a ordem correta para normalizar código de segurança. A substituição foi mecânica (script com `assert count` em cada padrão antes de substituir, falhando alto se o código não estivesse como esperado). `periods._assert_period_access` **não** foi migrado: seu 404 é decisão deliberada de segurança (não revelar existência) e sua lógica cobre também o papel professor — não é a mesma regra.

## Impactos positivos

- Uma única implementação da checagem coordenador↔período em `students`, `exports` e `modules` (7 call sites no total).
- Correções futuras nessa regra acontecem em um só lugar.

## Testes executados

- `pytest` (suíte completa) — incluindo os 4 testes de trava da melhoria 12, que passaram **inalterados** contra o código refatorado (contrato preservado).

## Resultado dos testes

✅ **Passou** — `134 passed` (130 + 4 da melhoria 12). Sem regressões.

## Observações

- Restam cópias em `sheets`, `import_csv`, `medical_certificates`, `attendance`, `dashboard` e o padrão professor↔aluno (4 variantes) — migrar cada um **após** travar seu comportamento com testes (mesmo fluxo 12→13).
