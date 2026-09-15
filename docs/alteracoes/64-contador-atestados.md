# 64 — Contador de atestados deixa de ser gravado à mão (sequência da B-S6)

## Problema identificado

Observação da alteração 61. `students.medical_certificates` é o total da lista de atestados: o trigger da 0003 o recalcula a cada insert/delete em `medical_certificates`. Mas quatro caminhos o gravavam à mão:
- o campo "Certificados médicos" do `StudentDialog`, ao criar e ao editar aluno;
- `StudentCreate`/`StudentUpdate`, nos dois POST de criação e no `PUT /professor/students/{id}`, inclusive pelo professor (`allowed_fields`);
- `PUT /professor/students/{id}/absences`, que só servia para isso e não tinha chamador no front;
- a coluna "Atestados médicos" do import CSV de alunos.

O número digitado ficava na ficha do aluno e no CSV de alunos até o próximo atestado incluído ou removido, e não batia com o boletim, que desde a 61 lista os atestados reais.

## Objetivo

A lista de atestados passa a ser a única origem do número. A coluna fica, só para leitura, mantida pelo trigger.

## Arquivos alterados

- `backend/app/schemas/students.py`: `medical_certificates` sai de `StudentCreate` e `StudentUpdate`; `AbsenceUpdate` sai; comentário no `Student`
- `backend/app/routers/students.py`: o campo sai do `allowed_fields` do professor; `PUT /professor/students/{id}/absences` removido
- `backend/app/routers/import_csv.py`: saem a coluna opcional, o alias "atestados medicos" e a leitura em `_validate_row`
- `backend/scripts/seed.py`: sem contador aleatório (a seed não cria atestados, então o total é 0)
- `backend/tests/test_students_contador_atestados.py`: novo, 5 testes
- `backend/tests/test_import_csv.py`: os 2 testes do contador viram 1 (a coluna é ignorada)
- `backend/tests/test_import_headers.py`: o CSV do export volta sem o contador
- `backend/tests/test_students_authz.py`: sai o teste do `PUT /absences`, rota que não existe mais
- `frontend/src/features/students/StudentDialog.tsx`: o campo sai do formulário; o e-mail ocupa a linha
- `frontend/src/features/students/api.ts`: `StudentCreate` sem o campo; `StudentItem` documenta que ele é só leitura
- `frontend/src/features/students/StudentsPage.tsx`: tipo do submit
- `frontend/src/features/import/ImportPage.tsx`: a ajuda do import não lista mais "Atestados médicos"
- `frontend/src/features/students/StudentDialog.test.tsx`: 1 teste novo

## Alterações realizadas

- **Escrita:** o Pydantic ignora campo desconhecido, então um cliente que ainda mande `medical_certificates` não recebe erro, só não grava. Um PUT só com esse campo cai no 422 "Nenhum campo para atualizar." que já existia.
- **Leitura, sem mudança:** `Student.medical_certificates`, a ficha ("Atestados médicos: N"), o CSV de alunos e o `GET /absences` leem a coluna do trigger. O `useMedicalCertificates` já invalida a ficha depois de incluir ou remover atestado.
- **Import:** a coluna "Atestados médicos" do CSV exportado passa a ser ignorada, como "Ativo". O CSV do export continua voltando sem edição.
- **RPC da 0007:** usa `COALESCE(p_student->>'medical_certificates', 0)`. Sem o campo, o aluno novo nasce com 0, o total da lista vazia.

## Motivo técnico

- **A coluna fica, sem migração.** O trigger já a mantém e ela serve a ficha e o CSV sem contar nada por request. Tirá-la exigiria migração, que o plano manda passar por staging antes (I-23 não existe; o Supabase está pausado).
- **Sem recontagem automática.** Um `UPDATE` que recontasse tudo zeraria, sem que ninguém visse, os números digitados para alunos que não têm os atestados na lista (os de antes da 0003, por exemplo). Com o Supabase pausado não dá para olhar os dados. A consulta está em Observações.
- **Sai o `PUT /absences`, fica o `GET /absences`.** O PUT só gravava o contador. O GET só lê; também não tem chamador no front, mas removê-lo é outro assunto.
- **A ficha lê a coluna, não a lista.** Contar a lista no front custaria uma chamada a mais por ficha aberta para chegar ao número que o trigger já guarda.

## Impactos positivos

- O número da ficha e do CSV de alunos só muda quando a lista de atestados muda.
- Uma rota de escrita a menos na API.

## Testes executados

- **Testes novos:**
  - `test_editar_aluno_ignora_o_contador` (admin e coordenador): o PUT grava o nome e não o contador;
  - `test_so_o_contador_nao_tem_o_que_atualizar`: 422 e nenhuma escrita;
  - `test_criar_aluno_ignora_o_contador`: o insert do POST de criação não leva o contador;
  - `test_put_absences_saiu`: 405 e nenhuma escrita;
  - `test_contador_de_atestados_nao_e_importado`;
  - vitest "não edita o contador de atestados": o formulário não tem o campo e o submit não o envia.
- **Suíte do backend; vitest, typecheck, lint e build do front.**
- **Provas de mutação:** cada uma aplicada no código, rodada e restaurada, com hash conferido depois.

| Mutação | Testes que falharam |
|---|---|
| **B1:** `StudentUpdate` volta a aceitar o campo | 3 |
| **B2:** `StudentCreate` volta a aceitar o campo | 1 |
| **B3:** `_validate_row` volta a ler o contador | 1 |
| **B4:** `PUT /absences` volta | 1 |
| **F1:** o `StudentDialog` volta a ter o campo no schema e no reset | 1 |

## Resultado dos testes

✅ **Passou**:
- **Backend:** 359 passaram e 2 skip. Única falha: `test_me_sem_token_retorna_401`, por ambiente (FastAPI 0.115 local; o CI usa 0.141.1), já registrada na alteração 58.
- **Front:** vitest 84/84; typecheck ok; lint com 0 erros (os 17 avisos de antes); build ok.
- **Mutações:** as 5 foram mortas.

## Observações

- **Depois do restore do Supabase**, ver quem tem contador diferente da lista (só leitura):

  ```sql
  SELECT s.student_number, s.full_name, s.medical_certificates AS contador, COUNT(mc.id) AS na_lista
    FROM public.students s
    LEFT JOIN public.medical_certificates mc ON mc.student_id = s.id
   GROUP BY s.id
  HAVING s.medical_certificates <> COUNT(mc.id);
  ```

  Se houver alunos, decidir se os atestados deles entram na lista antes de recontar:

  ```sql
  UPDATE public.students s
     SET medical_certificates = c.total
    FROM (SELECT s2.id, COUNT(mc.id)::int AS total
            FROM public.students s2
            LEFT JOIN public.medical_certificates mc ON mc.student_id = s2.id
           GROUP BY s2.id) c
   WHERE c.id = s.id AND s.medical_certificates <> c.total;
  ```

  Sem isso, o número desses alunos só se corrige no próximo atestado incluído ou removido.
- **O trigger não precisa cobrir UPDATE:** `MedicalCertificateUpdate` não deixa trocar o `student_id` de um atestado.
