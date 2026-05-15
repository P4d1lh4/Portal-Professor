import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, BookOpen, ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";

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
  useModules,
  useCreateModule,
  useUpdateModule,
  useDeleteModule,
} from "./useModules";
import { ModuleDialog } from "./ModuleDialog";
import type { ModuleItem } from "./api";

export default function ModulesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canEdit = profile?.role !== "professor";
  const isProfessor = profile?.role === "professor";

  const { data: modules = [], isLoading, isError, error } = useModules();
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

  const handleDelete = (mod: ModuleItem) => {
    if (!confirm(`Excluir o módulo "${mod.name}"? Esta ação não pode ser desfeita.`))
      return;
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
        title="Módulos"
        description={
          isProfessor
            ? "Seus módulos neste período."
            : "Gerencie os módulos/disciplinas por período."
        }
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
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
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Período</TableHead>
                {!isProfessor && <TableHead>Professor</TableHead>}
                <TableHead className="w-16 text-center">Créditos</TableHead>
                <TableHead className="w-20 text-center">Faltas máx.</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-28 text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {modules.map((mod) => (
                <TableRow key={mod.id}>
                  <TableCell>
                    <span className="font-mono text-xs font-semibold text-muted-foreground">
                      {mod.code}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{mod.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {mod.academic_period?.name ?? "—"}
                  </TableCell>
                  {!isProfessor && (
                    <TableCell className="text-sm text-muted-foreground">
                      {mod.professor?.full_name ?? "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-center font-mono text-sm">
                    {mod.credits}
                  </TableCell>
                  <TableCell className="text-center font-mono text-sm">
                    {mod.max_absences}
                  </TableCell>
                  <TableCell>
                    {mod.is_active ? (
                      <Badge variant="success">Ativo</Badge>
                    ) : (
                      <Badge variant="secondary">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {/* Professor pode ir direto para notas do módulo */}
                      {isProfessor && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Lançar notas"
                          onClick={() =>
                            navigate(`/grades?module=${mod.id}`)
                          }
                        >
                          <ClipboardList className="h-4 w-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Editar módulo"
                            onClick={() => openEdit(mod)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Excluir módulo"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(mod)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
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
    </div>
  );
}
