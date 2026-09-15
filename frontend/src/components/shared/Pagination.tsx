import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface PaginationProps {
  /** Página atual, a partir de 0. */
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  /** Trava os botões enquanto a próxima página carrega (placeholderData). */
  disabled?: boolean;
}

/** "Página X de Y" + Anterior/Próxima. Não aparece quando cabe tudo numa página. */
export function Pagination({ page, total, pageSize, onPageChange, disabled }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">
        {`Página ${page + 1} de ${totalPages}`}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || page >= totalPages - 1}
        onClick={() => onPageChange(page + 1)}
      >
        Próxima
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
