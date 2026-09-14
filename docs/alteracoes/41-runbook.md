# 41 — Runbook de produção (I-26)

## Problema identificado

**I-26 (Médio)**, análise 2026-09, `03-banco-infra-devops.md`: não havia runbook. A queda de 2026-09-03 (Supabase pausado, `readyz` 503) passou dias sem ninguém saber o que olhar. Rotação de chave vazada e restore de backup também não tinham procedimento escrito.

## Objetivo

Um documento único para o momento do incidente: começa pela triagem e leva à ação certa, com um jeito de confirmar que resolveu.

## Arquivos alterados

- `docs/runbook.md` (novo)
- `DEPLOY.md`: aponta para o runbook no topo

## Alterações realizadas

`docs/runbook.md`, em 7 seções:

1. **Triagem:** dois `curl` (`healthz` e `readyz`) e uma tabela que manda para a seção certa.
2. **`readyz` 503:**
   - projeto pausado: restaurar, conferir migrações com `apply_migration.py --status` e reativar o cron que o GitHub desliga após 60 dias sem commit;
   - caso de mais de 90 dias pausado;
   - incidente geral do Supabase;
   - chave errada no Render.
3. **Render fora:** rollback de deploy, variável obrigatória faltando, horas grátis esgotadas.
4. **"Tudo verde, mas ninguém entra":** CORS, 401 em loop, anon key da Vercel, Redirect URLs, variável `VITE_` faltando.
5. **Rotação de chaves** (I-12):
   - onde cada segredo vive (Supabase, Render, Vercel, GitHub, local);
   - passos para os dois modos de assinatura que o `auth.py` aceita (HS256 legacy e JWKS);
   - o *Redeploy* obrigatório da Vercel;
   - aviso de que as chaves `sb_secret_` não servem com o supabase-py 2.8.1.
6. **Restore:** quando usar e o que muda depois; o passo a passo fica no DEPLOY.md (alteração 40).
7. **Depois do incidente.**

## Motivo técnico

- **O restore aponta para o DEPLOY.md** em vez de repetir os comandos: uma fonte só, para não divergir.
- **O texto de rotação saiu do código:**
  - o backend valida HS256 com `SUPABASE_JWT_SECRET` e ES256/RS256 via JWKS, recarregando o cache ao ver um `kid` novo (`backend/app/auth.py`);
  - o `config.py` exige as 4 variáveis do Supabase;
  - o `readyz` consulta `profiles` com a service role.
- **Recusa das chaves `sb_secret_`:** conferida no `supabase/_sync/client.py` instalado. A validação do formato como JWT recusa esse formato.

## Impactos positivos

- A próxima pausa do Supabase se resolve seguindo a seção 2.1, sem investigação.
- A rotação da `service_role` (I-12, pendente desde julho) passa a ter checklist: nenhum lugar esquecido, incluindo os secrets novos do backup.

## Testes executados

- Revisão dos comandos e caminhos citados contra o repositório:
  - endpoints em `main.py`;
  - flags do `apply_migration.py` (`--status`, `--all`);
  - variáveis em `config.py`, `render.yaml` e `backup.yml`;
  - âncoras do DEPLOY.md.

## Resultado dos testes

✅ **Passou**: comandos, variáveis e links conferidos. É documentação, sem código executável novo.

## Observações

- O I-12 (a rotação em si) continua **manual e pendente**. O runbook é o checklist para executá-lo.
- Os caminhos exatos de menu do Supabase, do Render e da Vercel mudam com o tempo. Se algum não bater, corrigir no próprio runbook (seção 7).
