# 58 — CONTRIBUTING, ADR de autorização e scripts no README (I-31, B-11)

## Problema identificado

- **I-31 (Médio)**, análise 2026-09 (`03-banco-infra-devops.md`). Faltavam:
  - um `CONTRIBUTING.md`: o fluxo de `docs/alteracoes/` já era o padrão, mas só na prática;
  - um registro da decisão "a service_role ignora RLS; a autorização é da aplicação";
  - a menção ao `diagnose.py` e ao `apply_migration.py` no README.
- **B-11 (Baixo)**, análise 2026-09 (`01-backend.md`): routers com `def` e outros com `async def` + `asyncio.to_thread`, sem regra escrita.

Na revisão do README apareceram mais duas coisas:
- a seção **Segurança** dizia "2 camadas: dep FastAPI + RLS", o que é enganoso, porque no caminho normal o RLS é ignorado;
- a seção **Testes** não citava o frontend e ainda falava em 403 sem token (desde o FastAPI 0.122 é 401).

## Objetivo

Escrever o que o projeto já pratica, para quem chega depois (inclusive o próximo agente) não depender de ler o histórico.

## Arquivos alterados

- `CONTRIBUTING.md` (novo)
- `docs/adr/0001-autorizacao-na-aplicacao.md` (novo)
- `.github/pull_request_template.md` (novo)
- `README.md`: seção "Scripts de manutenção"; "Testes" e "Segurança" atualizadas
- `backend/scripts/diagnose.py`: senha sem default

## Alterações realizadas

- **`CONTRIBUTING.md`:**
  - fluxo de mudança (branch por item, CI verde, registro, merge);
  - formato do registro em `docs/alteracoes`;
  - commits (Conventional Commits em português);
  - backend: autorização, fake único de testes, **regra de `def`/`async def` (B-11)** e `DATABASE_URL` explícito em testes locais;
  - banco: migração idempotente, nunca editar a já aplicada, `checks.sql` e `stub.sql`;
  - frontend: mocks, regra de negócio fora das telas;
  - prova de mutação.
- **ADR 0001:** contexto (service_role, RLS ignorado), decisão (autorização no FastAPI, RLS como defesa em profundidade, teste por papel obrigatório), alternativa descartada (JWT do usuário com RLS como principal) e consequências.
- **Template de PR:** Problema, O que muda, Validação (testes, mutação, lint/build, migração) e Registro, para que o formato vire padrão, como a análise sugeria.
- **README:**
  - tabela dos quatro scripts de `backend/scripts/`, com o aviso de que o `.env` aponta para produção;
  - "Testes" com backend e frontend e o que o CI roda;
  - "Segurança" dizendo onde a autorização realmente acontece, com o link da ADR.
- **`diagnose.py`:** `SEED_DEFAULT_PASSWORD` passa a ser obrigatória. O script caía em `"Escola@2024!"`, o mesmo padrão fraco que o I-11 tirou do `seed.py`.

## Motivo técnico

- **A regra de sync/async (B-11)** vem do que o código já faz certo: `def` roda no threadpool do FastAPI; `async def` sem `to_thread` em volta do supabase-py trava o event loop do worker único.

## Testes executados

- Revisão dos comandos e caminhos citados contra o repositório (scripts, flags do `apply_migration.py`, arquivos do CI).
- Suíte do backend (o `diagnose.py` não tem teste; a mudança é de uma linha).

## Resultado dos testes

✅ **Passou**: documentação conferida contra o código.

**Suíte do backend local:** 322 passaram, 2 skip e 1 falhou.
- A falha é `test_me_sem_token_retorna_401` (403 ≠ 401), porque o Python local tem FastAPI 0.115, e o 401 sem token vem do 0.122+.
- O `requirements.txt` fixa 0.141.1, e o CI roda com ele (verde nos PRs anteriores).
- É diferença de ambiente, não desta mudança, que não toca código da API.

## Observações

- **Achado para o B-07 ou item próprio:** `medical_certificates.upload_attachment` é `async def` (faz `await file.read()`), mas chama o supabase-py direto, sem `asyncio.to_thread`. Pela regra nova, isso bloqueia o event loop durante o upload. Fica registrado.
