# 02 — Atualização do README (migrations e features omitidas)

## Problema identificado

O `README.md` estava materialmente desatualizado: listava só 2 das 8 migrations e omitia 5 routers/features ativos (atestados médicos, frequência/faltas, auditoria, relatórios PDF, exportações CSV). Quem seguisse o passo 3 aplicava apenas `0001`/`0002` e subia um **banco quebrado**. Também descrevia o JWT como "python-jose (HS256)" (o código usa JWKS RS256/ES256), a contagem de testes como 33 (são 119) e Python 3.11 (CI/prod usam 3.13).

## Objetivo

Sincronizar o README com a realidade do código para que o onboarding não induza a erro e o escopo real do sistema fique visível.

## Arquivos alterados

- `README.md`

## Alterações realizadas

- **Stack:** JWT descrito como "via JWKS (RS256/ES256; HS256 legado)"; testes atualizados para "119 (backend)".
- **Árvore do monorepo:** routers e migrations completos (0001–0007 + seed).
- **Passo 3 (migrations):** lista as 7 migrations em ordem + aviso de que 0003–0007 são necessárias.
- **Pré-requisitos:** nota de que CI/produção usam Python 3.13.
- **Matriz de funcionalidades por papel:** adicionadas frequência/chamada, atestados médicos, relatórios PDF, exportações CSV e log de auditoria; ponteiro para `/api/docs` como fonte completa de endpoints.
- **Segurança:** descrição do JWT alinhada ao `auth.py`.

## Motivo técnico

Correção pontual dos trechos factualmente errados, sem reescrever o README (que já cobre bem o essencial). Onde a permissão exata por papel de uma feature não era trivialmente verificável, preferiu-se apontar para o Swagger (`/api/docs`) como fonte de verdade em vez de fabricar uma matriz precisa — documentação correta vale mais que exaustiva.

## Impactos positivos

- Onboarding aplica todas as migrations → banco íntegro.
- Escopo real do sistema (atestados, faltas, auditoria, relatórios) fica documentado.
- Elimina divergências que corroem a confiança na doc.

## Testes executados

- **Build/Lint/Unit/Integração:** N/A (mudança apenas de documentação).
- **Teste manual:** revisão de consistência do README contra `backend/app/main.py` (routers registrados), `supabase/migrations/` (arquivos existentes) e `backend/app/auth.py` (algoritmos JWT).
  - *Esperado:* README reflete routers, migrations e algoritmos reais.
  - *Obtido:* idêntico ao esperado.

## Resultado dos testes

✅ **Passou** — documentação consistente com o código.

## Observações

- A matriz de permissões por papel de algumas sub-features (relatórios/exports/atestados) é aproximada; a fonte canônica é o Swagger. Se M7 (contrato de API) formalizar isso, atualizar aqui.
