# 39 — Suítes de testes de componente no frontend (F-17b)

## Problema identificado

**F-17 (Alto)**, análise 2026-09, `02-frontend.md`. Com a infra montada no F-17a (alteração 38), faltavam as suítes nas partes de maior risco do frontend: interceptors do axios (sessão expirada), `ProtectedRoute` (quem vê o quê), `useAuth` (bootstrap e perfil), tela de Notas (lançamento inline com update otimista) e Chamada (rascunho não salvo, F-01). Até aqui, só funções puras tinham teste.

## Objetivo

Travar o comportamento dessas cinco partes, na ordem de risco do plano, sem subir backend nem tocar no Supabase.

## Arquivos alterados

- `frontend/src/lib/axios.test.ts` (novo)
- `frontend/src/hooks/useAuth.test.ts` (novo)
- `frontend/src/routes/ProtectedRoute.test.tsx` (novo)
- `frontend/src/features/grades/GradesPage.test.tsx` (novo)
- `frontend/src/features/attendance/AttendancePage.test.tsx` (novo)

## Alterações realizadas

- **axios (8 testes):**
  - injeta o Bearer da sessão e não manda `Authorization` sem sessão;
  - 401 limpa sessão e profile e manda para `/login`, mas não recarrega quem já está no login;
  - 403 mantém a sessão;
  - erro de download (Blob) vira o `detail`, seja JSON ou texto puro;
  - falha de rede cai na mensagem genérica.
- **useAuth (9):**
  - `SIGNED_IN` busca e valida o profile;
  - role fora do schema ou erro do Supabase viram `null` sem travar o carregamento;
  - `SIGNED_OUT` não vai ao banco;
  - `PASSWORD_RECOVERY` liga o desvio;
  - `signIn` traduz "Invalid login credentials";
  - `signOut` limpa store e cache mesmo com a rede falhando;
  - o safety timeout libera a UI em 5 s.
- **ProtectedRoute (6):**
  - spinner enquanto carrega;
  - sem sessão vai para o login;
  - a recuperação de senha tem prioridade mesmo carregando;
  - papel fora de `allowedRoles` volta ao dashboard;
  - papel permitido entra;
  - sem `allowedRoles`, qualquer sessão entra.
- **GradesPage (5):**
  - editar a nota manda o PUT, recalcula a final na hora (otimista) e mostra "salvando…" e depois "salvo";
  - PUT falho reverte a célula e mostra o erro;
  - nota 15 vira 10 com aviso;
  - blur antes do debounce salva uma vez só;
  - período encerrado deixa as células só leitura.
- **AttendancePage (5):**
  - com rascunho, trocar a data ou o módulo pede confirmação;
  - Cancelar mantém a data e as marcações;
  - Descartar troca e recarrega do servidor;
  - sem alteração troca direto;
  - Salvar fica desabilitado sem mudança e envia o rascunho completo (status e observações).

## Motivo técnico

- **Sem `msw`.** As telas falam com o backend por módulos de api (`gradesApi`, `attendanceApi`, `modulesApi`), e o `vi.mock` neles isola a rede com menos peças. Para o axios, cada teste passa um `adapter` na própria requisição: os interceptors reais rodam e nenhuma dependência nova entra. O `msw` só se paga se um dia houver teste que precise do contrato HTTP inteiro.
- **`@/lib/supabase` sempre mockado** onde o store real é carregado (axios e useAuth). O `.env` local aponta para o projeto de produção; nas telas, o `useAuth` inteiro é mockado.
- **Datas fixas pela URL** (`?module=m1&date=2026-09-14`), para o teste da Chamada não depender do dia em que roda.
- **No teste de rollback, o refetch do `onSettled` fica pendente de propósito:** só o rollback do `onError` pode devolver o valor antigo. Sem isso, o refetch mascararia um rollback quebrado.

## Impactos positivos

- Sessão expirada, desvio de recuperação de senha, validação do profile e o rascunho da Chamada ficam travados. Qualquer regressão nesses pontos quebra o CI.
- O frontend passa de 10 para 43 testes, com ~9 s a quente.

## Testes executados

- `npx vitest run`, `npx eslint` nos arquivos novos, `npx tsc -b` e `npm run build`.
- **Provas de mutação**, cada uma aplicada temporariamente no código de produção e restaurada depois:

  | Mutação | Resultado |
  |---|---|
  | 401 não limpa a sessão (`axios.ts`) | 1 falha |
  | Recuperação de senha só depois do loading (`ProtectedRoute`) | 1 falha |
  | Profile sem validação zod (`useAuth`) | 1 falha |
  | Safety timeout de 50 s (`useAuth`) | 1 falha |
  | `onError` sem rollback (`useGrades`) | 1 falha |
  | `confirmDiscard` sempre libera (`AttendancePage`) | 4 falhas |

## Resultado dos testes

✅ **Passou**: vitest 43/43 (10 antigos, 33 novos); lint sem erros nos arquivos novos; tsc e build ok. As 6 mutações foram pegas.

## Observações

Dois achados, registrados e não corrigidos aqui, porque o item é de teste:

- **`GradeCell` só ressincroniza o valor local quando `value` muda.** Se o PUT falhar no mesmo tick do update otimista, otimista e rollback caem no mesmo render. O cache volta ao mesmo objeto (structural sharing), a célula continua mostrando o valor digitado e só o toast avisa. Com HTTP real sempre há ida e volta, então não acontece na prática; o teste simula a falha com 50 ms de atraso. Correção, se um dia valer: ressincronizar pelo `status` do save, ou pela chave do React, em vez do `value`.
- **`ProtectedRoute` com sessão e `profile === null`** (busca falhou ou schema inválido) deixa passar rota com `allowedRoles`. O backend continua barrando, porque a authz é na API: a pessoa vê a casca da tela e recebe 403 nas chamadas. Baixo risco, mas vale um "perfil indisponível" em vez da tela quebrada.
