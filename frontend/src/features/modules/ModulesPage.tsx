import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, BookOpen, Pencil, Plus, Trash2 } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { useConfirm } from "@/components/shared/ConfirmDialog";
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
import { useSelectedPeriod } from "@/features/periods/useSelectedPeriod";
import {
  useModules,
  useCreateModule,
  useUpdateModule,
  useDeleteModule,
} from "./useModules";
import { ModuleDialog } from "./ModuleDialog";
import type { ModuleItem } from "./api";

const TH = "h-[42px] px-3 text-[11px] font-semibold uppercase";

export default function ModulesPage() {
  const { profile } = useAuth();
  const canEdit = profile?.role !== "professor";
  const isProfessor = profile?.role === "professor";

  // Módulos do período escolhido na barra superior.
  const { periodId, period, isLoading: periodsLoading } = useSelectedPeriod();
  const {
    data: modules = [],
    isLoading: modulesLoading,
    isError,
    error,
  } = useModules(periodId, !periodsLoading);
  // Consulta desligada não conta como carregando: soma a espera dos períodos.
  const isLoading = periodsLoading || modulesLoading;
  const createMutation = useCreateModule();
  const updateMutation = useUpdateModule();
  const deleteMutation = useDeleteModule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ModuleItem | undefined>();

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (mod: ModuleItem) => {
    setEditing(mod);
    setDialogOpen(true);
  };

  const { confirm, confirmDialog } = useConfirm();

  const handleDelete = async (mod: ModuleItem) => {
    const ok = await confirm({
      title: `Excluir o módulo "${mod.name}"?`,
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;
    deleteMutation.mutate(mod.id);
  };

  const handleSubmit = async (data: {
    name: string;
    code: string;
    professor_id: string;
    academic_period_id: string;
    credits?: number;
    max_absences?: number;
    is_active?: boolean;
  }) => {
    if (editing) {
      const { academic_period_id: _unused, ...updateBody } = data;
      void _unused;
      await updateMutation.mutateAsync({ id: editing.id, body: updateBody });
    } else {
      await createMutation.mutateAsync(data);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestão acadêmica"
        title="Módulos do período"
        description={period?.name}
        actions={
          canEdit ? (
            <Button onClick={openCreate} className="font-semibold">
              <Plus />
              Novo módulo
            </Button>
          ) : undefined
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={AlertCircle}
          title="Erro ao carregar módulos"
          description={
            (error as Error)?.message ??
            "Verifique sua conexão e tente novamente."
          }
        />
      ) : modules.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nenhum módulo encontrado"
          description={
            canEdit
              ? "Crie o primeiro módulo para começar."
              : "Nenhum módulo foi atribuído a você ainda."
          }
          actionLabel={canEdit ? "Criar módulo" : undefined}
          onAction={canEdit ? openCreate : undefined}
        />
      ) : (
        // Em tela estreita a tabela rola na horizontal dentro do card.
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className={isProfessor ? "min-w-[720px]" : "min-w-[880px]"}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={`${TH} w-[100px] pl-[18px]`}>Código</TableHead>
                <TableHead className={TH}>Módulo</TableHead>
                {!isProfessor && <TableHead className={TH}>Professor</TableHead>}
                <TableHead className={`${TH} w-[78px] text-center`}>Créd.</TableHead>
                <TableHead className={`${TH} w-[96px] text-center`}>Faltas máx.</TableHead>
                <TableHead className={`${TH} w-[100px]`}>Situação</TableHead>
                <TableHead className={`${TH} w-[150px] pr-[18px] text-right`}>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((mod) => (
                <TableRow key={mod.id}>
                  <TableCell className="py-3 pl-[18px] pr-3 font-mono text-xs font-semibold text-muted-foreground">
                    {mod.code}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-[13.5px] font-semibold">
                    {mod.name}
                  </TableCell>
                  {!isProfessor && (
                    <TableCell className="px-3 py-3 text-[13px] text-muted-foreground">
                      {mod.professor?.full_name ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="px-3 py-3 text-center font-mono text-[13px]">
                    {mod.credits}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-center font-mono text-[13px]">
                    {mod.max_absences}
                  </TableCell>
                  <TableCell className="px-3 py-3">
                    {mod.is_active ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="py-3 pl-3 pr-[18px]">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        asChild
                        variant="outline"
                        className="h-9 px-[11px] text-[12.5px] font-semibold"
                      >
                        <Link to={`/grades?module=${mod.id}`}>Notas</Link>
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Editar módulo"
                            className="text-muted-foreground [&_svg]:size-3.5"
                            onClick={() => openEdit(mod)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label="Excluir módulo"
                            className="text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive [&_svg]:size-3.5"
                            onClick={() => handleDelete(mod)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ModuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        module={editing}
        onSubmit={handleSubmit}
      />
      {confirmDialog}
    </div>
  );
}
