# 21 — Security headers ausentes em respostas 500

## Problema identificado

O middleware `add_security_headers` roda como user-middleware, que no stack do Starlette fica **abaixo** do `ServerErrorMiddleware`. Quando uma exceção não tratada propaga, o handler de 500 (`unhandled_exception_handler`) gera o `JSONResponse` **acima** do user-middleware — então as respostas 500 saíam **sem** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` e `HSTS` (o `X-Request-ID` sobrevivia porque o handler o injeta direto). Hardening inconsistente entre respostas de sucesso e de erro.

## Objetivo

Garantir os mesmos security headers em respostas 500, sem duplicar valores.

## Arquivos alterados

- `backend/app/main.py`
- `backend/tests/test_error_handler.py`

## Alterações realizadas

- Extraído `_SECURITY_HEADERS` (dict único) usado tanto pelo middleware quanto pelo handler.
- `unhandled_exception_handler` passa a incluir `{**_SECURITY_HEADERS, X-Request-ID}` no `JSONResponse` — mesmo padrão já usado para o request-id.
- Teste: o handler de 500 retorna `X-Content-Type-Options`, `X-Frame-Options` e `HSTS`.

## Motivo técnico

O 500 não passa pelo user-middleware (é gerado acima dele no stack), então aplicar os headers no próprio handler é a correção mínima e correta — replicando exatamente o que já era feito com o `X-Request-ID`. O dict compartilhado evita divergência entre os dois pontos.

## Impactos positivos

- Hardening consistente em toda a superfície de resposta (sucesso e erro).
- Elimina um achado típico de scanners de conformidade.

## Testes executados

- `pytest` (suíte completa).

## Resultado dos testes

✅ **Passou** — `159 passed` (+1). Sem regressões.

## Observações

- Severidade Média: a API serve JSON (impacto de X-Frame-Options num corpo de erro é marginal), mas é inconsistência real de hardening. Achado/verificado na revisão adversarial pós-merge.
