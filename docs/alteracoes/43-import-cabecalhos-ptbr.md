# 43 — Import de alunos aceita o CSV do próprio export (P-Q2)

## Problema identificado

**P-02 / P-Q2 (Alto)**, análise 2026-09 (`04-produto-lacunas.md`). O export de alunos grava o cabeçalho em pt-BR, com `;`:

```
Matrícula;Nome;E-mail;Data de matrícula;…
```

O import só aceitava snake_case (`student_number,full_name,enrollment_date`). O CSV que o próprio sistema exporta não voltava.

Além disso:
- o Excel pt-BR salva as datas como `dd/mm/aaaa`, e o import mandava a data crua para o banco;
- uma linha com colunas a mais quebrava o parse (chave `None` do `DictReader`).

## Objetivo

Round-trip do CSV de alunos: exportar, editar no Excel e importar de volta sem renomear colunas nem reformatar datas.

## Arquivos alterados

- `backend/app/routers/import_csv.py`
- `backend/tests/test_import_headers.py` (novo)
- `frontend/src/features/import/ImportPage.tsx`: texto de ajuda "Formato esperado do CSV"

## Alterações realizadas

- **Cabeçalho canônico (`_canon`):**
  - minúsculo, sem acento e com os espaços colapsados;
  - aplica um mapa de aliases do export: Matrícula, Nome, E-mail, Data de matrícula, Atestados médicos, Encaminhamento, Observações;
  - os nomes técnicos continuam valendo;
  - a coluna "Ativo" é ignorada, porque aluno importado entra ativo.
- **Coluna obrigatória ausente:** a mensagem cita o nome em português e o técnico. Exemplo: `Data de matrícula (enrollment_date)`.
- **Data:**
  - aceita `AAAA-MM-DD` (o que o export grava) e `DD/MM/AAAA` (o que o Excel salva);
  - grava sempre em ISO;
  - aplica a mesma regra do formulário de aluno (`_check_enrollment_date`): nem futura, nem absurda;
  - data inválida vira erro da linha, visível no preview, em vez de exceção do banco no meio da gravação.
- **Linha com colunas a mais:** os valores excedentes são ignorados.
- **Tela de importação:** a ajuda mostra o formato pt-BR, avisa que o CSV exportado volta como está e cita os nomes técnicos e os dois formatos de data.

## Motivo técnico

- **Normalizar sem acento** cobre de uma vez o cabeçalho do export, o digitado sem acento ("Matricula") e o que muda de caixa. Com isso, os aliases precisam só da forma sem acento.
- **Mapa no import, e não trocar o export para snake_case:** o export é lido por pessoas no Excel e deve continuar legível.
- **Validação da data no import,** reaproveitando a regra do schema: antes, data futura ou mal formatada passava pelo preview e só falhava (ou pior, era aceita) na RPC.

## Impactos positivos

- O coordenador pode exportar a turma, corrigir no Excel e reimportar noutro período, sem montar planilha à mão.
- Erro de data aparece no preview, linha a linha.

## Testes executados

- **`test_import_headers.py`** (6 casos):
  - o CSV gerado por `build_students_csv` passa pelo `_parse_csv`/`_validate_row` com todos os campos (round-trip real);
  - o cabeçalho técnico continua valendo;
  - cabeçalho sem acento com data do Excel em Latin-1;
  - mensagem de coluna ausente em português;
  - data inválida (31/02) e data futura viram erro da linha;
  - linha com colunas a mais.
- Suítes existentes de import (`test_import_csv.py`, `test_import_save.py`) e a suíte completa.
- tsc e eslint na tela de importação.
- **Provas de mutação**, aplicadas e restauradas:
  - sem o mapa de aliases;
  - sem o formato `dd/mm/aaaa`;
  - sem a regra de data futura;
  - sem a remoção de acento.

## Resultado dos testes

✅ **Passou**:
- **Import:** 21/21.
- **Suíte completa:** verde. A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Frontend:** tsc e eslint ok.
- **Mutações:** as 4 foram pegas.

## Observações

- O export de **notas** (`build_grades_csv`) não tem import. O import de notas é o P-N9, na Fase 5.
- **Mudança de comportamento:** o import passa a recusar data de matrícula futura ou anterior a 50 anos, como o formulário já fazia.
