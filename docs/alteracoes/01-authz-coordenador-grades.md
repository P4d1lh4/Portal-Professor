# 01 — Autorização do coordenador em notas (grades)

## Problema identificado

O endpoint de notas `GET`/`PUT /api/grades/{enrollment_id}` protegia apenas o papel `professor`. Em `_get_grade_with_permission` (o único ponto por onde ambos os métodos passam), havia só `if current_user.role == "professor": ...`. Os papéis `coordinator` e `admin` passavam sem qualquer checagem de escopo.

Como toda a API usa `get_admin_db()` (service role, que **bypassa RLS**), a policy RLS `grades_update` — que restringe o coordenador a `is_coordinator_of(period)` — **não é aplicada em runtime**. Resultado: um coordenador autenticado podia **ler e editar notas de módulos de períodos que não coordena** (IDOR / escalonamento horizontal). Era, ainda, uma inconsistência: todos os outros routers (modules, periods, students, reports, exports…) escopam o coordenador; só `grades` não.

## Objetivo

Restringir `coordinator` às notas de módulos cujo período acadêmico ele coordena, alinhando o endpoint aos demais routers e à policy RLS existente. `admin` permanece com acesso total; `professor` permanece inalterado.

## Arquivos alterados

- `backend/app/routers/grades.py`
- `backend/tests/test_grades_endpoint.py`

## Alterações realizadas

- Adicionado um branch `elif current_user.role == "coordinator"` em `_get_grade_with_permission`. Ele busca o módulo com o `coordinator_id` do período embutido (`academic_period:academic_periods!academic_period_id(coordinator_id)`) e retorna **403** se `coordinator_id != current_user.id`.
- O branch do `professor` e o caminho do `admin` não foram tocados.
- Dois testes de regressão adicionados:
  - `test_coordenador_do_periodo_salva_nota_200` — coordenador do período edita a nota → 200.
  - `test_coordenador_de_outro_periodo_nao_edita_nota_403` — coordenador de outro período → 403 e **nenhum** update gravado.

## Motivo técnico

A correção foi feita no **choke point compartilhado** (`_get_grade_with_permission`), por onde GET e PUT passam — um único guard cobre os dois métodos, em vez de repetir a checagem em cada handler (root cause, não sintoma). O padrão espelha o branch já existente do `professor` (uma query a `modules`), mantendo consistência com o código atual e evitando introduzir uma abstração de permissões agora (isso é a melhoria M2, separada). Diff mínimo, sem alterar caminhos que já funcionavam.

## Impactos positivos

- Fecha o gap de autorização entre períodos para o papel coordenador (integridade das notas).
- Torna `grades` consistente com os demais routers e com a policy RLS.
- Cobertura de regressão para os dois cenários (permitido/negado), travando o comportamento.

## Testes executados

- **Build/typecheck:** N/A para esta mudança (Python; sem etapa de build). Sintaxe validada pela execução do pytest.
- **Lint:** não há lint configurado no CI de backend (registrado como melhoria M13). Não introduzido nesta etapa para manter escopo.
- **Testes unitários/integração:** `pytest` — alvo (`test_grades_endpoint.py`, `test_authz.py`, `test_grades.py`) e suíte completa.
- **Testes manuais:** não necessários — os cenários foram cobertos por testes automatizados via `TestClient`.
  - *O que foi testado:* coordenador do período (esperado 200) e coordenador de outro período (esperado 403 sem gravação).
  - *Resultado esperado:* 200 com nota recalculada; 403 sem update no recorder.
  - *Resultado obtido:* idêntico ao esperado.

## Resultado dos testes

✅ **Passou** — `119 passed` na suíte completa; alvo de grades/authz `17 passed`. Sem regressões.

## Observações

- `admin` continua com acesso total por design (correção de qualquer período, registrada no audit_log).
- A checagem duplica, de forma pontual, a lógica "coordenador dono do período" já presente em outros routers. A consolidação num `services/permissions.py` está planejada como melhoria **M2** — quando feita, este branch deve passar a consumir o helper compartilhado.
- Nenhum segredo, migration ou contrato de API foi alterado.
