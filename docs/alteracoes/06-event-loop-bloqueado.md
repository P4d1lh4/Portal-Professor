# 06 — Correção do bloqueio do event loop (async/sync)

## Problema identificado

Quase todos os endpoints eram `async def` mas chamavam o cliente supabase-py (**síncrono**) diretamente na coroutine, sem `await`/`to_thread`. Como o FastAPI roda coroutines no event loop, cada request bloqueava a thread do loop durante todo o I/O de rede ao Supabase, serializando o throughput sob concorrência (agravado pelo worker único do plano free). A geração de PDF/CSV (reportlab, CPU-bound) também rodava síncrona no loop.

## Objetivo

Liberar o event loop: fazer com que os handlers de I/O puro rodem no threadpool do Starlette, sem reescrever cada query.

## Arquivos alterados

- `backend/app/routers/{attendance,audit,exports,modules,periods,reports,students}.py` (conversão total)
- `backend/app/routers/{users,medical_certificates,grades}.py` (conversão parcial/total)

## Alterações realizadas

- Handlers `async def` que **não** usam `await` foram convertidos para `def`. O Starlette executa handlers síncronos automaticamente no threadpool, então o I/O bloqueante do supabase-py deixa de travar o event loop.
- ~47 handlers convertidos. Mantidos `async` apenas os que realmente aguardam I/O assíncrono: `dashboard.get_dashboard` (usa `asyncio.gather`/`to_thread`), `import_csv.import_students` e `medical_certificates.upload_attachment` (`await file.read()`), `users.change_my_password` e `sheets.*` (`await httpx`).
- Em `grades.py`, os 3 (`_get_grade_with_permission`, `get_grade`, `update_grade`) viraram `def` e os `await` internos foram removidos.

## Motivo técnico

Esta é a correção de **menor diff** e menor risco: tornar o handler `def` delega ao threadpool sem tocar em cada chamada de query (a alternativa seria envolver cada `.execute()` em `asyncio.to_thread`, muito mais invasivo). É **auto-verificável**: se um handler que usa `await` fosse convertido por engano, viraria `SyntaxError` e a coleta do pytest quebraria imediatamente. O mapeamento foi guiado por `grep await` para preservar os handlers genuinamente assíncronos.

## Impactos positivos

- Event loop livre: requests concorrentes deixam de serializar no I/O ao Supabase.
- PDF/CSV (reports/exports) agora geram fora do loop.
- Padrão consistente e auto-verificável para novos endpoints.

## Testes executados

- **Unitários/Integração:** `pytest` (suíte completa) — a coleta importa todos os routers (pega qualquer `SyntaxError` de conversão), e os testes via `TestClient` exercitam handlers `def` e `async` igualmente.
- **Verificação estática:** `grep` confirmou zero resquício de `async def` indevido e zero `await` órfão.

## Resultado dos testes

✅ **Passou** — `121 passed`. Sem regressões.

## Observações

- `sheets.set_sync_url` foi deixado `async` (sem `await`) por conservadorismo — ganho marginal, e o arquivo mistura handlers com I/O httpx. Pode ser convertido depois.
- Ganho de throughput real deve ser confirmado sob carga; aqui garantimos ausência de regressão funcional.
- Próximo passo natural (fora do escopo): reuso de cliente Supabase (singleton) e `StreamingResponse` para exports grandes.
