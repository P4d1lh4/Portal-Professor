import { Component, type ErrorInfo, type ReactNode } from "react";
import { useRouteError } from "react-router-dom";

function Fallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Tente recarregar a página. Se o problema
        persistir, contate o administrador.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        Recarregar
      </button>
    </div>
  );
}

// Boundary React clássico — captura erros de render fora do RouterProvider
// (ex.: providers). ponytail: sem lib externa (react-error-boundary) nem
// telemetria ainda — logamos no console até existir observabilidade (Sentry).
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary:", error, info.componentStack);
  }

  render() {
    return this.state.hasError ? <Fallback /> : this.props.children;
  }
}

// errorElement do React Router — captura erros de render das rotas, que o
// RouterProvider não propaga para o ErrorBoundary React acima.
export function RouteErrorFallback() {
  const error = useRouteError();
  console.error("RouteError:", error);
  return <Fallback />;
}
