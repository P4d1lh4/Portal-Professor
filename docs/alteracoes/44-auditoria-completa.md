# 44 — Auditoria completa das mutações (P-Q3 / B-05)

## Problema identificado

**B-05 / P-05 (Médio)**, análise 2026-09 (`01-backend.md`, `04-produto-lacunas.md`).

O `write_audit_log` só era chamado em cinco lugares:
- atualização de nota;
- atualização e exclusão de módulo;
- atualização e desativação de aluno;
- exclusão de período.

Nenhuma criação gravava `insert`, embora o enum da 0006 e o rótulo "Criação" da tela existissem.

Ficavam sem rastro:
- **usuários:** criar, **mudar papel**, desativar e reativar;
- **atestados médicos e anexos**, que são dado sensível;
- **exclusão de chamada** de um dia, que apaga as marcações em cascata;
- **sync de planilha**, que altera dezenas de notas de uma vez;
- **import de alunos**;
- **encerrar ou reabrir período**, a ação que trava ou libera notas e chamada.

## Objetivo

Toda mutação relevante deixa uma entrada no `audit_log`, com o mínimo necessário para responder "quem fez o quê, quando e o que era antes". Dado de saúde não é duplicado no log.

## Arquivos alterados

- `backend/app/routers/users.py`
- `backend/app/routers/medical_certificates.py`
- `backend/app/routers/attendance.py`
- `backend/app/routers/sheets.py`
- `backend/app/routers/import_csv.py`
- `backend/app/routers/periods.py`
- `backend/app/routers/modules.py`
- `backend/app/routers/students.py`
- `backend/tests/test_audit_coverage.py` (novo)
- `backend/tests/test_users_authz.py` (2 asserções ajustadas)
- `frontend/src/features/audit/AuditLogPage.tsx`: rótulos das entidades novas

## Alterações realizadas

| Entidade (`entity`) | Ação | O que o log guarda |
|---|---|---|
| `users` | criar (`insert`) | username, nome, e-mail, papel, ativo |
| `users` | editar (`update`) | antes e depois dos campos enviados. O resumo diz "Papel alterado: X (professor → coordinator)" quando o papel muda |
| `users` | desativar / reativar | `is_active` antes e depois. Reativar quem já estava ativo não gera entrada |
| `medical_certificates` | criar / editar / excluir | aluno e datas, **nunca motivo nem observação**. A edição do texto aparece só como "Atestado alterado (motivo/observação)". A exclusão conta os anexos removidos |
| `medical_certificate_attachments` | enviar / remover anexo | atestado, nome e tamanho do arquivo |
| `attendance` | excluir chamada | módulo, data, observação e **as marcações de cada matrícula**, suficientes para refazer a chamada apagada por engano |
| `sheets` | sync de planilha | um registro agregado por sync: atualizados e não encontrados |
| `periods` | trocar URL da planilha | URL antes e depois. Salvar a mesma URL não gera entrada |
| `students` | import CSV | um registro agregado por importação (`entity_id` = período): importados e inválidos. O preview (`dry_run`) não grava |
| `periods` | criar (`insert`) / editar (`update`) | campos do período. O resumo destaca "Período encerrado" e "Período reaberto" |
| `modules` | criar (`insert`), nas duas rotas | nome, código, professor, créditos, faltas, ativo |
| `students` | criar (`insert`), coordenador e professor | campos do aluno. Na rota do professor, o resumo diz em quantos módulos ele foi matriculado |

Duas mudanças colaterais:
- **`PUT /users/{id}` e `PUT /periods/{id}`** passaram a buscar o registro **antes** de escrever: 404 sem tocar no banco, e o `before` do log sai correto.
- **A tela de auditoria** ganhou rótulos para Matrículas, Chamada, Planilha, Usuários, Atestados e Anexos de atestado, que também aparecem no filtro.

## Motivo técnico

- **Registro agregado no sync e no import:** um sync mexe em dezenas de notas e um import cria até 500 alunos. Uma entrada por linha afogaria a tela; o resumo diz o que aconteceu e o `entity_id` aponta o período.
- **Minimização do dado de saúde:** o `audit_log` é outra cópia, com outra retenção. Motivo e observação do atestado ficam só na tabela de origem; o log registra que houve edição.
- **Marcações no `before` da exclusão de chamada:** é a única exclusão do sistema que apaga dezenas de linhas sem volta, porque as FKs apagam em cascata. O mesmo raciocínio da nota no `before` da desmatrícula (alteração 42).
- **Salvar chamada não é auditado:** acontece todo dia em todo módulo, e o registro já guarda `created_by`/`updated_at`. Só a exclusão, que destrói dados, entra.
- **O `write_audit_log` é best-effort:** se o log falhar, a ação principal segue (`services/audit.py`). Isso não mudou.

## Impactos positivos

- Mudança de papel de usuário (escalada de privilégio) e encerramento de período passam a ter autor e horário.
- Chamada apagada por engano pode ser reconstruída a partir do log.
- A tela de auditoria deixa de mostrar só notas, módulos, alunos e períodos.

## Testes executados

- **`test_audit_coverage.py`** (13 casos):
  - usuário: criar, mudar papel (resumo + antes/depois), desativar, reativar;
  - atestado: criar, editar e excluir, conferindo que "Gripe", "Outra" e "sigiloso" não aparecem no log;
  - anexo: enviar e remover;
  - exclusão de chamada com as marcações;
  - sync de planilha;
  - troca de URL, e repetir a mesma URL não grava;
  - import, e preview não grava;
  - criar e encerrar período;
  - criar módulo;
  - criar aluno pelas duas rotas.
- Suíte completa, tsc e eslint na tela de auditoria.
- **Provas de mutação:**
  - `write_audit_log` desligado em cada um dos 8 routers, um de cada vez;
  - `_cert_audit` devolvendo o atestado inteiro (motivo no log).

## Resultado dos testes

✅ **Passou**:
- **Backend:** 13/13 novos; suíte completa verde; cobertura de **79,9%** (antes 74,6%). A única falha local é a conhecida, do FastAPI 0.115 do Python global.
- **Frontend:** tsc e eslint ok.
- **Mutações:** as 9 foram pegas.
- **Testes ajustados:** `test_admin_muda_papel` e `test_admin_desativa_outro_usuario` afirmavam a lista exata de escritas. Agora filtram as escritas em `profiles`, porque a entrada do log é o comportamento novo e está coberta na suíte nova.

## Observações

- **Retenção do `audit_log`:** a tabela não tem política de retenção. Com o volume atual (dezenas de ações por dia), isso não pesa por anos; se crescer, vale um expurgo por data num job.
- **Troca da própria senha** (`/me/change-password`) não é auditada: a pessoa age sobre a própria conta e o Supabase Auth já registra o evento.
- **Liberar a tela de auditoria** para coordenador e professor, que o backend já filtra por autor, continua decisão pendente do dono (P-Q9).
