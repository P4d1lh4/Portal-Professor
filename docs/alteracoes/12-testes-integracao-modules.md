# 12 — Testes de integração de autorização em /modules (M15, parte 1)

## Problema identificado

O router `modules` — maior consumidor da checagem "coordenador é dono do período" — não tinha **nenhum** teste de rota. Isso impedia a continuação segura da consolidação de authz (M2): normalizar uma checagem sem testes que travem o comportamento atual é regressão esperando para acontecer. (`periods` já estava travado por `TestGetPeriodAuthz`, incluindo o 404 deliberado.)

## Objetivo

Travar via testes de integração (TestClient) o contrato observável da autorização de coordenador em `modules`: **403 com a mensagem específica** para não-dono em POST/PUT/DELETE, e sucesso para o dono — ANTES de qualquer refatoração.

## Arquivos alterados

- `backend/tests/test_modules_authz.py` (novo)

## Alterações realizadas

4 testes:
- `PUT /api/modules/{id}` como coordenador não-dono → 403 + mensagem "…módulos neste período" + **nenhum update gravado**;
- `DELETE /api/modules/{id}` não-dono → 403 + nenhum delete;
- `POST /api/modules` não-dono → 403 + nenhum insert;
- `PUT` como **dono** → 200 + update com payload correto (controle positivo).

## Motivo técnico

Segue o padrão de teste já estabelecido no projeto (override de `get_current_user` + monkeypatch de `get_admin_db` com fake encadeável por tabela + recorder de escritas). Os asserts cobrem os dois lados do guard (nega não-dono / permite dono) e verificam efeito colateral (nada gravado no 403) — exatamente o que a migração do M2 não pode alterar. Os testes foram escritos e executados **contra o código atual** (4 verdes) antes do refactor.

## Impactos positivos

- M2 pode prosseguir em `modules` com rede de segurança.
- CRUD de módulos deixa de ser rota sem teste.

## Testes executados

- `pytest tests/test_modules_authz.py` → **4 passed** (contra o código pré-refactor).

## Resultado dos testes

✅ **Passou** — 4/4 contra o comportamento atual.

## Observações

- A parte de **RLS (pgTAP)** do M15 permanece bloqueada: exige Postgres com troca de role, inexistente neste ambiente.
- Próximos routers a travar (mesmo padrão): `attendance`, `medical_certificates`, `sheets`, `import_csv`, `dashboard` — pré-requisito para migrar suas cópias de authz.
- A consolidação de fixtures num `conftest.py` segue no backlog (os fakes locais por arquivo são o padrão vigente do projeto).
