# 71 — Redesenho escuro, fase 1: tema grafite, menu lateral, visão geral e entrada

## Problema identificado

O dono fez no Claude Design um redesenho do Portal ("Análise e melhora de layout", arquivo `Portal-Redesenho-Escuro.dc.html`) e pediu a implementação. O design troca a paleta, a navegação e a arquitetura de informação inteira, então foi fatiado: esta fase cobre a casca do app e as telas de entrada.

## Objetivo

Levar ao app o tema grafite, o menu lateral recolhido, a faixa de cabeçalho, a visão geral e as telas de login e cadastro do design, sem mudar a API nem o comportamento.

## Arquivos alterados

- `frontend/src/index.css`, `frontend/tailwind.config.ts`, `frontend/index.html`, `frontend/src/App.tsx`: tokens do `.dark` em grafite, `--rail`, Inter Tight + JetBrains Mono (sai a Source Serif 4), escuro como tema padrão
- `frontend/src/components/layout/{AppShell,Sidebar,Topbar}.tsx`: menu de 64px que expande para 218px no hover/foco, tema e usuário no rodapé do menu, gaveta no celular, Topbar só com a busca
- `frontend/src/components/shared/PageHeader.tsx`: faixa na largura toda com `eyebrow`
- `frontend/src/components/ui/{badge,button,card,input,table}.tsx`: ajustes de cor, foco e cabeçalho de tabela
- `frontend/src/features/dashboard/{DashboardPage,AtRiskCard}.tsx`: indicadores com tom, distribuição e aprovação em barras de CSS, "Precisa de atenção"
- `frontend/src/features/auth/{LoginPage,SignupPage,SignupPage.test,ForgotPasswordPage,ResetPasswordPage}.tsx`: login dividido, cadastro por convite no card do design
- `frontend/src/features/users/ProfilePage.tsx`, `frontend/src/lib/utils.ts`: `initials()` compartilhado
- `frontend/src/components/shared/CommandPalette.tsx`: rótulos iguais aos do menu
- `frontend/package.json`, `package-lock.json`, `vite.config.ts`: sai o `recharts`

## Alterações realizadas

- **Tema:** o `:root` (Aurora claro) fica; o `.dark` vira grafite (fundo `#131415`, card `#1C1D1F`, rail `#0B0C0D`). `defaultTheme="dark"`, com `enableSystem` mantido.
- **Menu:** expansão só com CSS (`hover:`/`focus-within:` e `group/rail`), sem estado de "recolhido"; ordem e rótulos do design (Visão geral, Notas e faltas, Chamada, Alunos, Módulos, Períodos, Importação, Usuários, Auditoria), com o mesmo filtro por papel e o prefetch.
- **Visão geral:** o Recharts saiu; a distribuição de notas é uma lista de barras (melhor faixa primeiro) e a aprovação por módulo é uma barra com %.
- **Cadastro:** a lógica do convite (registro 69) é a mesma; mudam textos e disposição.

## Motivo técnico

- **CSS no lugar do Recharts:** 4 barras horizontais e uma barra por linha não justificam uma lib de gráficos; o bundle perde o chunk dela.
- **Menu por CSS:** hover e foco de teclado expandem igual, sem estado nem efeito.
- **Fatiado:** a fase 2 (coluna de módulos com abas, período global na Topbar, demais telas, versão clara do design) mexe em rotas e fluxos, e fica para revisão separada.

## Impactos positivos

- Visual consistente com o design aprovado pelo dono nas telas mais usadas.
- Uma dependência a menos.

## Testes executados

- `npm run lint` (0 erros; 18 avisos já existentes), `tsc --noEmit`, `npm run build`, `vitest` (19 arquivos, 92 testes; 3 consultas do `SignupPage.test` atualizadas para os textos novos).
- App local contra Supabase local (nunca produção), conferido pelo DOM:
  - coordenação: 7 itens no menu, indicadores e tabela com a coluna de professor;
  - professor: faixas da melhor para a pior, "Precisa de atenção" com 8 linhas e "e mais 3.", "Seus módulos";
  - menu recolhido com 64px e expandido com 218px e rótulos visíveis;
  - tema claro: fundo Aurora e rail escuro;
  - celular (375px): menu de desktop escondido, gaveta com os links e o menu do usuário.

## Resultado dos testes

✅ **Passou**: tudo acima.

## Observações

- **Fase 2 pendente:** notas, chamada, alunos, módulos, períodos, usuários, importação, auditoria, esqueci/redefinir senha ainda usam o layout antigo dentro da casca nova.
- **Rollback:** reverter o commit; não há migração nem mudança de API.
