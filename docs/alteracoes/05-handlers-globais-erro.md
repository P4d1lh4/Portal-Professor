# 05 — Handler global de exceções + contrato de erro

## Problema identificado

Não havia nenhum `exception_handler` registrado. Exceções não tratadas (erro do supabase-py, rede, constraint) viravam o 500 do Starlette com **corpo em texto plano** (`Internal Server Error`), inconsistente com o resto da API (que usa `{detail}` via `HTTPException`). Além disso, esses erros subiam **sem log** central, e os schemas `MessageResponse`/`ErrorResponse` existiam sem nunca serem usados.

## Objetivo

Padronizar a resposta de erros não tratados (JSON `{detail}`), registrar log central e criar um ponto único para futura telemetria/request-id — sem vazar detalhe interno ao cliente.

## Arquivos alterados

- `backend/app/main.py`
- `backend/tests/test_error_handler.py` (novo)

## Alterações realizadas

- `unhandled_exception_handler(request, exc)` registrado via `app.add_exception_handler(Exception, ...)`: loga com `logger.exception` (inclui traceback nos logs) e retorna `JSONResponse(500, ErrorResponse(detail="Erro interno no servidor.").model_dump())`.
- Passa a **usar** o schema `ErrorResponse` (antes morto).
- 2 testes: shape 500 padronizado e não-vazamento do detalhe da exceção.

## Motivo técnico

Um único handler catch-all cobre todos os erros inesperados de todos os routers — bem menor que tratar caso a caso. Optou-se por mensagem genérica ao cliente + `logger.exception` no servidor (o detalhe fica no log, não na resposta), seguindo o padrão seguro já usado em `change-password`. O handler é uma função nomeada e importável, o que permite testá-lo diretamente sem precisar de uma rota que lance.

## Impactos positivos

- Contrato de erro consistente (`{detail}` JSON) inclusive para falhas inesperadas.
- Log central de erros não tratados (base para observabilidade).
- `ErrorResponse` deixou de ser código morto.

## Testes executados

- **Unitários/Integração:** `pytest` (suíte completa).
- **Build/Lint:** N/A (lint de backend não está no CI — backlog M13).

## Resultado dos testes

✅ **Passou** — `121 passed` (119 anteriores + 2 novos). Sem regressões.

## Observações

- Handlers específicos (ex.: mapear `APIError` do postgrest para status mais preciso) e `request-id` ficam para a melhoria de observabilidade — o catch-all já garante o shape e o log.
