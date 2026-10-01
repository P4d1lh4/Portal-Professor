# 74 — Dashboard do professor respeita o período da barra superior

## Problema identificado

Desde o registro 72, o período é escolhido na barra superior (`useSelectedPeriod`), e a `DashboardPage` manda `period_id` para `GET /api/dashboard`. O ramo `professor` do `routers/dashboard.py` ignorava o parâmetro: buscava os módulos só com `.eq("professor_id", ...)` e não devolvia `period`. Um professor com módulos em dois períodos:

- via os dois somados nos indicadores, na distribuição de notas e em "Seus módulos";
- via em "Precisa de atenção" alunos de período encerrado;
- trocava o período na barra superior sem mudar nada;
- via "Professor(a)" no eyebrow do cabeçalho no lugar do nome do período.

O teste `test_professor_ve_so_os_proprios_modulos` (`test_authz.py`) afirmava esse comportamento ("period_id alheio é ignorado").

## Objetivo

Com `period_id`, o dashboard do professor mostra só os módulos dele naquele período e devolve o período, como o ramo de coordenador.

## Arquivos alterados

- `backend/app/routers/dashboard.py`: `_get_period` (404 se o período não existe) e filtro por `academic_period_id` no ramo do professor; `period` na resposta
- `backend/tests/test_dashboard_professor_period.py` (novo): dois períodos, período sem módulos do professor, período inexistente
- `backend/tests/test_authz.py`: o teste do professor chama sem `period_id` e continua checando o filtro por `professor_id`

## Alterações realizadas

- **Com `period_id`:** o período precisa existir (senão 404 "Período não encontrado."); os módulos são filtrados por `professor_id` e `academic_period_id`; matrículas, distribuição e "Precisa de atenção" vêm desses módulos. A resposta traz `period` (`id`, `name`, `is_active`).
- **Professor sem módulos no período:** a mesma resposta vazia de antes, com `period: null`.
- **Sem `period_id`:** igual a antes (todos os módulos do professor), com `period: null`.
- **Frontend:** sem mudança. O tipo já tinha `period?`, o eyebrow já lê `data?.period?.name`, e a `queryKey` já tem o `periodId`.

## Motivo técnico

- **Sem `period_id`, sem fallback no backend:** o `useSelectedPeriod` já escolhe o período (o da barra, senão o primeiro ativo, senão o primeiro da lista) e manda `period_id` sempre que o professor tem algum período. Sem `period_id` só chega professor sem módulos. Repetir a regra no backend criaria uma segunda cópia que pode divergir.
- **`period: null` quando ele não leciona no período:** `GET /periods/{id}` responde 404 ao professor sem módulo no período, de propósito. O dashboard não devolve o nome desse período por outro caminho.
- **404 para período inexistente:** validação pedida pelo dono; `period_id` errado não vira um dashboard vazio silencioso.

## Impactos positivos

- O professor vê os números do período escolhido, e trocar o período na barra superior atualiza a visão geral.
- "Precisa de atenção" deixa de listar alunos de período encerrado.
- O cabeçalho mostra o nome do período, como para coordenação e admin.

## Testes executados

- **Antes da correção:** os 3 testes novos falhavam (`KeyError: 'period'` e `assert 200 == 404`). Pedindo `p2`, o endpoint devolvia `{'modules': 2, 'students': 3, ...}`, com `ANA1` (de `p1`) em "Seus módulos" e a aluna dele em "Precisa de atenção".
- **Depois:** os 3 passam. O fake aplica os `.eq`/`.in_` da consulta nas linhas, então um filtro que falte aparece como módulo ou aluno a mais.
- **Mutações, 4 pegas:** tirar o filtro por `academic_period_id` (2 falham), devolver o período na resposta vazia, trocar o 404 por um período falso e tirar `period` da resposta (1 falha cada).
- **Suíte do backend**, num venv com o `requirements.txt` e as variáveis stub do CI (o Python global tem FastAPI 0.115, que falha no `test_me_sem_token_retorna_401` por ser anterior à 0.122): 407 passed, 2 skipped, cobertura 85%.

## Resultado dos testes

✅ **Passou**: tudo acima.

## Observações

- **Sem migração.** O deploy é o automático do Render, depois do CI (registro 70).
- **Rollback:** reverter o commit.
