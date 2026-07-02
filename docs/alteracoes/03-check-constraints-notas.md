# 03 — CHECK constraints de nota e faltas no banco

## Problema identificado

As colunas de nota (`tutor_grade`, `regular_exam_grade`, `makeup_exam_grade`, `final_grade`) são `NUMERIC(4,2)` (aceita até 99.99) e `absences`/`credits`/`max_absences` são inteiros — **todas sem CHECK constraint**. A validação de faixa (0–10, não-negativo) vive só na aplicação (Pydantic + clamp inline em `sheets.py`). Qualquer caminho que burle o validador (SQL manual, correção direta, futura RPC) pode gravar valores fora de faixa, corrompendo médias e relatórios silenciosamente.

## Objetivo

Garantir a integridade das faixas no próprio banco (defesa em profundidade), tornando o Postgres a última linha de defesa consistente entre todos os caminhos de escrita.

## Arquivos alterados

- `supabase/migrations/0008_grade_check_constraints.sql` (novo)

## Alterações realizadas

- `grades`: CHECK `BETWEEN 0 AND 10` nas 4 notas; CHECK `absences >= 0`.
- `modules`: CHECK `credits > 0` e `max_absences >= 0`.
- Padrão idempotente (`DROP CONSTRAINT IF EXISTS` antes de cada `ADD`) e bloco de rollback comentado.

## Motivo técnico

CHECK constraints são a forma declarativa e de custo zero de proteger integridade — mais barata e confiável que replicar validação em cada caminho de escrita. Nomes de constraint explícitos e `DROP IF EXISTS` deixam a migration reaplicável. O rollback comentado antecipa a lacuna de reversibilidade das migrations (ainda a resolver de forma geral).

## Impactos positivos

- Impossível gravar nota fora de 0–10 ou falta negativa por **qualquer** caminho.
- Protege relatórios/boletins de dados corrompidos.
- Documenta as invariantes de domínio no schema.

## Testes executados

- **Build/Lint/Unit:** N/A (migration SQL).
- **Validação de sintaxe/schema:** expressões conferidas contra as colunas reais definidas em `0001_initial_schema.sql:73-74,101-105`. Nomes de tabela/coluna corretos.
- **Aplicação no banco:** ⏳ **pendente** — segue o fluxo do projeto (aplicar manualmente no SQL Editor do Supabase, como as demais migrations). Não há banco local nesta máquina para aplicar/validar automaticamente.
  - *Esperado:* `ALTER TABLE` conclui sem erro (dados atuais já em faixa pela app).
  - *Obtido (offline):* arquivo criado e validado por inspeção; execução no Supabase a cargo do responsável pelo deploy.

## Resultado dos testes

✅ **Passou (offline)** — migration válida e consistente com o schema. ⏳ Aplicação no Supabase pendente (passo manual do projeto).

## Observações

- **Pré-condição:** se existir linha legada fora de faixa, o `ADD CONSTRAINT` falha — limpar os dados antes de reaplicar.
- A ausência geral de down-migrations continua sendo um item de backlog; aqui o rollback está inline como comentário.
