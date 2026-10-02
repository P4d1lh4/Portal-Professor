# 72 — Redesenho escuro, fase 2: período global, coluna de módulos e demais telas

## Problema identificado

A fase 1 (registro 71) trocou a casca do app, a visão geral e as telas de entrada. As outras telas continuavam no layout antigo, cada uma com o seu seletor de período e de módulo. O design (`Portal-Redesenho-Escuro.dc.html`) põe o período na barra superior e os módulos numa coluna com abas.

## Objetivo

Levar ao app a arquitetura de navegação do design e o visual das telas restantes, sem mudar a API.

## Arquivos alterados

- **Peças novas:**
  - `features/periods/useSelectedPeriod.ts`: período da barra superior;
  - `features/modules/ModuleWorkspace.tsx` e `usePeriodModules.ts`: coluna de módulos, abas Notas/Chamada e módulo ativo pela URL;
  - `components/shared/FilterChips.tsx` e `InitialsAvatar.tsx`.
- **Casca:** `components/layout/Topbar.tsx` (seletor de período com "N módulos · encerra DD/MM"), `components/shared/PageHeader.tsx` (prop `tabs`).
- **Telas:**
  - `features/grades/{GradesPage,situation,RiskBadge}.tsx`;
  - `features/attendance/AttendancePage.tsx`;
  - `features/students/{StudentsPage,StudentDetailSheet}.tsx`;
  - `features/modules/ModulesPage.tsx`;
  - `features/periods/PeriodsPage.tsx`;
  - `features/users/UsersPage.tsx`;
  - `features/audit/AuditLogPage.tsx`;
  - `features/import/ImportPage.tsx`;
  - `features/auth/{ForgotPasswordPage,ResetPasswordPage}.tsx`;
  - `features/dashboard/DashboardPage.tsx`.
- `features/modules/useModules.ts`: parâmetro `enabled`.
- **Menu lateral:** `index.css`, `tailwind.config.ts`, `components/layout/{Sidebar,AppShell}.tsx`, `features/auth/LoginPage.tsx`.
- **Testes:** `GradesPage.test.tsx` (filtro em chips), `AttendancePage.test.tsx` (botão do módulo na coluna). Os dois mocam `periodsApi`.

## Alterações realizadas

- **Período global:**
  - vale para visão geral, notas, chamada, alunos (coordenação e admin), módulos e importação;
  - o padrão é o primeiro período ativo;
  - a escolha fica só em memória.
- **Notas e chamada:**
  - coluna de módulos à esquerda a partir de `lg`; abaixo disso, um seletor;
  - cabeçalho com "CÓDIGO · PROFESSOR", o nome do módulo e as abas Notas/Chamada com contagem;
  - o módulo ativo vem de `?module=`, e um módulo de outro período cai no primeiro da lista.
- **Notas:**
  - filtro de situação em chips com contagem;
  - linha com iniciais, campos de 74px e faltas com barra e "x/máx.";
  - situação e final coloridas;
  - barra fixa no pé com "Salvo automaticamente", contagem e "Importar CSV".
- **Chamada:**
  - data com dia anterior e seguinte;
  - aviso "Rascunho não salvo";
  - contagem de presentes, faltas e justificadas;
  - P/F/J de 52×44;
  - faltas acumuladas por aluno, lidas do cache de notas;
  - "Últimas chamadas" em card;
  - barra fixa com observações e "Salvar chamada".
- **Alunos:** lista com iniciais, chips "Ativos"/"Todos" para coordenação e admin, e ficha lateral no novo formato (contato, módulos, atestados e barra de ações).
- **Módulos:** tabela do design com "Notas" levando a `/grades?module=`.
- **Períodos:** cards com situação, coordenação e datas.
- **Usuários:** busca e chips de papel e situação, pessoa com "(você)", papel e situação com ponto colorido.
- **Auditoria:** chips por entidade, linhas que expandem com a tabela campo/antes/depois.
- **Importação:** dois cards, "Arquivo" (área de arrastar e colunas) e "Prévia" (válidas, com erro e "Importar N alunos"). Precisa de período ativo na barra.
- **Esqueci e redefinir senha:** no card do cadastro.
- **Legibilidade:** o `RiskBadge` usava `text-warning-foreground`, quase preto no tema escuro, e passou para `text-warning`.
- **Menu lateral no tema claro (pedido do dono):** bege (`--rail` #DBCFBD) com texto em tinta. As cores do menu viraram tokens (`--rail-foreground`, `--rail-muted`, `--rail-subtle`); no escuro eles repetem o branco, /60 e /45 de antes, então o escuro não muda. O painel da marca no login usa os mesmos tokens.
- **Menu que não recolhia:** ele expandia também com `focus-within`, e o link clicado guardava o foco, então o menu seguia aberto depois de navegar e tirar o mouse. Agora só o hover expande e o menu some quando o mouse sai (pedido do dono). No teclado, os itens seguem focáveis com o nome acessível; só o rótulo visível não aparece.

## Motivo técnico

- **Período num store zustand:** a lib já está no projeto (`useAuth`), e uma barra só evita cinco seletores dessincronizados.
- **Módulo na URL, sem estado local:** as abas Notas/Chamada compartilham `?module=`, e trocar o período não deixa um módulo órfão selecionado.
- **Tabelas mantidas como `<table>`:** leitores de tela e os testes seguem lendo linhas. O cartão do celular continua só com CSS (`cardTable`).

## Fora do design, de propósito

- **Sem dado na API:**
  - "pendentes" e a barra de progresso na coluna de módulos;
  - números por período (alunos, módulos, aprovação);
  - chips "Inativos" e "Em risco de faltas" em alunos;
  - "Sem lançamento" em notas;
  - colunas de módulos e faltas na lista de alunos da coordenação.
- **Sem função no app:** "Concluir módulo", "Baixar modelo CSV", "Exportar registro" da auditoria e as abas Resumo/Módulos/Professores/Relatórios da visão geral.
- **Mantido do app, apesar do design:**
  - "Todos faltas" e a busca na chamada;
  - todos os 10 filtros de entidade da auditoria.
- **Perda aceita:** usuários perdem o filtro combinado de papel com inativos e o filtro só de administradores, pela escolha única dos chips.

## Impactos positivos

- Uma escolha de período vale para o app inteiro, e notas e chamada do mesmo módulo ficam a um clique.
- Visual consistente com o design em todas as telas.

## Testes executados

- `npm run lint` (0 erros, 18 avisos já existentes), `tsc --noEmit`, `npm run build`, `vitest` (19 arquivos, 92 testes).
- App local contra Supabase local (nunca produção):
  - coordenação: visão geral, notas, chamada, alunos, módulos, períodos e importação;
  - admin: usuários e auditoria;
  - professor: notas com edição salva (`PUT /api/grades` 200) e chamada;
  - celular (375px): notas e chamada sem rolagem horizontal;
  - tema claro na chamada.

## Resultado dos testes

✅ **Passou**: tudo acima.

## Observações

- **Rollback:** reverter o commit. Não há migração nem mudança de API.
- **Pendente do design:** versão clara própria (`Portal-Redesenho.dc.html`). O tema claro atual continua sendo o Aurora com os tokens novos.
