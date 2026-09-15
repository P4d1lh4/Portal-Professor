import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";

import { EmptyState } from "./EmptyState";

/** Rota inexistente (F-13): diz o que houve em vez de mandar ao painel calado. */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <EmptyState
      icon={AlertCircle}
      title="Página não encontrada"
      description="O endereço digitado não existe no sistema."
      actionLabel="Ir para o painel"
      onAction={() => navigate("/dashboard")}
    />
  );
}
