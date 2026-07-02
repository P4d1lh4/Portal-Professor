# 16 — Observabilidade: request-id + readyz profundo (M12, parte 1)

## Problema identificado

- Logs sem correlação: impossível ligar as linhas de log de uma mesma request (ou casá-las com um erro relatado pelo usuário).
- `/api/healthz` retornava `{"status":"ok"}` estático — reportava "saudável" mesmo com o Supabase caído, mascarando falhas.

## Objetivo

Introduzir os primitivos de observabilidade de maior valor e menor custo: request-id correlacionável e um readiness que reflete a dependência real (Supabase), sem adicionar dependência externa.

## Arquivos alterados

- `backend/app/observability.py` (novo)
- `backend/app/main.py`
- `backend/tests/test_observability.py` (novo)

## Alterações realizadas

- **Request-ID:** `observability.py` com `ContextVar` + helpers + `RequestIdFilter` + `setup_logging()`. Middleware em `main.py` reaproveita `X-Request-ID` do cliente/proxy ou gera um, propaga no header da resposta e nos logs.
- **Log correlacionável:** logger `app` configurado com formato `... [request_id] name: msg` (sem dependência; propagate=False para não duplicar/conflitar com uvicorn).
- **Handler de erro:** passa a devolver `X-Request-ID` também na resposta 500.
- **`/api/readyz`:** readiness que faz um `SELECT id LIMIT 1` em `profiles` via `to_thread` → **503** se o Supabase falhar. `/api/healthz` continua como liveness barato (Render usa este).

## Motivo técnico

Separar **liveness** (`healthz`, barato) de **readiness** (`readyz`, checa dependência) é deliberado: uma indisponibilidade transitória do Supabase não deve derrubar a liveness e provocar restart do processo. O request-id é o backbone de observabilidade — implementado com `ContextVar` + `logging.Filter` (stdlib), sem Sentry/structlog, que seriam peso e um exigiria DSN externo. Um formatter JSON pode ser plugado depois sem mudar este contrato.

## Impactos positivos

- Toda request tem um id rastreável em log e no header (suporte pode correlacionar um erro reportado).
- Health check deixa de mascarar Supabase caído (readyz reflete o estado real).
- Base pronta para Sentry/APM quando houver DSN.

## Testes executados

- `pytest` (suíte completa):
  - `X-Request-ID` gerado em `healthz`; id do cliente é ecoado;
  - `readyz` → 200 com Supabase ok (fake) e **503** quando `get_admin_db` falha;
  - `RequestIdFilter` injeta o id corrente no `LogRecord`.

## Resultado dos testes

✅ **Passou** — `142 passed` (137 + 5 novos). Sem regressões.

## Observações

- **Sentry/APM** e **formatter JSON** ficam como próximo passo do M12 — o Sentry exige DSN (ação do responsável).
- Atualizar `render.yaml`/Docker para usar `/api/readyz` como readiness probe (mantendo `/api/healthz` como liveness) é ação de configuração de deploy.
