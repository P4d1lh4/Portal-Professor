# 29 — Fase 0: keep-alive, B-01 (backend), seed sem senha default, docs de migração

## Problema identificado

Achados da Fase 0 da análise de 2026-09 (`docs/analise-2026-09/05-plano-de-execucao.md`):

- **O-01b:** o Supabase free pausa após 7 dias sem tráfego (produção caiu em 2026-08-05 e de novo em 2026-09), e não havia keep-alive nem alerta.
- **B-01:** `PyJWT 2.9.0` e `starlette 0.41.3` (via `fastapi 0.115.6`) com advisories de 2026, na validação de token e no parse de multipart.
- **I-11:** o `seed.py` caía em senhas fracas documentadas quando faltava `SEED_*_PASSWORD`, e dev e prod usam o mesmo Supabase.
- **I-27 / I-28 / I-30:** README e DEPLOY.md ainda diziam "0001–0007", e o INDEX pedia para aplicar 0008–0010, que já estavam aplicadas.

## Objetivo

Dar alarme à produção, tirar do backend os advisories conhecidos e limpar da documentação o que induzia a erro.

## Arquivos alterados

- `.github/workflows/keepalive.yml` (novo)
- `backend/requirements.txt`, `backend/tests/test_health.py`
- `backend/scripts/seed.py`
- `README.md`, `DEPLOY.md`, `docs/alteracoes/INDEX.md`

## Alterações realizadas

- **Keep-alive:** cron a cada 10 min faz `curl -f` no `/api/readyz`, que consulta o banco. Mantém o Supabase ativo e o Render acordado; se falhar, o GitHub manda e-mail.
- **B-01:** `fastapi` 0.115.6 → 0.141.1 (puxa `starlette` 1.6.0) e `PyJWT` 2.9.0 → 2.14.0. Vieram junto os minor/patch do grupo #61 (pydantic 2.13.5, pydantic-settings 2.15.0, uvicorn 0.52.4, python-dotenv 1.2.3, psycopg 3.3.5, reportlab 5.0.1), **exceto** `supabase` 2.8.1 → 2.31.0. Esse fica para depois do Supabase restaurado: sem banco vivo não há como validar o client novo, e os testes mockam o DB.
- **`test_health`:** o `HTTPBearer` do FastAPI ≥ 0.122 devolve **401** sem token (antes devolvia 403). O teste já se chamava `..._retorna_401`; agora a asserção bate com o nome. O frontend (`lib/axios.ts`) já trata 401 como sessão inválida e manda para o login.
- **Seed:** `SEED_ADMIN_PASSWORD` e `SEED_DEFAULT_PASSWORD` passam a ser obrigatórias (`os.environ[...]`, sem default). O README usa placeholders no lugar de `admin123`/`senha123`.
- **Docs:** a árvore do README e o checklist do DEPLOY listam 0001–0011; o INDEX não pede mais para aplicar migrações já aplicadas.

## Motivo técnico

O keep-alive usa o `readyz` porque ele toca o banco; o `healthz` manteria acordado só o Render. O cron de 10 min fica abaixo dos 15 min de inatividade que fazem o Render dormir, e o repo é público, então os minutos de Actions são grátis. Usar a mesma versão do FastAPI que o Dependabot propõe evita que o grupo reabra com ela.

## Impactos positivos

- Uma pausa do Supabase deixa de passar despercebida e deixa de acontecer por falta de tráfego.
- `pip-audit` limpo no backend (com o pytest 9.1.1 do #62).
- O seed não cria mais usuário com senha conhecida no banco de produção.

## Testes executados

- Venv limpo com o `requirements.txt` novo e pytest 9.1.1: `pytest --cov=app --cov-fail-under=50`.
- `pip-audit -r backend/requirements.txt`.

## Resultado dos testes

✅ **Passou**: `162 passed, 2 skipped`, cobertura 60,99%; `pip-audit` sem achados.

## Observações

- **Pendente, manual, do responsável:** restaurar o projeto no painel do Supabase (O-01a) e conferir o Auto-Deploy no Render (I-17). Até o restore, o keep-alive falha e manda e-mail a cada execução.
- O GitHub desativa cron em repositório público após 60 dias sem commits. Se acontecer, reativar em Actions.
- Render free: manter o serviço acordado 24/7 consome ~744 h das 750 h/mês grátis do workspace.
- A parte frontend do B-01 (`npm audit fix`: nanoid/postcss) vai no PR de dependências do frontend.
