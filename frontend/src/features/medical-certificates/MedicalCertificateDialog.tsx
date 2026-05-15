import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDropzone, type FileRejection } from "react-dropzone";
import { FileText, Loader2, Paperclip, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatFileSize } from "@/lib/utils";
import type { MedicalCertificate } from "@/types";

import {
  ALLOWED_MIME_TYPE,
  MAX_ATTACHMENT_SIZE,
} from "./api";
import { validateAttachment } from "./useMedicalCertificateAttachments";

const schema = z
  .object({
    reason: z.string().min(1, "O motivo é obrigatório").max(500),
    start_date: z.string().min(1, "Data inicial é obrigatória"),
    end_date: z.string().min(1, "Data final é obrigatória"),
    notes: z.string().optional(),
  })
  .refine((data) => data.end_date >= data.start_date, {
    path: ["end_date"],
    message: "A data final não pode ser anterior à inicial",
  });

type FormData = z.infer<typeof schema>;

export interface MedicalCertificateDialogSubmit {
  reason: string;
  start_date: string;
  end_date: string;
  notes?: string;
  attachments: File[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificate?: MedicalCertificate;
  onSubmit: (data: MedicalCertificateDialogSubmit) => Promise<void>;
}

export function MedicalCertificateDialog({
  open,
  onOpenChange,
  certificate,
  onSubmit,
}: Props) {
  const isEdit = !!certificate;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPendingFiles([]);
    if (certificate) {
      reset({
        reason: certificate.reason,
        start_date: certificate.start_date,
        end_date: certificate.end_date,
        notes: certificate.notes ?? "",
      });
    } else {
      const today = new Date().toISOString().split("T")[0];
      reset({
        reason: "",
        start_date: today,
        end_date: today,
        notes: "",
      });
    }
  }, [open, certificate, reset]);

  const addFiles = (incoming: File[]) => {
    const valid: File[] = [];
    for (const file of incoming) {
      const err = validateAttachment(file);
      if (err) {
        toast.error(`${file.name}: ${err.message}`);
        continue;
      }
      valid.push(file);
    }
    if (valid.length === 0) return;
    setPendingFiles((prev) => {
      // Deduplica por nome + tamanho (evita anexar o mesmo arquivo duas vezes
      // se o usuário arrastar de novo).
      const key = (f: File) => `${f.name}::${f.size}`;
      const seen = new Set(prev.map(key));
      return [...prev, ...valid.filter((f) => !seen.has(key(f)))];
    });
  };

  const onDrop = (accepted: File[], rejections: FileRejection[]) => {
    rejections.forEach((r) => {
      const reason = r.errors[0];
      if (reason?.code === "file-invalid-type") {
        toast.error(`${r.file.name}: apenas arquivos PDF são permitidos.`);
      } else if (reason?.code === "file-too-large") {
        toast.error(`${r.file.name}: o arquivo excede o limite de 10 MB.`);
      } else {
        toast.error(`${r.file.name}: ${reason?.message ?? "arquivo inválido"}`);
      }
    });
    addFiles(accepted);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { [ALLOWED_MIME_TYPE]: [".pdf"] },
    maxSize: MAX_ATTACHMENT_SIZE,
    multiple: true,
    disabled: isSubmitting,
    noClick: true,
    noKeyboard: true,
  });

  const removeFile = (idx: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async (data: FormData) => {
    await onSubmit({
      ...data,
      notes: data.notes?.trim() || undefined,
      attachments: pendingFiles,
    });
    onOpenChange(false);
  };

  const submitLabel = isEdit
    ? "Salvar alterações"
    : pendingFiles.length > 0
      ? `Adicionar atestado + ${pendingFiles.length} PDF${pendingFiles.length !== 1 ? "s" : ""}`
      : "Adicionar atestado";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar atestado" : "Novo atestado"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reason">Motivo *</Label>
            <Input
              id="reason"
              placeholder="Ex.: Consulta médica"
              autoFocus
              {...register("reason")}
            />
            {errors.reason && (
              <p className="text-xs text-destructive">{errors.reason.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-date">Início *</Label>
              <Input
                id="start-date"
                type="date"
                {...register("start_date")}
              />
              {errors.start_date && (
                <p className="text-xs text-destructive">
                  {errors.start_date.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-date">Fim *</Label>
              <Input
                id="end-date"
                type="date"
                {...register("end_date")}
              />
              {errors.end_date && (
                <p className="text-xs text-destructive">
                  {errors.end_date.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <textarea
              id="notes"
              rows={3}
              className="flex w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Informações adicionais sobre o atestado…"
              {...register("notes")}
            />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                  Anexos em PDF
                </Label>
                <span className="text-xs text-muted-foreground">
                  Até {formatFileSize(MAX_ATTACHMENT_SIZE)} por arquivo
                </span>
              </div>

              <div
                {...getRootProps()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 px-4 py-5 text-center transition-colors",
                  isDragActive && "border-primary bg-primary/5",
                  isSubmitting && "opacity-60"
                )}
              >
                <input
                  {...getInputProps({
                    ref: inputRef,
                    "aria-label": "Selecionar arquivos PDF para o atestado",
                  })}
                />
                <UploadCloud
                  className={cn(
                    "h-6 w-6",
                    isDragActive ? "text-primary" : "text-muted-foreground"
                  )}
                  aria-hidden
                />
                <p className="text-xs text-muted-foreground">
                  {isDragActive
                    ? "Solte os PDFs aqui…"
                    : "Arraste PDFs ou clique abaixo para selecionar."}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => inputRef.current?.click()}
                  disabled={isSubmitting}
                >
                  <Paperclip className="h-4 w-4" />
                  Selecionar PDF
                </Button>
              </div>

              {pendingFiles.length > 0 && (
                <ul
                  className="space-y-1.5"
                  aria-label="Arquivos selecionados para anexar"
                >
                  {pendingFiles.map((file, idx) => (
                    <li
                      key={`${file.name}::${file.size}::${idx}`}
                      className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5"
                    >
                      <FileText
                        className="h-4 w-4 shrink-0 text-destructive"
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium"
                          title={file.name}
                        >
                          {file.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeFile(idx)}
                        disabled={isSubmitting}
                        aria-label={`Remover ${file.name} da lista`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
