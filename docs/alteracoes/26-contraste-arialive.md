# 26 — Contraste do warning e aria-live no indicador de salvamento

## Problema identificado

- **Contraste `warning`:** `text-warning` (laranja a 57% de luminância) sobre fundos claros (`bg-warning/15`, ex.: badge "Recuperação", avisos) ficava abaixo de 4.5:1 — reprova WCAG AA (1.4.3).
- **SaveIndicator sem anúncio:** o indicador "salvando…/salvo" na tela de notas (`GradesPage`) era só visual; leitores de tela não anunciavam o resultado do salvamento.

## Objetivo

Atingir contraste AA no texto de warning e anunciar o status de salvamento a leitores de tela — sem redesenho.

## Arquivos alterados

- `frontend/src/index.css` (token `--warning`)
- `frontend/src/features/grades/GradesPage.tsx` (SaveIndicator)

## Alterações realizadas

- **`--warning`** (tema claro): `19 56% 57%` → `20 85% 38%`. Escurece o laranja para dar contraste AA em `text-warning` sobre fundos claros. Corrige **todos** os usos de `text-warning` de uma vez, sem tocar em `--warning-foreground`.
- **SaveIndicator:** virou uma região `role="status" aria-live="polite"` **estável** (mesma largura via `min-w-16`), com o conteúdo mudando dentro — o leitor de tela anuncia "salvando…" e depois "salvo".

## Motivo técnico

Escurecer o token único (uma linha) é mais simples e completo que criar um `--warning-strong` só para texto: os usos **sólidos** de `bg-warning` (barras de progresso, botão ativo de chamada `bg-warning text-white`) apenas ficam um pouco mais escuros — o que **melhora** o contraste ali, sem quebrar nada. O tema escuro não foi alterado (laranja claro sobre fundo escuro já tem contraste). Para o aria-live, manter **um** elemento estável (em vez de trocar entre spans diferentes) garante que a mudança de conteúdo seja anunciada de forma confiável.

## Impactos positivos

- `text-warning` legível (AA) no tema claro em badges e avisos.
- Resultado do salvamento de notas passa a ser percebido por quem usa leitor de tela.

## Testes executados

- `eslint` (0 erros), `tsc --noEmit` (limpo), `build` (OK, `min-w-16` gerado), `vitest` (7).
- Contraste estimado do novo `--warning` sobre fundo claro: ~5:1 (passa AA 4.5:1).

## Resultado dos testes

✅ **Passou** — lint/tsc/build/test limpos.

## Observações

- Restam itens de a11y menores no backlog, mas os de maior visibilidade (títulos de diálogo, skip-link, contraste, aria-live, confirmações) estão fechados.
