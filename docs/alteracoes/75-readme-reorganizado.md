# 75 — README reorganizado e sincronizado com o código

## Problema identificado

**[Pedido do dono]** O `README.md` tinha ficado para trás em relação ao código e era difícil de percorrer:

- A stack citava React 18, Recharts e pytest 8.3. O projeto usa React 19, o `recharts` saiu no registro 71 e o pytest é o 9.
- A tabela de stack dizia "cobertura mínima 50% no CI"; a seção de testes e o `ci.yml` dizem 70%.
- O passo de migrations mandava aplicar de 0001 a 0013, e a lista parava na 0013. A 0014 (convites) existe e é citada na seção de segurança do mesmo arquivo.
- `git clone <url>` e `cd Portal` não correspondiam ao repositório.
- O `/api/readyz` não aparecia nos endpoints.
- Não havia imagem da aplicação nem um resumo do que o projeto tem de particular; o leitor passava por estrutura de pastas e setup antes de saber o que o sistema faz.

## Objetivo

Deixar o README correto e fácil de ler: o que é o sistema primeiro, como rodar depois, referência por último.

## Arquivos alterados

- `README.md`
- `docs/img/login.png` (novo): captura da tela de login em produção
- `docs/alteracoes/75-readme-reorganizado.md` (novo) e `INDEX.md`

## Alterações realizadas

- **Topo:** título, descrição, selo do CI, link da aplicação no ar, selos da stack, menu de navegação e a captura do login.
- **Visão geral (nova):** diagrama da arquitetura (navegador → frontend → Supabase Auth e backend → Postgres e Storage) e cinco pontos que diferenciam o projeto, cada um com link para onde está documentado.
- **Ordem das seções:** funcionalidades por papel e stack sobem; estrutura do monorepo e scripts de manutenção vão para o fim.
- **Stack:** versões e bibliotecas corrigidas; entra a linha de infraestrutura (Vercel, Render, Docker, GitHub Actions).
- **Migrations:** intervalo corrigido para 0001 → 0014; a lista e o parágrafo de "Atenção" viram uma tabela recolhível com o que cada migration faz.
- **API:** `/api/readyz` entra na lista, que fica recolhível (a fonte é o Swagger).
- **Testes e CI:** tabela com os quatro jobs do CI.
- **Documentação (nova):** tabela com DEPLOY, CONTRIBUTING, ADR 0001 e o índice de alterações.

## Motivo técnico

- **A captura é só da tela de login.** É a única tela pública; as demais mostrariam dados de alunos.
- **Texto das seções de segurança, testes, seed e scripts foi mantido.** A mudança ali é de posição e formato, para o diff de conteúdo ficar restrito ao que estava errado.
- **Blocos recolhíveis (`<details>`)** na lista de migrations e de endpoints: são referência longa que interrompia a leitura do passo a passo.

## Impactos positivos

Quem chega ao repositório vê o que o sistema faz e como ele é por dentro antes do setup, e o passo de migrations não deixa mais a 0014 de fora.

## Testes executados

- Versões conferidas em `frontend/package.json` e `backend/requirements.txt`; cobertura e jobs conferidos em `.github/workflows/ci.yml`; migrations conferidas em `supabase/migrations/`.
- Links relativos do README conferidos contra os arquivos do repositório.
- CI do PR.

## Resultado dos testes

✅ **Passou** (só documentação; sem mudança de código).

## Observações

- A licença continua "Privado — uso interno da instituição", embora o repositório seja público. Fica para o dono decidir.
