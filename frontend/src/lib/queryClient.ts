import { MutationCache, QueryClient } from "@tanstack/react-query";

/**
 * Instância única do QueryClient do TanStack Query.
 *
 * Mantida fora do componente App para que módulos não-React (ex.: o store
 * de autenticação) possam limpar o cache no logout — evitando que dados de
 * uma conta apareçam para a próxima conta logada na mesma aba.
 */
export const queryClient: QueryClient = new QueryClient({
  // Quase toda escrita (alunos, módulos, notas, chamada, import, planilha)
  // mexe nas contagens do dashboard. Invalidar aqui cobre todas de uma vez;
  // a query só é refeita se o dashboard estiver montado.
  mutationCache: new MutationCache({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 3, // 3 minutos: cache fresco
      gcTime: 1000 * 60 * 10, // 10 minutos: mantém em memória após sair da tela
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
