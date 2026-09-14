# 37 — Testes HTTP de authz nos routers que não tinham (B-13)

## Problema identificado

**B-13 (Alto)**, análise 2026-09, Fase 2. Seis routers não tinham nenhum teste HTTP de autorização: `users` (9 rotas, inclusive troca de papel), `medical_certificates` (8, inclusive upload de PDF), `sheets` (2), `reports` (2), `exports` (2) e `audit` (1). O papel `professor` também nunca era testado no dashboard. Como a autorização é 100% da aplicação (a API usa service_role e bypassa o RLS), essas rotas não tinham rede contra regressão.

## Objetivo

Travar, rota por rota, quem pode e quem não pode, no padrão papel × dono/não-dono do `test_students_authz.py`, usando o fake único do B-12.

## Arquivos alterados

- `backend/tests/test_users_authz.py` (novo)
- `backend/tests/test_medical_certificates_authz.py` (novo)
- `backend/tests/test_sheets_authz.py` (novo)
- `backend/tests/test_reports_authz.py` (novo)
- `backend/tests/test_exports_authz.py` (novo)
- `backend/tests/test_audit_log_authz.py` (novo)
- `backend/tests/test_authz.py` (professor no dashboard)
- `backend/tests/fakes.py` (resposta por função)
- `.github/workflows/ci.yml` (`--cov-fail-under` 60 → 70)

## Alterações realizadas

- **users:**
  - As 5 rotas só de admin (listar, criar, editar, desativar, reativar) dão 403 para coordenador e professor, sem escrita e sem chegar ao Supabase Auth.
  - `/api/me` devolve o usuário logado.
  - Os dropdowns filtram por papel e não expõem e-mail.
  - Admin muda papel, desativa outro usuário, não desativa a si mesmo e reativa.
- **medical_certificates:**
  - As 8 rotas dão 403 para o coordenador de outro período e para o professor sem o aluno matriculado, sem escrita.
  - Admin, coordenador dono e professor com o aluno listam.
  - A checagem filtra pelo usuário logado; aluno inexistente dá 404.
  - O upload recusa content-type errado e arquivo sem cabeçalho `%PDF-` (415).
- **sheets:**
  - Professor e coordenador de outro período levam 403 nas 2 rotas.
  - O coordenador dono salva a URL.
  - URL fora do Google dá 422 sem gravar (SSRF).
- **reports:**
  - Boletim: 6 casos (admin; coordenador dono e não-dono; professor com, sem e sem módulo); aluno inexistente dá 404.
  - Relatório do período: admin, coordenador dono e não-dono, e professor (403 pelo papel).
- **exports:** alunos do período e notas do módulo, por papel e dono.
- **audit:**
  - Não-admin tem o filtro `actor_id` forçado para o próprio id, mesmo pedindo o de outro.
  - Admin filtra pelo que pedir, e sem filtro vê tudo.
- **dashboard:** o professor vê só os próprios módulos (filtro `professor_id`), ignora `period_id` alheio sem consultar `academic_periods`, e o resumo é calculado.
- **`fakes.py`:** a resposta de uma tabela pode ser uma função `query -> Resp`, que decide pelos filtros registrados. Isso é necessário quando a mesma tabela é lida duas vezes com filtros diferentes, como no relatório do período (o período, depois a checagem de dono).
- **Piso de cobertura 60% → 70%**, como previsto na alteração 35.

## Motivo técnico

Onde o escopo é uma checagem que levanta 403, o teste afirma o status e a ausência de escrita. Onde o escopo é **um filtro na própria query** (audit-log, dashboard do professor), o status é 200 de qualquer jeito. Aí o único jeito de travar é afirmar sobre os filtros, que é o que o registro do B-12 permite.

## Impactos positivos

- As 24 rotas apontadas ganham trava de authz.
- A cobertura vai de **64,94% para 73,60%** (`audit` 100%, `exports` 97%).
- Uma regressão de escopo nesses routers passa a quebrar o CI.

## Testes executados

- `pytest -q --cov=app --cov-fail-under=70` no venv isolado.
- **Provas de mutação** (código de produção alterado temporariamente e restaurado em seguida):
  1. `audit.py` sem o filtro forçado de `actor_id` para não-admin;
  2. `medical_certificates.py` sem o `.eq("coordinator_id", ...)`;
  3. `reports.py` sem a checagem de dono no relatório do período.

## Resultado dos testes

✅ **Passou**: `243 passed, 2 skipped` (+69), cobertura 73,60%. As 3 mutações são pegas:

| Mutação | Testes que falham |
|---|---|
| audit sem filtro forçado | `test_nao_admin_so_ve_as_proprias_acoes[coordinator]` e `[professor]` |
| atestados sem `coordinator_id` | `test_checagem_filtra_pelo_usuario_logado` |
| relatório do período sem checagem de dono | `test_relatorio_do_periodo[coordinator-coord-2-False-403]` (passou a dar 200) |

## Observações

- Caminhos felizes além da authz ficaram de fora: conteúdo do PDF, cálculo de linhas do export, fluxo completo de upload com storage. O FakeDb não tem `storage`; uma rota que o alcançasse num teste de 403 quebraria alto (o que é bom).
- `dashboard.py` (51%) e `medical_certificates.py` (57%) seguem com os menores números: o que falta é caminho feliz (agregação do coordenador, hidratação de anexos).
