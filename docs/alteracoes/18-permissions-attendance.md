# 18 — Migração de /attendance para o helper canônico (M2, parte 3)

## Problema identificado

`attendance._assert_module_access` mantinha mais uma cópia inline da checagem "coordenador é dono do período" (via o período do módulo). Sétima+ cópia da mesma regra de autorização — risco de divergência silenciosa.

## Objetivo

Migrar o branch de coordenador de `_assert_module_access` para `assert_coordinator_owns_period`, preservando o contrato (403 + mensagem), depois de travá-lo com teste.

## Arquivos alterados

- `backend/app/routers/attendance.py`
- `backend/tests/test_attendance_save.py` (nova trava)

## Alterações realizadas

- **Trava (antes):** teste `test_coordenador_de_outro_periodo_403` — coordenador não-dono → 403 no save, sem nenhuma escrita. Verde contra o código pré-migração.
- **Migração:** branch `elif coordinator` de `_assert_module_access` agora chama `assert_coordinator_owns_period(db, mod.data["academic_period_id"], current_user, detail="Você não coordena este período.")`. O branch de professor (mensagem própria) permanece inline.

## Motivo técnico

Mesmo padrão travar→migrar das melhorias 12→13: escrever o teste que fixa o comportamento observável **antes** de tocar código de autorização, garantindo que a consolidação não altere o contrato. A mensagem foi preservada via `detail`.

## Impactos positivos

- Quatro routers (`students`, `exports`, `modules`, `attendance`) agora compartilham a única implementação da checagem coordenador↔período.

## Testes executados

- `pytest tests/test_attendance_save.py` → 4 passed (incl. a nova trava, contra o código pré-migração).
- `pytest` (suíte completa) pós-migração → **143 passed** (contrato preservado).

## Resultado dos testes

✅ **Passou** — `143 passed`.

## Observações

- Restam cópias em `sheets`, `import_csv`, `medical_certificates`, `dashboard` e o padrão professor↔aluno — mesmo ciclo quando priorizadas.
