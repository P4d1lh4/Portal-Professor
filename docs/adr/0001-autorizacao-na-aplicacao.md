# ADR 0001 — Autorização na camada de aplicação

- **Status:** aceita. Registra a decisão em vigor desde o início do projeto.
- **Data do registro:** 2026-09-15

## Contexto

O backend (FastAPI) acessa o Supabase com a **service_role**, que ignora Row Level Security. O frontend nunca fala direto com as tabelas: tudo passa pela API, e o Supabase Auth só emite o JWT que o backend valida.

Ao mesmo tempo, as migrações definem policies de RLS por papel (a `0002` e as das tabelas criadas depois). Quem lê só o banco pode concluir que o RLS protege os dados no caminho normal. Não protege: no caminho normal ele é ignorado.

## Decisão

1. **Toda autorização acontece no FastAPI:**
   - `require_role(...)` no endpoint;
   - a checagem de escopo: professor só nos próprios módulos, coordenador só nos períodos que coordena, por `services/permissions.py`, `services/guards.py` e os `_assert_*` dos routers (o item B-07 consolida os que restam);
   - as regras de estado, como período encerrado (`assert_module_period_active`).
2. **O RLS fica como defesa em profundidade** para o acesso direto com a `anon key`, caso ela vaze ou o frontend passe a ler tabelas. Desde a `0011`, `anon` e `authenticated` não têm GRANT de escrita. As policies de leitura continuam valendo, e as de escrita não recebem nenhuma escrita pela API.
3. **Todo endpoint novo** tem a checagem de papel e escopo e um teste HTTP por papel, incluindo o "não é dono" (`tests/fakes.py` + fixture `as_user`).

## Alternativas consideradas

- **JWT do usuário no PostgREST, com RLS como autorização principal.** Tiraria parte da checagem do backend, mas:
  - regras que não são de linha (período encerrado, auditoria, RPCs transacionais, SSRF da planilha) ficariam divididas entre SQL e Python;
  - os testes de autorização passariam a exigir um banco real;
  - cada regra nova teria de ser escrita em policy e no Python do mesmo jeito.

## Consequências

- **Positivas:**
  - Uma camada só concentra as regras de acesso, fácil de ler e testar sem banco (testes HTTP por papel com o `FakeDb`).
  - O RLS não precisa espelhar cada regra de negócio.
- **Negativas:**
  - Esquecer a checagem num endpoint novo expõe dados, porque a service_role vê tudo. Por isso o teste por papel é obrigatório e a revisão confere `require_role` e o escopo.
  - Um bug no backend não é contido pelo banco.
  - A `service_role` é o segredo mais sensível do sistema: só no backend, com rotação descrita no [runbook](../runbook.md).
