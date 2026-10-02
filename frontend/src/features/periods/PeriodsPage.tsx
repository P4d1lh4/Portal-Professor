import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarRange,
  Copy,
  Download,
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
import { cn } from "@/lib/utils";
import {
  usePeriods,
  useClonePeriod,
  useCreatePeriod,
  useUpdatePeriod,
} from "./usePeriods";
import { DeletePeriodDialog } from "./DeletePeriodDialog";
import { PeriodDialog } from "./PeriodDialog";
import { SyncSheetsDialog } from "./SyncSheetsDialog";
import { useDownloadPeriodReport } from "@/features/reports/useReports";
import type { PeriodWithCoordinator } from "./api";

function formatDate(d?: string | null) {
  if (!d) return "—";
  return format(new Date(d + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR });
}

const TEXT_BTN = "h-9 px-[11px] text-[12.5px] font-semibold [&_svg]:size-3.5";
const ICON_BTN = "text-muted-foreground [&_svg]:size-3.5";

export default function PeriodsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const isCoordinator = profile?.role === "coordinator";
  const canSync = isAdmin || isCoordinator;

  const { data: periods = [], isLoading } = usePeriods();
  const createMutation = useCreatePeriod();
  const cloneMutation = useClonePeriod();
  const updateMutation = useUpdatePeriod();
  const downloadReport = useDownloadPeriodReport();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PeriodWithCoordinator | undefined>();
  const [cloning, setCloning] = useState<PeriodWithCoordinator | undefined>();

  const [syncPeriod, setSyncPeriod] = useState<PeriodWithCoordinator | null>(null);
  const [deleting, setDeleting] = useState<PeriodWithCoordinator | null>(null);

  const openDialog = (edit?: PeriodWithCoordinator, clone?: PeriodWithCoordinator) => {
    setEditing(edit);
    setCloning(clone);
    setDialogOpen(true);
  };
  const openCreate = () => openDialog();
  const openEdit = (period: PeriodWithCoordinator) => openDialog(period);
  const openClone = (period: PeriodWithCoordinator) => openDialog(undefined, period);

  const handleSubmit = async (data: {
    name: string;
    coordinator_id: string;
    start_date?: string;
    end_date?: string;
    is_active?: boolean;
  }) => {
    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, body: data });
    } else if (cloning) {
      await cloneMutation.mutateAsync({ id: cloning.id, body: data });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão acadêmica"
        title="Períodos acadêmicos"
        description="Gerencie os períodos letivos da instituição."
        actions={
          isAdmin ? (
            <Button onClick={openCreate} className="font-semibold">
              <Plus />
              Novo período
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
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
        <div className="flex flex-col gap-3">
          {periods.map((period) => (
            <section
              key={period.id}
              aria-label={period.name}
              className={cn(
                "rounded-xl border bg-card px-[18px] py-4",
                period.is_active && "border-foreground/15",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-[180px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight">{period.name}</h2>
                    {period.is_active ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Encerrado</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">
                    {period.coordinator?.full_name ?? "Sem coordenador"} ·{" "}
                    {formatDate(period.start_date)} a {formatDate(period.end_date)}
                  </p>
                </div>

                {canSync && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      variant="outline"
                      className={TEXT_BTN}
                      aria-label="Baixar relatório do período"
                      onClick={() =>
                        downloadReport.mutate({
                          periodId: period.id,
                          periodName: period.name,
                        })
                      }
                      disabled={downloadReport.isPending}
                    >
                      <Download />
                      Relatório
                    </Button>
                    <Button
                      variant="outline"
                      className={TEXT_BTN}
                      aria-label="Sincronizar planilha"
                      onClick={() => setSyncPeriod(period)}
                    >
                      <RefreshCw />
                      Sincronizar
                    </Button>
                    {isAdmin && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className={ICON_BTN}
                          aria-label={`Novo período a partir de ${period.name}`}
                          title="Novo período a partir deste (copia os módulos)"
                          onClick={() => openClone(period)}
                        >
                          <Copy />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className={ICON_BTN}
                          aria-label="Editar período"
                          onClick={() => openEdit(period)}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          aria-label="Excluir período"
                          className="text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5"
                          onClick={() => setDeleting(period)}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      {isAdmin && (
        <PeriodDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          period={editing}
          cloneFrom={cloning}
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
      {deleting && (
        <DeletePeriodDialog period={deleting} onClose={() => setDeleting(null)} />
      )}
    </div>
  );
}
