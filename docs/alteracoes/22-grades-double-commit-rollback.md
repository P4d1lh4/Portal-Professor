# 22 — GradeCell: double-commit e rollback otimista concorrente

## Problema identificado

Dois bugs na tela de lançamento de notas (uso intensivo), achados/verificados na revisão adversarial pós-merge:

1. **Double-commit (GradeCell):** `onChange` agenda um commit por debounce de 300ms; `onBlur` limpa o timer e comita. Mas se o debounce **já disparou** (>300ms sem digitar) e o usuário sai do campo, `timerRef.current` aponta para um timeout já expirado, `clearTimeout` é no-op e `commitValue` roda **de novo** → **PUT duplicado** para a mesma nota (e **segunda entrada no audit_log**).
2. **Rollback otimista concorrente (useGrades):** ao editar duas células quase juntas, o `onError` da primeira restaurava o **snapshot inteiro** (`context.previous`) — apagando o update otimista da segunda célula, mesmo que o PUT dela fosse ter sucesso.

## Objetivo

Eliminar o PUT/audit duplicado e o rollback que sobrescreve edições concorrentes.

## Arquivos alterados

- `frontend/src/features/grades/GradesPage.tsx` (double-commit)
- `frontend/src/features/grades/useGrades.ts` (rollback)

## Alterações realizadas

- **Double-commit:** o `setTimeout` do debounce zera `timerRef.current = null` após comitar; o `onBlur` só comita **se houver timer pendente** (`if (timerRef.current) { clear; null; commit }`). Assim, blur após o debounce já ter comitado não dispara segundo PUT.
- **Rollback:** o `onError` restaura **apenas a linha que falhou** (por `enrollment_id`, a partir de `context.previous`), preservando as demais linhas — inclusive edições otimistas concorrentes.

## Motivo técnico

Ambos são correções mínimas e locais. Para o double-commit, o estado "já comitei" é representado pelo `timerRef` nulo — sem novo state/ref. Para o rollback, restaurar cirurgicamente a linha afetada é o comportamento correto de um cache com múltiplas mutações em voo (o `onSettled` já invalida e reconcilia; o fix elimina a janela em que a UI mostrava a outra célula revertida).

## Impactos positivos

- Metade dos PUTs na tela mais usada em cenários comuns; sem entradas de auditoria duplicadas.
- Edição de várias notas em paralelo não pisca/reverte indevidamente.

## Testes executados

- **Não há testes de componente ainda** (só vitest de lógica pura). Validado por: `npx eslint .` (0 erros), `npx tsc --noEmit` (limpo), `npm run build` (OK).
- Teste manual/raciocínio: cenários de debounce+blur e de duas células concorrentes revisados linha a linha.

## Resultado dos testes

✅ **Passou** — lint/tsc/build limpos.

## Observações

- Quando existir harness de componente (jsdom + Testing Library), adicionar testes que reproduzam o double-commit e o rollback concorrente. Severidade Baixa (self-heal via onSettled), mas na tela de maior uso.
