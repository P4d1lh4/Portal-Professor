# 09 — Rate limiting, security headers e política de senha (S1)

## Problema identificado

Três lacunas de hardening apontadas na auditoria:
1. **Sem rate limiting**: `POST /me/change-password` revalida a senha atual via login no Supabase a cada tentativa — vetor de brute-force sem throttle.
2. **Sem security headers**: nem a API nem o frontend enviavam `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, etc. (clickjacking, sniffing, downgrade).
3. **Sem política de senha na criação de usuários**: `UserCreate.password` era `str` sem validação (admin podia criar conta com senha fraca). Note que `change-password` já exigia mín. 8, mas a **criação** não.

## Objetivo

Fechar as três lacunas com o menor acréscimo de superfície: throttle no endpoint sensível, headers de segurança no back e no front, e mínimo de senha na criação.

## Arquivos alterados

- `backend/app/schemas/users.py` (mín. de senha)
- `backend/app/services/ratelimit.py` (novo — limiter)
- `backend/app/routers/users.py` (guard no change-password)
- `backend/app/main.py` (middleware de headers)
- `frontend/vercel.json` (headers do SPA)
- `backend/tests/test_ratelimit.py`, `backend/tests/test_security.py` (novos)

## Alterações realizadas

- **Política de senha:** `UserCreate.password: str = Field(min_length=8)`.
- **Rate limit:** `check_rate_limit(key, max_calls, window)` — fixed-window em memória, thread-safe. Aplicado em `change_my_password` (5 tentativas/60s por usuário) → HTTP 429 ao exceder.
- **Security headers (API):** middleware `add_security_headers` adiciona `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security`.
- **Security headers (SPA):** mesmos headers em `vercel.json` para todas as rotas.

## Motivo técnico

Para o rate limit, optou-se por um limiter próprio de ~15 linhas em vez de adicionar **slowapi**: o alvo é **um** endpoint, o deploy é de **worker único** (`WEB_CONCURRENCY=1`), e a versão em memória é trivialmente testável sem rede — enquanto slowapi (app-wide, multi-estratégia, exception handler, param `Request`) seria peso desnecessário aqui. A limitação (in-memory, por processo) está comentada com o caminho de upgrade (Redis/slowapi) para multi-worker. A **CSP** foi deliberadamente deixada de fora: numa SPA que fala com Supabase + API, uma CSP incorreta quebra a aplicação, e não há como validá-la contra o deploy real agora — melhor adicionar depois com teste, do que enviar uma que derruba produção.

## Impactos positivos

- Brute-force da senha atual passa a ser barrado após 5 tentativas/min.
- Respostas de API e SPA com hardening contra clickjacking/sniffing/downgrade.
- Contas novas não podem mais ter senha com menos de 8 caracteres.

## Testes executados

- **Unitários/Integração:** `pytest` (suíte completa).
  - `test_ratelimit.py`: permite até o limite e bloqueia; isolamento por chave; janela.
  - `test_security.py`: `UserCreate` rejeita senha curta / aceita forte; headers presentes em `GET /api/healthz`.

## Resultado dos testes

✅ **Passou** — `127 passed` (121 + 6 novos). Sem regressões.

## Observações

- O guard de rate limit em `change_my_password` (4 linhas) não tem teste de integração dedicado (exigiria mock httpx do Supabase); a **lógica** do limiter está coberta por unit tests.
- **CSP** e política de **complexidade** (não só tamanho) de senha ficam como refinamento futuro, idealmente com teste contra o app real.
- Considerar aplicar o limiter também a outras rotas de escrita/busca se surgir abuso.
