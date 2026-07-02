# 08 — Higiene de dependências (M14)

## Problema identificado

- `python-jose 3.3.0` (lib de JWT no caminho de auth) é versão legada com CVEs públicos associados (ex.: CVE-2024-33663, algorithm confusion).
- `PyJWT 2.9.0` estava declarado mas **nunca importado** (dependência morta; só `from jose` é usado em `auth.py:6`).
- Frontend com 3 dependências instaladas e **sem nenhum uso**: `@radix-ui/react-tabs`, `@radix-ui/react-popover`, `@tanstack/react-table`.

## Objetivo

Reduzir superfície de vulnerabilidade/manutenção: atualizar a lib de JWT para versão corrigida e remover dependências mortas do back e do front.

## Arquivos alterados

- `backend/requirements.txt`
- `frontend/package.json` (via `npm uninstall`)
- `frontend/vite.config.ts` (limpeza do `optimizeDeps.include`)

## Alterações realizadas

- `python-jose[cryptography]`: **3.3.0 → 3.5.0** (versão que corrige os CVEs conhecidos).
- **Removido `PyJWT==2.9.0`** (morto).
- **Removidas** `@radix-ui/react-tabs`, `@radix-ui/react-popover`, `@tanstack/react-table` do `package.json` e do `optimizeDeps.include`.

## Motivo técnico

Optou-se por **atualizar** o `python-jose` (mudança de uma linha, mantém `auth.py` intacto e testado) em vez de reescrever a validação de JWT para PyJWT — mesmo resultado de segurança com risco muito menor. O `PyJWT`, redundante e não usado, foi removido em vez de mantido "por precaução". As deps de frontend foram confirmadas sem uso (grep sem ocorrências, sem wrapper em `components/ui/`) antes de remover.

## Impactos positivos

- JWT em versão sem os CVEs conhecidos, no caminho crítico de autenticação.
- Uma lib de JWT canônica (fim da ambiguidade jose/PyJWT).
- Menos superfície de auditoria e bundle/`node_modules` menores no front.

## Testes executados

- **Backend:** `pip install python-jose==3.5.0` + `pytest` → **121 passed** (auth continua funcionando com a nova versão).
- **Frontend:** `npm run build` (`tsc -b && vite build`) → **exit 0** (nenhum import quebrado pelas remoções).

## Resultado dos testes

✅ **Passou** — backend `121 passed`; frontend build limpo.

## Observações

- `npm audit` ainda reporta vulnerabilidades em deps transitivas (dev/Vitest); tratar via auditoria automatizada de deps no CI (parte de M13/M14 restante: `pip-audit` + `npm audit` no pipeline).
- O aviso de chunk >500 kB no build é pré-existente (code-splitting de vendor) e será tratado em M9.
