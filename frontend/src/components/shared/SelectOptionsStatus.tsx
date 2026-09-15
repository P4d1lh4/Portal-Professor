import type { ReactNode } from "react";

interface SelectOptionsStatusProps {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  /** Quantas opções vieram. */
  count: number;
  onRetry: () => unknown;
  /** Ex.: "Não foi possível carregar os períodos" (sem ponto final). */
  errorText: string;
  emptyText: ReactNode;
}

/**
 * Situação das opções de um select carregado da API: erro com "Tentar
 * novamente", ou orientação quando a lista vem vazia. Enquanto carrega não
 * mostra nada, porque o placeholder do select já diz "Carregando...".
 */
export function SelectOptionsStatus({
  isLoading,
  isError,
  error,
  count,
  onRetry,
  errorText,
  emptyText,
}: SelectOptionsStatusProps) {
  if (isError) {
    return (
      <p className="text-xs text-destructive">
        {errorText}
        {error instanceof Error ? `: ${error.message}` : "."}{" "}
        <button
          type="button"
          className="underline underline-offset-2 hover:text-foreground"
          onClick={() => onRetry()}
        >
          Tentar novamente
        </button>
      </p>
    );
  }
  if (!isLoading && count === 0) {
    return <p className="text-xs text-muted-foreground">{emptyText}</p>;
  }
  return null;
}
