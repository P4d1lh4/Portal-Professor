import { QueryClient } from "@tanstack/react-query";

/**
 * Instância única do QueryClient do TanStack Query.
 *
 * Mantida fora do componente App para que módulos não-React (ex.: o store
 * de autenticação) possam limpar o cache no logout — evitando que dados de
 * uma conta apareçam para a próxima conta logada na mesma aba.
 */
export const queryClient = new QueryClient({
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
