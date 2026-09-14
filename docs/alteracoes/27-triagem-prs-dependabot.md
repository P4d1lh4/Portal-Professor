# 27 — Triagem dos PRs do Dependabot (O-03)

## Problema identificado

10 PRs do Dependabot acumulados desde 2026-08-05 (#49–#58), 4 com CI vermelho — e o fix de segurança do `python-multipart` (B-01) parado na fila. Achado O-03 da análise de 2026-09 (`docs/analise-2026-09/03-banco-infra-devops.md`).

## Objetivo

Zerar a fila: mesclar o que está verde, destravar ou fechar com motivo o que está vermelho e reduzir o ruído das próximas rodadas.

## Arquivos alterados

- `backend/requirements.txt` (remove `pytest-asyncio`)
- `.github/dependabot.yml` (`groups` + `ignore`)

## Alterações realizadas

| PR | Pacote | Decisão |
|---|---|---|
| #51 | python-multipart 0.0.18 → 0.0.32 | ✅ mesclado (parte de upload do B-01) |
| #49 | uvicorn 0.31 → 0.52.1 | ✅ mesclado |
| #53 | respx 0.21 → 0.23.1 | ✅ mesclado |
| #55 | eslint-plugin-react-hooks 5 → 7 | ✅ mesclado |
| #56 | next-themes 0.3 → 0.4.6 | ✅ mesclado |
| #57 | zustand 5.0.13 → 5.0.14 | ✅ mesclado |
| #54 | pytest-asyncio 0.24 → 1.4 | 🗑 dependência removida: nenhum teste é async (o único uso de asyncio é `asyncio.run` em `test_error_handler.py`). O Dependabot fecha o PR sozinho. |
| #50 | httpx 0.27 → 0.28 | ⛔ fechado: `supabase==2.8.1` exige `httpx<0.28`. Sem advisory no 0.27.2. `ignore httpx>=0.28` até o upgrade do supabase-py. |
| #58 | typescript 5.9 → 7.0 | ⛔ fechado: typescript-eslint 8.70 aceita só `typescript <6.1`. `ignore typescript>=7`. |
| #52 | vite 5 → 8 | ↪ PR próprio (`chore/vite-8`), junto com `@vitejs/plugin-react` e `vitest` compatíveis. |

`dependabot.yml`: `groups.minor-patch` em pip e npm (minor/patch num PR por rodada; majors seguem um por PR) + os dois `ignore` acima, cada um com o motivo em comentário.

## Motivo técnico

Remover `pytest-asyncio` é menor que subir o pytest só para satisfazer um plugin sem uso. Os `ignore` ficam versionados no `dependabot.yml` (e não via comando `@dependabot ignore`, invisível no repo), com o motivo ao lado: quem subir o supabase-py, ou quando o typescript-eslint suportar TS 7, sabe o que remover.

## Impactos positivos

- Fila de PRs zerada; fix de segurança do multipart em `main`.
- Próximas rodadas: ~1 PR de minor/patch por ecossistema por semana, em vez de até 10 PRs soltos.

## Testes executados

- CI de cada um dos 6 PRs mesclados e de `main` após os merges.
- Backend em venv limpo com o `requirements.txt` novo e **sem** `pytest-asyncio`: `pytest --cov=app --cov-fail-under=50`.

## Resultado dos testes

✅ **Passou** — CI verde; `162 passed, 2 skipped`, cobertura 60,99%.

## Observações

- B-01 continua aberto: faltam `PyJWT>=2.13` e `starlette>=0.49.1` (via fastapi) — ficam na Fase 0.
