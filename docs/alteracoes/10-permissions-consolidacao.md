# 10 — Consolidação de autorização em `services/permissions.py` (M2, núcleo seguro)

## Problema identificado

A checagem "coordenador é dono do período" estava reimplementada inline em vários routers (a auditoria contou 6+). Como a API bypassa RLS, cada cópia é uma superfície de erro de autorização — e a melhoria [A2] provou que uma cópia pode divergir e virar brecha. Além disso, `students.py` tinha o mesmo bloco **duplicado internamente** (2 endpoints).

## Objetivo

Criar um lar canônico para os helpers de autorização e migrar os pontos que são **comportamentalmente idênticos**, sem normalizar às cegas as variações intencionais.

## Arquivos alterados

- `backend/app/services/permissions.py` (novo)
- `backend/app/routers/students.py` (2 blocos → 1 helper)
- `backend/app/routers/exports.py` (1 bloco → helper)
- `backend/tests/test_permissions.py` (novo)

## Alterações realizadas

- `assert_coordinator_owns_period(db, period_id, current_user, *, detail=...)`: no-op para admin/professor; para coordenador, exige que ele coordene o período (senão 403). Preserva a mensagem via `detail`.
- Migrados os 3 sites idênticos (2 em `students.py`, 1 em `exports.py`), todos `if role == coordinator` + mesma query + 403.
- 3 testes unitários do helper (dono passa / não-dono 403 / admin é no-op sem tocar o banco).

## Motivo técnico

**Escopo deliberadamente limitado ao seguro.** As cópias de checagem de período **divergem de propósito**: `periods._assert_period_access` usa **404** (para não revelar a existência de períodos de terceiros) e trata o papel professor; `modules._assert_coord_owns_period` tem outra assinatura. Consolidar essas variações num único helper normalizaria comportamento (ex.: 404→403) e, em routers **sem teste**, isso é risco de regressão sem rede de segurança. Portanto migrei apenas os sites 100% idênticos (403, por `period_id`) e **deixei os divergentes** para depois de haver cobertura de integração (M15). O `_slugify` duplicado (função pura de 4 linhas) foi deixado como está: DRY-á-lo num módulo novo + 2 imports não compensa (YAGNI).

## Impactos positivos

- Uma implementação canônica da checagem coordenador↔período, testada.
- 3 cópias (incl. uma duplicação interna em `students.py`) eliminadas.
- Padrão pronto para os demais routers adotarem quando tiverem testes.

## Testes executados

- **Unitários/Integração:** `pytest` (suíte completa) — inclui os testes existentes de `students` e o novo `test_permissions.py`.

## Resultado dos testes

✅ **Passou** — `130 passed` (127 + 3 novos). Sem regressões.

## Observações

- **Deferido (depende de M15):** migrar `modules`, `sheets`, `import_csv`, `medical_certificates`, `attendance`, `dashboard` e o caso professor↔aluno para helpers canônicos, uma vez que haja testes de integração que travem o comportamento atual antes de normalizá-lo.
- `periods._assert_period_access` deve permanecer com 404 (decisão de segurança) — se for consolidado, o helper precisará de um parâmetro de status/estratégia.
