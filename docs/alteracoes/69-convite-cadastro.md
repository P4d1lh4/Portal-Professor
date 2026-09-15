# 69 — Cadastro por código de convite

## Problema identificado

Só o admin criava contas, pela tela de Usuários. Cada professor ou coordenador novo dependia dele, que ainda escolhia a senha inicial e precisava repassá-la. O dono pediu um "Criar conta" na tela de login, liberado por um código aleatório de uso único que o admin (para coordenador ou professor) ou o coordenador (para professor) gera.

A análise do pedido achou uma brecha anterior a ele:
- o cadastro público do Supabase Auth estava ligado em produção (`/auth/v1/settings` devolvia `disable_signup: false`);
- o `handle_new_user` (0001) lia o papel de `raw_user_meta_data`, que quem se cadastra controla.

Com a anon key, que é pública, um `signUp({ options: { data: { role: "admin" } } })` criava um profile de admin. O login ainda exigia confirmar o e-mail. Conferimos as 4 contas do Auth: todas confirmadas, sem sinal de uso da brecha.

## Objetivo

- "Criar conta" na tela de login. Primeiro o código é conferido; depois a pessoa informa os próprios dados e a senha.
- O papel da conta vem do convite, nunca de quem se cadastra.
- O cadastro direto no Auth deixa de ser um caminho.

## Arquivos alterados

- `supabase/migrations/0014_invite_codes.sql` (nova): tabela `invite_codes` e `handle_new_user` sem papel do metadata
- `supabase/ci/checks.sql`: as fixtures ganham o papel por UPDATE; 3 checks da 0014
- `backend/app/schemas/users.py`: `AccountData` (limites do front), de que `UserCreate` herda; `InviteCreate`, `InviteCreated`, `InviteCode`, `InviteInfo` e `SignupRequest`
- `backend/app/routers/users.py`: `POST /api/invites`, `POST /api/signup/check` e `POST /api/signup`; `_assert_username_free` e `_create_account` saem do corpo do `create_user`
- `backend/tests/test_invites.py` (novo); `backend/tests/test_security.py` (username válido no `UserCreate`)
- `frontend/src/features/auth/SignupPage.tsx` e `.test.tsx` (novos); `LoginPage.tsx` ("Criar conta"); `routes/index.tsx` (`/signup`)
- `frontend/src/features/users/InviteDialog.tsx` e `.test.tsx` (novos); `schemas.ts` (novo, campos de conta); `UserDialog.tsx` usa esses campos; `api.ts` e `useUsers.ts`; `UsersPage.tsx` ("Gerar convite")
- `frontend/src/features/modules/ModuleDialog.tsx`: "Professor ainda sem conta? Gerar convite"
- `docs/adr/0001-autorizacao-na-aplicacao.md` (a exceção), `DEPLOY.md` (Passo 5), `README.md` e `CONTRIBUTING.md`

## Alterações realizadas

- **Banco (0014):**
  - `invite_codes` tem:
    - `code_hash` único (sha256);
    - `role` com CHECK (só coordenador ou professor);
    - `created_by`, `expires_at`, `used_at` e `used_by`;
    - RLS ligada, sem policy.
  - `handle_new_user` cria todo profile como professor. Username e nome continuam vindo do metadata.
- **Gerar convite (`POST /api/invites`, admin e coordenador):**
  - O código:
    - tem 12 caracteres sem 0/O nem 1/I/L (~59 bits);
    - aparece como `XXXX-XXXX-XXXX` e vale 7 dias;
    - volta só nessa resposta.
  - O admin convida coordenador ou professor. O coordenador convida só professor; o resto dá 403. Convite de admin não passa no schema (422).
  - A auditoria grava `insert` em `invites`, sem o código.
- **Conferir o código (`POST /api/signup/check`, público):** devolve o papel do convite sem consumi-lo.
- **Cadastrar (`POST /api/signup`, público), nesta ordem:**
  1. valida os dados com os limites do zod: usuário `^[a-zA-Z0-9._-]+$` com 2 a 50 caracteres, nome com 2 a 120 e senha com 8 a 72;
  2. se o username já existe, responde 409 antes de tocar no código;
  3. confere o convite: pendente, no prazo, e o autor segue ativo e com permissão para aquele papel;
  4. consome o convite com um UPDATE atômico (`used_at IS NULL`);
  5. cria a conta pela Admin API com o papel do convite, pelo mesmo `_create_account` do admin;
  6. se o Auth recusar (e-mail já cadastrado, falha), devolve o código;
  7. grava `used_by` e audita, com a conta nova como autora.

  A mensagem de recusa é a mesma para código inexistente, usado, vencido ou de autor sem permissão. As duas rotas públicas têm limite de 20 tentativas por minuto.
- **Login:** "Recebeu um código de convite?" e o botão "Criar conta".
- **`/signup`:** um passo para o código e outro para os dados (nome, usuário, e-mail, senha e confirmação). No fim, entra na conta e vai para o painel.
- **Gerar convite:**
  - botão na tela de Usuários, onde o admin escolhe o papel;
  - link "Professor ainda sem conta? Gerar convite" no diálogo de módulo, onde o coordenador escolhe o professor. Ele não tem acesso à tela de Usuários.

  O código aparece uma vez, com um botão de copiar.

## Motivo técnico

- **Consumir antes de criar a conta.** Auth e banco não têm transação comum. Consumindo primeiro, o pior caso é um código perdido (falha fechada). Na ordem inversa, uma corrida deixaria uma conta sem convite para apagar do Auth.
- **Validade e uso conferidos em Python, sobre a linha lida.** O filtro em SQL fica só no consumo. Assim não vai timestamp na query string, e o vencimento é testável no `FakeDb`, que não filtra.
- **Só o hash no banco.** Backup e SQL Editor não mostram códigos válidos. Em troca, o código não aparece de novo; quem perdeu gera outro.
- **Limite global, não por IP.** O uvicorn roda sem `--forwarded-allow-ips`: atrás do proxy do Render, o `client.host` é o do proxy, e o `X-Forwarded-For` pode ser forjado. Com ~59 bits, adivinhar já é inviável, e o limite só freia (`ponytail:` no código).
- **Trigger sem papel.** Mesmo com o signup público desligado, a 0014 fecha a escalada caso ele volte a ser ligado. Os dois caminhos que criam conta já gravavam o papel logo depois (`_create_account` e `seed.upsert_profile`).
- **Sem e-mail de confirmação.** A conta nasce confirmada, como no caminho do admin. O projeto não tem SMTP próprio (registro 62), e quem tem o código já foi autorizado.
- **`AccountData` também no caminho do admin.** O `UserCreate` não tinha limites no backend; agora bate com o zod. O `schemas.ts` do front junta os campos que o `UserDialog` repetia.
- **O `InviteDialog` recebe o próprio botão** (`DialogTrigger asChild`). Assim a tela de Usuários e o diálogo de módulo usam o mesmo componente sem estado extra.
- **O diálogo zera ao abrir, não ao fechar.** Zerando ao fechar, o código dava lugar ao formulário durante a animação de saída. A conferência no navegador achou isso.

## Impactos positivos

- Coordenadores e professores entram sem depender do admin, e cada um escolhe a própria senha.
- A escalada para admin pelo cadastro público fica fechada no banco (0014). Com o Passo 5 do DEPLOY, fecha também na origem.

## Testes executados

- **`test_invites.py` (33 casos):**
  - quem gera o quê;
  - só o hash no banco e na auditoria;
  - o check normaliza o código e não consome;
  - código inexistente, usado, vencido, de autor desativado, de autor rebaixado e de papel acima do autor, nas duas rotas;
  - o papel vem do convite, mesmo com `role` no corpo;
  - o consumo filtra `used_at IS NULL`;
  - corrida;
  - username em uso;
  - falha no Auth devolve o código;
  - dados inválidos;
  - limite de tentativas.
- **`SignupPage.test.tsx` (4 casos) e `InviteDialog.test.tsx` (2 casos).**
- **`checks.sql`, em postgres:17 via Docker:**
  - cadastro com `{"role":"admin"}` no metadata vira professor;
  - convite de admin é recusado;
  - a anon key não lê `invite_codes`.
- **PostgREST real** (Docker, com as migrações e os checks), pelo `TestClient` com o router de verdade. O Auth é falso só na criação: insere em `auth.users`, com papel admin no metadata. Resultado:
  - o código não fica no banco;
  - o check não consome;
  - a conta sai professor, o convite é consumido e a auditoria é gravada;
  - o segundo uso é recusado;
  - o UPDATE atômico não pega linha já usada;
  - o convite vencido é recusado;
  - e-mail repetido dá 409 e devolve o código;
  - coordenador não gera convite de coordenador.
- **Suíte do backend** num venv com o `requirements.txt` (supabase 2.31, FastAPI 0.141). **Frontend:** eslint, tsc, vitest e build.
- **No navegador**, com o Vite e uma API falsa. O Supabase do front também apontou para ela, então nada tocou a produção. A conferência foi pela árvore de acessibilidade, pelo texto da página e pelo DOM. O painel estava escondido: não houve print, e o layout no celular não foi conferido.
  - O login mostra "Recebeu um código de convite?" e "Criar conta" (`/signup`).
  - No `/signup`, o código leva ao passo dos dados ("Convite para Professor(a)"). Quando o login automático falha, o cadastro volta ao login com "Conta criada…".
  - O convite aberto pelo diálogo de módulo fica por cima dele sem enviar o formulário do módulo, e o Esc fecha só o de cima.
  - O coordenador vê "Convite para Professor(a)." sem seletor; o admin vê o seletor de papel.
  - O diálogo que fecha mantém o código até sumir. O defeito foi achado e corrigido aqui (ver Motivo técnico).
- **Prova de mutação:** aplicada, rodada e restaurada, com hash conferido depois.

| Mutação | Testes que falharam |
|---|---|
| **M-B1:** coordenador convida coordenador | 3 |
| **M-B2:** consumo sem `is_("used_at", "null")` | 1 |
| **M-B3:** papel fixo em vez do convite | 1 |
| **M-B4:** falha no Auth não devolve o código | 2 |
| **M-B5:** sem checar o vencimento | 2 |
| **M-B6:** sem checar se já foi usado | 2 |
| **M-B7:** autor desativado ainda convida | 2 |
| **M-B8:** código gravado em claro | 3 |
| **M-B9:** username checado só depois do código | 1 |
| **M-B10:** check sem limite de tentativas | 1 |
| **M-B11:** professor gera convite | 1 |
| **M-B12:** código sem normalizar | 1 |
| **M-D1:** trigger volta a ler o papel do metadata | check da 0014 |
| **M-D2:** sem o CHECK de papel | check da 0014 |
| **M-D3:** sem RLS em `invite_codes` | check da 0014 |
| **M-F1:** senha sem confirmação | 1 |
| **M-F2:** cadastro recusado ainda entra na conta | 1 |
| **M-F3:** corpo do cadastro com papel | 1 |
| **M-F4:** coordenador escolhe convidar coordenador | 1 |
| **M-F5:** código reaparece ao reabrir o diálogo | 1 |

## Resultado dos testes

✅ **Passou**:
- **Backend:** 404 passaram e 2 foram pulados, com 84,9% de cobertura. No venv com o FastAPI do `requirements.txt`, o `test_me_sem_token_retorna_401` também passa.
- **vitest:** 92 de 92. **tsc e eslint:** sem erro; a warning nova de `react-refresh` é a do `lazy` da `SignupPage`, igual às das outras rotas.
- **build:** a `SignupPage` sai num chunk lazy de 6 kB.
- **`checks.sql`:** os 3 checks da 0014 ok, com todos os anteriores.
- **PostgREST:** 8 de 8.
- **Navegador:** o fluxo inteiro ok, já com a correção do diálogo. Sem print, porque o painel estava escondido.
- **Mutação:** 20 de 20 pegas; as 5 do front rodaram de novo depois da correção.

## Observações

- **O dono testou localmente** e aprovou o fluxo, com um Supabase local no Docker e sem tocar a produção.
- **Para valer em produção:**
  1. ✅ **Signup público desligado pelo dono em 2026-09-15** (Passo 5 do DEPLOY), depois da 0014 e do deploy. Conferido: `/auth/v1/settings` dá `disable_signup: true`, e um `signUp` direto com a anon key recebe 422 `signup_disabled`. O `/api/signup` do convite não depende disso, porque cria a conta pela Admin API; o teste local do dono já rodou com o signup desligado.
  2. ✅ **A 0014 foi aplicada em 2026-09-15, às 18:16 UTC**, com o aval do dono e sem staging (I-23). Antes, o backup do `public` (`pg_dump -Fc`: 12 tabelas com dados, 77 KB, fora do repositório). A conferência:
     - a `invite_codes` tem RLS, nenhuma policy e o CHECK de papel;
     - o `handle_new_user` não lê o papel do metadata, e mantém `search_path` e `SECURITY DEFINER`;
     - nenhuma tabela de `public` ficou sem RLS;
     - a anon key recebe `[]` de `invite_codes`;
     - o `--status` mostra a 0014 OK, e o `readyz` do Render dá 200.
  3. ✅ **Deploy do backend no Render:** feito à mão pelo dono em 2026-09-15; o `/api/signup` responde em produção. Daqui em diante o deploy é automático (alteração 70).
- **Ficou de fora (YAGNI):**
  - listar e revogar convites pendentes: a validade de 7 dias e o audit log cobrem; entra se um código vazar;
  - amarrar o convite a um e-mail: entra se código repassado virar problema;
  - limite por IP: depende de configurar o proxy confiável.
- **A conta nasce vazia.** O professor aparece no seletor de professor dos módulos. O coordenador ainda depende do admin para ser posto num período.
- **O seletor de professores fica 3 minutos em cache** (`staleTime` padrão). Um professor que acabou de se cadastrar pode levar esse tempo para aparecer no diálogo de módulo.
