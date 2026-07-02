# 24 — Acessibilidade: skip-link, título do drawer e do command palette

## Problema identificado

Achados de a11y da auditoria original:
- **Drawer mobile sem título acessível** (AppShell): `SheetContent` renderizava um `<span>` visual, sem `SheetTitle`. O Radix Dialog exige um título — emite warning e leitores de tela não anunciam o propósito do diálogo.
- **CommandDialog sem título** (command.tsx): `DialogContent` sem `DialogTitle` — violação direta da exigência do Radix.
- **Sem skip-link** (WCAG 2.4.1): o alvo `#main-content` existia (`tabIndex={-1}`) mas nenhum link apontava para ele; usuários de teclado tabulavam por toda a sidebar/topbar em cada página.

## Objetivo

Fechar os warnings do Radix e as lacunas WCAG, sem alterar o visual.

## Arquivos alterados

- `frontend/src/components/ui/sheet.tsx` (novo `SheetDescription`)
- `frontend/src/components/ui/command.tsx` (título/descrição sr-only)
- `frontend/src/components/layout/AppShell.tsx` (SheetTitle no drawer + skip-link)

## Alterações realizadas

- **Drawer:** o cabeçalho virou `SheetTitle` (estilizado `text-sm` para manter o visual) + `SheetDescription` sr-only. Exportado `SheetDescription` no `sheet.tsx`.
- **CommandDialog:** `DialogTitle`/`DialogDescription` sr-only ("Paleta de comandos") dentro do `DialogContent`.
- **Skip-link:** `<a href="#main-content">` no topo do AppShell, `sr-only` que vira visível ao receber foco por teclado.

## Motivo técnico

Os títulos são `sr-only`/estilizados para satisfazer o Radix e leitores de tela sem mudar a aparência — o campo de busca continua sendo o foco visual do command palette, e o drawer mantém seu cabeçalho pequeno. O skip-link usa o padrão `sr-only focus:not-sr-only`, aparecendo só na navegação por teclado.

## Impactos positivos

- Fim dos warnings de acessibilidade do Radix no console.
- Leitores de tela anunciam o drawer e o command palette.
- WCAG 2.4.1 (bypass blocks) atendido.

## Testes executados

- `eslint` (0 erros), `tsc --noEmit` (limpo), `npm run build` (OK), `npm run test` (7).
- Sem teste de componente ainda; validação por lint/tsc/build + revisão do markup.

## Resultado dos testes

✅ **Passou** — lint/tsc/build/test limpos.

## Observações

- Restam itens de a11y no backlog (contraste `warning`, `aria-live` no SaveIndicator, `AlertDialog` no lugar de `window.confirm`) — não bloqueantes.
