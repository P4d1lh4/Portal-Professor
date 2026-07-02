# 25 — Diálogo de confirmação no lugar de window.confirm

## Problema identificado

Três ações destrutivas usavam `window.confirm` nativo: desativar aluno (`StudentsPage`), excluir chamada (`AttendancePage`) e remover atestado (`MedicalCertificatesSheet`). O `confirm()` nativo é bloqueante, não temável (popup do browser no meio de uma UI polida), inconsistente no mobile, ignora o tema claro/escuro e é difícil de testar/evoluir.

## Objetivo

Substituir os 3 usos por um diálogo de confirmação do design system, reutilizável, sem alterar o fluxo imperativo dos handlers.

## Arquivos alterados

- `frontend/src/components/shared/ConfirmDialog.tsx` (novo)
- `frontend/src/features/students/StudentsPage.tsx`
- `frontend/src/features/attendance/AttendancePage.tsx`
- `frontend/src/features/medical-certificates/MedicalCertificatesSheet.tsx`

## Alterações realizadas

- **`useConfirm()`** — hook promise-based: `confirm(options)` retorna `Promise<boolean>` e expõe `confirmDialog` (o JSX a renderizar uma vez). Suporta título, descrição, labels e variante `destructive`.
- Os 3 handlers viraram `async` e trocaram `if (!confirm(...)) return` por `if (!(await confirm({...}))) return`, com labels/descrições próprias e botão vermelho (destructive).
- Em `MedicalCertificatesSheet`, o `{confirmDialog}` é renderizado **fora** do `<Sheet>` (via fragmento) para evitar diálogos Radix aninhados.

## Motivo técnico

O padrão promise-based preserva o fluxo imperativo (`await confirm`) — cada call site é uma troca quase 1:1, sem gerenciar estado de `open` manualmente. **Sem adicionar `@radix-ui/react-alert-dialog`**: construído sobre o `Dialog` já instalado (ponytail — usar o que já existe). O foco inicial e o fechamento por Esc/overlay (= cancelar) vêm do Radix Dialog; a variante `destructive` dá o affordance visual do vermelho.

## Impactos positivos

- Confirmações consistentes com o design system (tema, mobile, tipografia).
- Não-bloqueante; testável no futuro (ao contrário do `window.confirm`).
- Fim do popup nativo do browser no meio da UI.

## Testes executados

- `grep` confirma **0** `window.confirm` reais (só a menção no docstring) e 3 call sites usando `{confirmDialog}`.
- `eslint` (0 erros), `tsc --noEmit` (limpo), `build` (OK), `vitest` (7).
- Sem teste de componente ainda; validação por lint/tsc/build + revisão.

## Resultado dos testes

✅ **Passou** — lint/tsc/build/test limpos.

## Observações

- Reaproveitável para futuras confirmações destrutivas.
- Quando houver harness de componente, testar o fluxo confirmar/cancelar do `useConfirm`.
