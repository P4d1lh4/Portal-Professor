import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { periodsApi, type PeriodWithCoordinator } from "./api";
import { PERIODS_KEY, useDeletePeriod } from "./usePeriods";

function Rows({ title, rows }: { title: string; rows: [string, string | number][] }) {
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <dl className="divide-y rounded-md border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-3 py-1.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Exclusão do período com tudo o que é dele: mostra o resumo e só libera o
 * botão com a caixa marcada. Montado só enquanto aberto, o que zera a caixa.
 */
export function DeletePeriodDialog({
  period,
  onClose,
}: {
  period: PeriodWithCoordinator;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const deleteMutation = useDeletePeriod();
  const summary = useQuery({
    queryKey: [...PERIODS_KEY, period.id, "deletion-summary"],
    queryFn: () => periodsApi.deletionSummary(period.id),
    // Parada durante a exclusão: a invalidação do sucesso não rebusca um período que já não existe.
    enabled: !deleteMutation.isPending,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{`Excluir o período "${period.name}"?`}</DialogTitle>
          <DialogDescription>
            Tudo o que pertence ao período será excluído junto.
          </DialogDescription>
        </DialogHeader>

        {summary.data ? (
          <div className="space-y-4 text-sm">
            <Rows
              title="Será excluído"
              rows={[
                ["Alunos", summary.data.students],
                ["Módulos", summary.data.modules],
                ["Matrículas, com notas e faltas", summary.data.enrollments],
                ["Chamadas registradas", summary.data.attendance_records],
                ["Atestados médicos", summary.data.medical_certificates],
                ["PDFs de atestados", summary.data.attachments],
              ]}
            />
            <Rows
              title="Perdem o vínculo (as contas continuam)"
              rows={[
                ["Coordenador(a)", summary.data.coordinator ?? "—"],
                ["Professores", summary.data.professors.join(", ") || "—"],
              ]}
            />
          </div>
        ) : summary.isError ? (
          <p className="text-sm text-destructive">{summary.error.message}</p>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}

        <p className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Esta ação é permanente: depois de confirmar, não há como voltar atrás nem
          recuperar os dados.
        </p>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-destructive"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            disabled={!summary.data}
          />
          Entendo que o período e tudo o que está listado acima serão excluídos
          definitivamente.
        </label>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={!confirmed || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate(period.id, { onSuccess: onClose })}
          >
            {deleteMutation.isPending ? "Excluindo…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
