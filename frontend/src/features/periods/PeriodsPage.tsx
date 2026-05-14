import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarRange,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  usePeriods,
  useCreatePeriod,
  useUpdatePeriod,
  useDeletePeriod,
} from "./usePeriods";
import { PeriodDialog } from "./PeriodDialog";
import { SyncSheetsDialog } from "./SyncSheetsDialog";
import type { PeriodWithCoordinator } from "./api";

function formatDate(d?: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

export default function PeriodsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isCoordinator = profile?.role === "coordinator";
  const canSync = isAdmin || isCoordinator;

  const { data: periods = [], isLoading } = usePeriods();
  const createMutation = useCreatePeriod();
  const updateMutation = useUpdatePeriod();
  const deleteMutation = useDeletePeriod();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PeriodWithCoordinator | undefined>();

  const [syncPeriod, setSyncPeriod] = useState<PeriodWithCoordinator | null>(null);

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (period: PeriodWithCoordinator) => {
    setEditing(period);
    setDialogOpen(true);
  };

  const handleDelete = (period: PeriodWithCoordinator) => {
    if (
      !confirm(
        `Deseja excluir o período "${period.name}"? Esta ação não pode ser desfeita.`
      )
    )
      return;
    deleteMutation.mutate(period.id);
  };

  const handleSubmit = async (data: {
    name: string;
    coordinator_id: string;
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
  }) => {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, body: data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Períodos Acadêmicos"
        description="Gerencie os períodos letivos da instituição."
        actions={
          isAdmin ? (
            <Button onClick={openCreate}>
              <Plus />
              Novo período
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : periods.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Nenhum período encontrado"
          description={
            isAdmin
              ? "Crie o primeiro período acadêmico para começar."
              : "Nenhum período acadêmico foi atribuído a você ainda."
          }
          actionLabel={isAdmin ? "Criar período" : undefined}
          onAction={isAdmin ? openCreate : undefined}
        />
      ) : (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Coordenador</TableHead>
                <TableHead>Início</TableHead>
                <TableHead>Fim</TableHead>
                <TableHead>Status</TableHead>
                {(isAdmin || canSync) && (
                  <TableHead className="w-28 text-right">Ações</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {periods.map((period) => (
                <TableRow key={period.id}>
                  <TableCell className="font-medium">{period.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {period.coordinator?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatDate(period.start_date)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatDate(period.end_date)}
                  </TableCell>
                  <TableCell>
                    {period.is_active ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  {(isAdmin || canSync) && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canSync && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Sincronizar planilha"
                            onClick={() => setSyncPeriod(period)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Editar período"
                              onClick={() => openEdit(period)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Excluir período"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(period)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {isAdmin && (
        <PeriodDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          period={editing}
          onSubmit={handleSubmit}
        />
      )}

      {syncPeriod && (
        <SyncSheetsDialog
          open={!!syncPeriod}
          onOpenChange={(open) => { if (!open) setSyncPeriod(null); }}
          periodId={syncPeriod.id}
          periodName={syncPeriod.name}
          currentUrl={syncPeriod.csv_sync_url}
        />
      )}
    </div>
  );
}
