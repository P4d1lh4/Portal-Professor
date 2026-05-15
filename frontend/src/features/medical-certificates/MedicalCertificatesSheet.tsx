import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertCircle,
  Calendar,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import type { MedicalCertificate } from "@/types";

import { medicalCertificatesApi } from "./api";
import { MedicalCertificateAttachments } from "./MedicalCertificateAttachments";
import {
  MedicalCertificateDialog,
  type MedicalCertificateDialogSubmit,
} from "./MedicalCertificateDialog";
import {
  MEDICAL_CERTIFICATES_KEY,
  useCreateMedicalCertificate,
  useDeleteMedicalCertificate,
  useMedicalCertificates,
  useUpdateMedicalCertificate,
} from "./useMedicalCertificates";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  studentId: string | null;
  studentName?: string;
  onClose: () => void;
}

function formatRange(start: string, end: string): string {
  const s = format(new Date(`${start}T12:00:00`), "dd/MM/yyyy", { locale: ptBR });
  const e = format(new Date(`${end}T12:00:00`), "dd/MM/yyyy", { locale: ptBR });
  return s === e ? s : `${s} → ${e}`;
}

export function MedicalCertificatesSheet({
  studentId,
  studentName,
  onClose,
}: Props) {
  const { data: certificates = [], isLoading, isError, error } =
    useMedicalCertificates(studentId ?? undefined);

  const create = useCreateMedicalCertificate(studentId ?? "");
  const update = useUpdateMedicalCertificate(studentId ?? "");
  const remove = useDeleteMedicalCertificate(studentId ?? "");
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MedicalCertificate | undefined>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  const openEdit = (cert: MedicalCertificate) => {
    setEditing(cert);
    setDialogOpen(true);
  };

  const handleSubmit = async (data: MedicalCertificateDialogSubmit) => {
    const { attachments, ...body } = data;
    if (editing) {
      await update.mutateAsync({ id: editing.id, body });
      return;
    }
    if (!studentId) return;

    const certificate = await create.mutateAsync(body);
    if (attachments.length === 0) return;

    let uploaded = 0;
    let failed = 0;
    for (const file of attachments) {
      try {
        await medicalCertificatesApi.uploadAttachment(certificate.id, file);
        uploaded++;
      } catch (err) {
        failed++;
        const message =
          err instanceof Error ? err.message : "Falha ao enviar.";
        toast.error(`${file.name}: ${message}`);
      }
    }

    if (uploaded > 0) {
      // Atualiza a lista com os anexos recém-enviados
      qc.invalidateQueries({ queryKey: MEDICAL_CERTIFICATES_KEY });
      toast.success(
        uploaded === 1
          ? "1 PDF anexado com sucesso."
          : `${uploaded} PDFs anexados com sucesso.`
      );
      // Garante que o sheet exiba os novos anexos imediatamente
      setExpandedId(certificate.id);
    }
    if (failed > 0 && uploaded > 0) {
      toast.warning(
        `${failed} arquivo${failed !== 1 ? "s" : ""} não pôde ser enviado.`
      );
    }
  };

  const handleRemove = (cert: MedicalCertificate) => {
    const count = cert.attachments.length;
    const extra =
      count > 0
        ? `\nIsso também removerá ${count} anexo${count !== 1 ? "s" : ""}.`
        : "";
    if (!confirm(`Remover o atestado "${cert.reason}"?${extra}`)) return;
    remove.mutate(cert.id);
    if (expandedId === cert.id) setExpandedId(null);
  };

  return (
    <Sheet open={!!studentId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader className="pb-4">
          <SheetTitle className="text-lg">Atestados médicos</SheetTitle>
          {studentName && (
            <p className="text-sm text-muted-foreground">{studentName}</p>
          )}
        </SheetHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {certificates.length} atestado
              {certificates.length !== 1 ? "s" : ""} registrado
              {certificates.length !== 1 ? "s" : ""}
            </p>
            <Button size="sm" onClick={openCreate} disabled={!studentId}>
              <Plus className="h-4 w-4" />
              Novo atestado
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={AlertCircle}
              title="Erro ao carregar atestados"
              description={
                (error as Error)?.message ??
                "Verifique sua conexão e tente novamente."
              }
            />
          ) : certificates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum atestado registrado"
              description="Adicione o primeiro atestado deste aluno."
              actionLabel="Novo atestado"
              onAction={openCreate}
            />
          ) : (
            <ul className="space-y-3">
              {certificates.map((cert) => {
                const isExpanded = expandedId === cert.id;
                const isRemoving =
                  remove.isPending && remove.variables === cert.id;
                return (
                  <li
                    key={cert.id}
                    className="rounded-xl border bg-card p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() =>
                          setExpandedId(isExpanded ? null : cert.id)
                        }
                        aria-expanded={isExpanded}
                      >
                        <p className="text-sm font-medium">{cert.reason}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {formatRange(cert.start_date, cert.end_date)}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {cert.attachments.length} anexo
                          {cert.attachments.length !== 1 ? "s" : ""}
                        </p>
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(cert)}
                          aria-label="Editar atestado"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => handleRemove(cert)}
                          disabled={isRemoving}
                          aria-label="Remover atestado"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {cert.notes && (
                      <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs">
                        {cert.notes}
                      </p>
                    )}

                    {isExpanded && (
                      <>
                        <Separator className="my-3" />
                        <MedicalCertificateAttachments
                          certificateId={cert.id}
                          attachments={cert.attachments}
                        />
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <MedicalCertificateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          certificate={editing}
          onSubmit={handleSubmit}
        />
      </SheetContent>
    </Sheet>
  );
}
