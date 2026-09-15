# 70 — Auto-Deploy do Render: depois do CI verde, só com mudança no backend

## Problema identificado

- **Deploy à mão (I-17):** o serviço do Render foi criado pelo "New → Web Service", não pelo Blueprint: a URL é `portal-professor.onrender.com`, e o `render.yaml` o chamaria de `portal-backend`. O `autoDeploy: true` do arquivo não valia, e o painel estava com o Auto-Deploy desligado. Cada merge na `main` só chegava ao backend quando o dono clicava em *Manual Deploy*. A Vercel publicava o front sozinha, então as telas novas davam 404 "Not Found" até esse clique (as rotas da Fase 3 em diante; o `/signup` da 69).
- **Docs erradas (I-29):** o DEPLOY.md e o runbook diziam que todo push na `main` redeploia.

## Objetivo

Publicar sozinho o último commit da `main`, sem plano pago, e só quando o CI passa.

## Arquivos alterados

- `render.yaml`: `autoDeployTrigger: checksPass` e `buildFilter` com `backend/**` no lugar do `autoDeploy: true`, que é campo obsoleto; comentário dizendo que quem manda é o painel
- `DEPLOY.md`: passo 8 do Passo 1; seção *Atualizações futuras* reescrita
- `docs/runbook.md`: merge que não chegou ao backend; minutos de build esgotados
- `docs/analise-2026-09/05-plano-de-execucao.md`: I-17 marcado
- `docs/alteracoes/INDEX.md`: linha 70, status da 69 e a pendência do M13
- `docs/alteracoes/69-convite-cadastro.md`: deploy feito

## Alterações realizadas

- **Painel do Render, pelo dono (2026-09-15):**
  - **Auto-Deploy:** `After CI Checks Pass`;
  - **Build Filters:** *Included Path* `backend/**`.
- **Repositório:** o `render.yaml` passa a repetir o painel, para quem recriar o serviço pelo Blueprint. O resto é documentação.

## Motivo técnico

- **Sem custo:** Auto-Deploy e Build Filters não dependem de plano. O Starter, pago, só evita que o serviço durma (O-02).
- **After CI Checks Pass, e não On Commit:**
  - o Render só faz o deploy quando todos os checks do commit terminam em `success`, `neutral` ou `skipped`;
  - com um check vermelho, ou com nenhum, não faz;
  - o `ci.yml` roda os 4 jobs em todo push na `main`, sem filtro de caminho, então todo merge tem checks.

  É o "CD acoplado ao CI" que o M13 deixou pendente (alteração 15), sem deploy hook nem job novo.
- **Build Filter `backend/**`:** a imagem sai só de `backend/` (`dockerContext`). O workspace grátis tem 500 minutos de build por mês. Quando acabam, sem cartão cadastrado o Render para de fazer build até o mês virar; com cartão, compra mais sozinho, até o limite de gasto. O filtro poupa o build de merge só de front ou de docs.
- **Sem deploy hook:** o auto-deploy exige o repositório conectado pela integração do GitHub, e o Render já clona assim (o repositório é privado). Um job com deploy hook faria o mesmo com um segredo a mais.

## Impactos positivos

- Merge que mexe em `backend/`, com CI verde, chega à produção sozinho. O front e o back ficam desencontrados só pelos minutos do CI e do build, e não mais até alguém lembrar do clique.
- Commit com teste quebrado não sobe.
- Merge só de front ou de docs não gasta minuto de build.

## Testes executados

- **Documentação do Render:** as opções de Auto-Deploy e a regra do *After CI Checks Pass* ([deploys](https://render.com/docs/deploys)), Build Filters ([monorepo](https://render.com/docs/monorepo-support)) e minutos de build ([build pipeline](https://render.com/docs/build-pipeline)).
- **`render.yaml`:** validado contra o schema oficial do Blueprint (`https://render.com/schema/render.yaml.json`), que traz `autoDeployTrigger` (`off`, `commit`, `checksPass`) e `buildFilter.paths`. As duas mutações (gatilho `onCommit`; `paths` como texto, não lista) são recusadas.
- **Checks na `main`:** o merge do #121 (`55857d9`) tem os 4 check runs do CI, todos `success`.
- **Produção:** `GET /api/signup` dá 405 (a rota existe e só aceita POST): o deploy manual do #121 entrou.

## Resultado dos testes

✅ **Passou**: tudo acima.

⏳ **Falta ver funcionando.** O painel do Render não é visível daqui, e a prova vem nos próximos merges:
- o deste registro só mexe em docs e no `render.yaml`, então não deve gerar deploy (confere o filtro);
- o próximo que mexer em `backend/` deve aparecer sozinho em *Events* depois do CI, e a mudança aparece no `GET /api/openapi.json`.

## Observações

- **Rollback:** Settings → Auto-Deploy → `Off` volta ao deploy manual, que continua em *Manual Deploy → Deploy latest commit*.
- **Branch protection** em `main` segue opcional: o Render já não sobe commit vermelho, mas o merge com CI vermelho ainda é possível.
- **Pendente da 69, resolvido no mesmo dia:** o dono desligou o cadastro público do Supabase Auth (`disable_signup: true`).
