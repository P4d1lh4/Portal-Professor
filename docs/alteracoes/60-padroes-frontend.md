# 60 — Paginação e status de select compartilhados, aria nos dialogs (F-12, F-14)

## Problema identificado

**F-12 (Baixo)**, análise 2026-09 (`02-frontend.md`): padrões duplicados entre features.
- **Loading / erro com "Tentar novamente" / lista vazia:** o bloco se repetia em `ModuleDialog` (duas vezes) e em `PeriodDialog`.
- **Paginação:** a conta de `totalPages`/`canPrev`/`canNext` e o rodapé com Anterior/Próxima se repetiam em `StudentsPage`, `UsersPage` e `AuditLogPage`, quase idênticos.
- **Datas:** a Chamada tinha um `formatDateBR` manual, enquanto o resto usava `date-fns`.
- **`aria-describedby`:** só os formulários de login ligavam o campo à sua mensagem de erro. Nos dialogs de cadastro, um leitor de tela não anunciava por que o campo foi recusado. Nos selects de Período e Professor do `ModuleDialog`, o rótulo também não estava associado ao campo.

**F-14 (Baixo, decisão):** `refetchOnReconnect: false` global. Com a rede caindo durante o lançamento, nada revalida quando ela volta. A análise sugeria reavaliar para `grades`/`attendance`.

## Objetivo

Tirar a duplicação que de fato se repete, deixar os erros de formulário acessíveis e decidir o F-14 com base no código.

## Arquivos alterados

- `frontend/src/components/shared/Pagination.tsx` (novo) e `Pagination.test.tsx` (novo)
- `frontend/src/components/shared/SelectOptionsStatus.tsx` (novo) e `SelectOptionsStatus.test.tsx` (novo)
- `frontend/src/features/students/StudentDialog.test.tsx` (novo)
- `frontend/src/features/{students/StudentsPage,users/UsersPage,audit/AuditLogPage}.tsx`
- `frontend/src/features/{modules/ModuleDialog,periods/PeriodDialog}.tsx`
- `frontend/src/features/{students/StudentDialog,users/UserDialog,users/ChangePasswordDialog,medical-certificates/MedicalCertificateDialog}.tsx`
- `frontend/src/lib/queryClient.ts` (comentário do F-14)

## Alterações realizadas

- **`<Pagination page total pageSize onPageChange disabled>`:**
  - mostra "Página X de Y" com os botões Anterior e Próxima, e some quando cabe tudo numa página;
  - o `disabled` trava os botões enquanto a próxima página carrega (`isPlaceholderData`);
  - as três páginas o usam, e as contas locais saíram. Em Alunos e Usuários, o "página X de Y" saiu do texto da contagem e foi para o lado dos botões.
- **`<SelectOptionsStatus>`:**
  - com erro, mostra a mensagem e o botão "Tentar novamente";
  - com a lista vazia, orienta o usuário;
  - enquanto carrega, não mostra nada, porque o placeholder já diz "Carregando...".
  - Substitui os três blocos dos dialogs de Módulo e Período.
- **Acessibilidade nos 6 dialogs** (21 campos que mostram erro):
  - o input recebe `aria-invalid` e `aria-describedby`, e o `<p>` do erro recebe o `id`, no mesmo formato dos formulários de login;
  - os selects de Período e Professor do `ModuleDialog` ganharam `id` e `htmlFor`.
- **F-14:** o `refetchOnReconnect` fica `false`, e um comentário `ponytail:` no `queryClient.ts` diz por quê e quando mudar.

## Motivo técnico

- **O `usePagination()` ficou de fora.**
  - O `page` precisa existir antes da query, porque o offset vai nos parâmetros. O `total` só existe depois dela, então um hook teria de ser partido em dois.
  - O que era duplicado de fato era o rodapé, com cerca de 25 linhas em cada página, e ele virou `<Pagination>`.
  - Nas páginas ficam `useState(0)` e o reset quando o filtro muda, com as dependências explícitas que o lint confere.
- **`<SelectOptionsStatus>` em vez de `<AsyncSelectField>`.** O repetido era o bloco de situação. Embrulhar o Select inteiro exigiria uma API de props (valor, placeholder, opções) sem um segundo uso que a justifique.
- **O `date-fns` na Chamada ficou de fora.** O `formatDateBR` manual nunca lança exceção. Já `format(new Date(...))` lança `RangeError` com data inválida, e a `selectedDate` da Chamada vem da URL (`?date=`). Trocar deixaria a página quebrar com um link malformado.
- **F-14:**
  - **Chamada:** o rascunho é refeito num `useEffect([day])`. Um refetch ao reconectar devolve um objeto `day` novo, mesmo com o conteúdo igual, e apagaria sem aviso as marcações não salvas. Ligar o refetch exige antes prender o reset à troca de módulo ou data.
  - **Notas:** o `GradeCell` só ressincroniza quando o valor muda, então não perde o que foi digitado. Mas cada nota já é salva sozinha, e a revalidação ganharia pouco.

## Testes executados

- **`Pagination.test.tsx`:**
  - some com uma página só;
  - mostra "Página 2 de 3" e navega para os dois lados;
  - trava Anterior na primeira página e Próxima na última;
  - trava os dois com `disabled`.
- **`SelectOptionsStatus.test.tsx`:** o erro mostra o motivo e tenta de novo; a lista vazia orienta; carregando ou com opções, não mostra nada.
- **`StudentDialog.test.tsx`:** ao enviar vazio, "Nome completo" fica com `aria-invalid="true"` e com a descrição acessível "Nome completo é obrigatório"; o mesmo para Matrícula.
- **Suíte e checagens:** vitest completo, `tsc -b` e eslint nos arquivos alterados.
- **Provas de mutação:**

| Mutação | Resultado |
|---|---|
| **P1:** Próxima liberada na última página (`>=` → `>`) | 1 teste falhou |
| **P2:** aviso de lista vazia aparecendo durante o carregamento | 1 teste falhou |
| **P3:** campo sem `aria-describedby` | o teste do dialog falhou |

## Resultado dos testes

✅ **Passou**:
- **vitest:** 15 arquivos e 77 testes.
- **`tsc -b`:** sem erros.
- **eslint:** sem avisos nos arquivos alterados. Os 18 avisos `react-refresh/only-export-components` do lint completo vêm de arquivos que esta alteração não toca.
- **Mutações:** as 3 foram mortas.

## Observações

- **Formulários de login:** têm `aria-describedby`, mas não `aria-invalid`. Fica para quando forem mexidos.
- **Sem verificação visual no navegador:** a mudança visível é só o rodapé de paginação.
