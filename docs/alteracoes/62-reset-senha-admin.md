# 62 — Admin redefine a senha de outro usuário (B-S5)

## Problema identificado

**B-S5 (Médio)**, análise 2026-09 (`01-backend.md`): o admin não tinha como redefinir a senha de alguém. O diálogo de edição de usuário dizia "Para resetar a senha, use o painel do Supabase."
- **O "Esqueci minha senha"** (`ForgotPasswordPage`) depende de o usuário ter acesso à caixa de e-mail e do envio do Supabase Auth, que no SMTP padrão tem limite baixo por hora. O projeto não tem e-mail transacional próprio (P-N5).
- **Fora desse caminho,** um professor sem acesso ficava esperando alguém entrar no painel do Supabase.

## Objetivo

Admin define uma senha nova para outro usuário na tela de Usuários, com auditoria e sem abrir um atalho para trocar a própria senha sem a atual.

## Arquivos alterados

- `backend/app/schemas/users.py`: `PasswordReset` (8 a 72 caracteres)
- `backend/app/routers/users.py`: `POST /api/users/{user_id}/reset-password`
- `backend/tests/test_users_authz.py`: rota nova no `ADMIN_ONLY`; 6 testes novos
- `backend/tests/test_audit_coverage.py`: 1 teste novo
- `frontend/src/features/users/api.ts` e `useUsers.ts`: `resetPassword` e `useResetUserPassword`
- `frontend/src/features/users/UserDialog.tsx`: campo "Nova senha" na edição; prop `canResetPassword`
- `frontend/src/features/users/UsersPage.tsx`: salva os dados e, se houver senha, redefine
- `frontend/src/features/users/UsersPage.test.tsx`: suíte nova
- `docs/analise-2026-09/05-plano-de-execucao.md`: checkbox

## Alterações realizadas

- **Endpoint** `POST /api/users/{user_id}/reset-password`, com `require_role("admin")` e em `def`:
  - a própria conta recebe 400 ("use Alterar senha no seu perfil");
  - usuário inexistente recebe 404, antes de chamar o Auth;
  - `auth.admin.update_user_by_id(user_id, {"password": ...})`, como já faz o `/me/change-password`;
  - falha no Auth: o detalhe vai para o log e a resposta é 400 com mensagem genérica;
  - `audit_log`: `update` em `users`, "Senha redefinida: <nome>", sem `before`/`after`.
- **Schema:** `new_password` com 8 a 72 caracteres. 72 é o limite do bcrypt no Supabase Auth, e o front já usava esse valor.
- **Front:**
  - o diálogo de edição ganha "Nova senha" (em branco mantém a atual), com o mesmo mostrar/ocultar da "Senha inicial";
  - o campo some quando o admin edita a si mesmo (`canResetPassword`), e o aviso do painel do Supabase sai;
  - ao salvar, a tela faz o `PUT` dos dados e, se houver senha, o `POST` da redefinição. Se a redefinição falhar, o diálogo fica aberto e aparece o toast de erro.

## Motivo técnico

- **Campo no diálogo de edição, em vez de botão e diálogo novos.** O admin já abre esse diálogo para cuidar do usuário, e era ali que estava o aviso do painel do Supabase. Um botão por linha pediria mais um estado na tela, duas marcações (tabela e cards) e outro diálogo.
- **O admin digita a senha,** como na criação do usuário. Gerar a senha no backend exigiria mostrá-la uma vez na tela, sem ganho para quem administra sozinho.
- **A própria conta fica de fora.** O `/me/change-password` pede a senha atual para que uma sessão roubada não troque a senha. Se esta rota aceitasse a própria conta, a sessão roubada de um admin pularia essa checagem.
- **Dois pedidos em sequência, sem transação.** Se o `PUT` passar e a redefinição falhar, o admin tenta de novo com o diálogo ainda aberto; repetir o `PUT` não muda nada.
- **Sem rate limit.** A rota é só de admin e não confere senha, então não serve para força bruta.

## Impactos positivos

- O admin resolve "perdi a senha" sem o painel do Supabase e sem depender do e-mail.
- A redefinição fica no log de auditoria, sem a senha.

## Testes executados

- **pytest (9 novos):**
  - coordenador e professor recebem 403, sem escrita nem chamada ao Auth (`ADMIN_ONLY`);
  - admin redefine: `update_user_by_id("u2", {"password": ...})`;
  - própria conta: 400, sem chamada ao Auth;
  - usuário inexistente: 404;
  - senha com 7 e com 73 caracteres: 422;
  - falha no Auth: 400 sem o detalhe e sem auditoria;
  - auditoria: uma entrada `update` em `users`, sem a senha em nenhum campo.
- **vitest (`UsersPage.test.tsx`, 4 novos):**
  - com senha, faz o `PUT` e a redefinição;
  - em branco, só o `PUT`;
  - senha curta mostra o erro e não envia nada;
  - editando a si mesmo, o campo não aparece.
- **Suítes:** backend inteira; frontend com lint, typecheck, vitest e build.
- **Provas de mutação:** cada uma alterada no código, rodada e restaurada, com hash conferido depois.

| Mutação | Testes que falharam |
|---|---|
| **B1:** admin redefine a própria senha | 1 |
| **B2:** qualquer papel redefine (`get_current_user`) | 2 |
| **B3:** detalhe da exceção do Auth na resposta | 1 |
| **B4:** senha no `after` da auditoria | 1 |
| **B5:** sem auditoria | 1 |
| **B6:** schema sem limites de tamanho | 2 |
| **F1:** redefine mesmo com o campo em branco | 1 |
| **F2:** salva sem redefinir | 1 |
| **F3:** campo aparece para a própria conta | 1 |
| **F4:** senha curta aceita | 1 |

B3 e B5 precisaram de uma segunda rodada. Na primeira, a B3 quebrou a sintaxe do arquivo e não provava nada. O padrão da B5 não casou, porque o PowerShell 5.1 lê `.ps1` sem BOM como ANSI e o "não" do padrão virou outro texto.

## Resultado dos testes

✅ **Passou**:
- **Backend:** 337 passaram e 2 skip. Única falha: `test_me_sem_token_retorna_401`, por ambiente (FastAPI 0.115 local; o CI usa 0.141.1).
- **Frontend:** vitest 81/81 (16 arquivos); lint sem erros (os 17 avisos já existiam); typecheck e build ok.
- **Mutações:** as 10 foram mortas.

## Observações

- **As sessões abertas continuam valendo.** A Admin API troca a senha, mas não encerra as sessões do usuário. Se o motivo for conta comprometida, o admin também deve desativar o usuário; o backend recusa a conta desativada na hora (o cache de perfil é invalidado). Encerrar as sessões pela Admin API merece item próprio se o caso aparecer.
- **Não conferido no navegador.** O campo repete a marcação da "Senha inicial" do mesmo diálogo, e o vitest cobre o comportamento.
