# 00 — Resumo executivo

> Análise completa do Portal (Aplicação Professor) em **2026-09-03**. Cobre backend, frontend, banco, infra, CI/CD, documentação e produto. Relatórios detalhados em [01](01-backend.md), [02](02-frontend.md), [03](03-banco-infra-devops.md), [04](04-produto-lacunas.md); plano em [05](05-plano-de-execucao.md).

## Veredito em uma frase

O código está **acima da média para um projeto solo** (authz app-layer madura, testes de backend sólidos, UX do professor bem pensada, migrações exemplares), mas a **operação está frágil**: produção está fora do ar hoje por pausa do Supabase free, não há backup, não há monitor, e há uma quebra de fluxo central no cadastro de alunos pelo coordenador.

## Números

| Métrica | Valor |
|---|---|
| Endpoints / rotas de UI | 55 / 13 |
| Linhas (backend app / frontend src) | 5,5k / 10,9k |
| Testes backend | 162 ✅ (cobertura 61%) |
| Testes frontend | 7 (só lógica pura; zero de componente) |
| Lint / tsc / build | ✅ limpos (4 warnings) |
| Migrações | 12 arquivos (0001–0011, todas aplicadas em prod) |
| Advisories abertos (`pip-audit` / `npm audit`) | 22 / 8 |
| PRs Dependabot abertos | 10 (2 com CI vermelho) |
| Branches remotas já mescladas | 50 |
| Último commit humano | 2026-08-05 |
| Melhorias já entregues nas auditorias anteriores (mai/jul 2026) | 26 |

## Estado de produção (verificado ao vivo hoje)

| Serviço | Estado |
|---|---|
| Frontend (Vercel) | ✅ no ar |
| Backend (Render free) | ⚠️ no ar, cold start de 23 s |
| Supabase (banco + auth) | ❌ **pausado** — DNS do projeto não resolve; `readyz` devolve 503 |

**Efeito prático:** ninguém consegue fazer login. Já aconteceu em agosto. Sem cron de keep-alive ou plano pago, vai acontecer de novo a cada 7 dias sem uso.

## Top 10 achados (por impacto)

| # | ID | Achado | Sev. | Esf. |
|---|---|---|---|---|
| 1 | O-01 | Supabase pausado → produção fora do ar; sem monitor nem keep-alive | Crítico | P |
| 2 | I-24/25 | Sem nenhum backup do banco nem dos PDFs de atestados (free tier não tem) | Alto | M |
| 3 | P-01 | Coordenador cria aluno **sem matrícula**; não existe "matricular aluno existente" — aluno some de Notas/Chamada | Alto | P/M |
| 4 | B-01 | 22 advisories em `python-multipart`, `pyjwt`, `starlette` (upload e validação de **todo** token) | Alto | P |
| 5 | B-03 | Filtro de período no sync de planilha provavelmente inerte (alias + sem `!inner`) → grava notas de alunos de outro período | Alto | P |
| 6 | B-02 | Sync de planilha grava notas em período **fechado** (o PUT direto bloqueia) | Alto | P |
| 7 | F-01 | Chamada descarta o rascunho ao trocar de data, sem aviso | Alto | P |
| 8 | I-11 | `seed.py` com senha fraca default; dev e prod no mesmo Supabase | Alto | P |
| 9 | B-13/F-17 | 5 routers (24 rotas, incl. usuários e atestados) sem teste HTTP; zero teste de componente no frontend | Alto | G |
| 10 | I-15/16/23 | CI não testa migrações nem Docker; sem staging (0008–0011 estreadas em produção) | Alto | M |

Completo: 3 críticos/operacionais, 14 altos, ~30 médios, ~25 baixos. Todos com `arquivo:linha`, cenário e fix nos relatórios.

## O que está bem (preservar)

- **Segurança de app**: nenhuma rota item-level sem guard de escopo; IDORs de julho fechados; SSRF, formula-injection, upload de PDF e mass-assignment tratados e testados.
- **Banco**: `NUMERIC`, `TIMESTAMPTZ`, CHECKs, índices trigram, RPCs transacionais, `0011` como correção de causa-raiz, `apply_migration.py` com checksum.
- **Frontend**: auth resiliente, optimistic update com rollback por linha, auto-save sem double-commit, lazy + prefetch, dark mode por tokens, `strict` sem `any`.
- **Processo**: `docs/alteracoes/` com 26 mudanças documentadas no mesmo template; Dependabot em 3 ecossistemas; CI com lint, tsc, testes, build, auditorias.

## Decisões que só o dono do produto pode tomar

1. **`tutor_grade`** não entra na média final. Intencional?
2. **Faltas manuais vs chamada**: quando o trigger recalcula, qual fonte vence? Avisar ou bloquear edição manual?
3. **Atestado**: abona os dias automaticamente ou o professor revisa?
4. **`student_number` único global** vs aluno por período: aceitar que aluno de dois anos são dois registros?
5. **Portal do aluno/responsável**: vale o investimento G agora?
6. **Custo**: Supabase Pro (US$ 25) e/ou Render Starter (US$ 7) vs cron de keep-alive grátis.
7. **Auditoria** visível para coordenador/professor (backend já suporta)?

## Como usar esta pasta

1. Executar **Fase 0** do [plano](05-plano-de-execucao.md) hoje (restaurar produção, keep-alive, bumps de segurança).
2. Abrir uma branch por item, registrar em `docs/alteracoes/NN-*.md` (template existente), PR com testes.
3. Marcar os checkboxes do plano conforme avança; reavaliar prioridades a cada fase.
