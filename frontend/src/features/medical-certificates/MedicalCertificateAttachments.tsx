import { useCallback, useRef, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Loader2, Paperclip, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatFileSize } from "@/lib/utils";
import type { MedicalCertificateAttachment } from "@/types";

import {
  ALLOWED_MIME_TYPE,
  MAX_ATTACHMENT_SIZE,
} from "./api";
import { MedicalCertificateAttachmentItem } from "./MedicalCertificateAttachmentItem";
import {
  useDeleteAttachment,
  useUploadAttachment,
  validateAttachment,
} from "./useMedicalCertificateAttachments";

interface Props {
  certificateId: string;
  attachments: MedicalCertificateAttachment[];
  disabled?: boolean;
}

export function MedicalCertificateAttachments({
  certificateId,
  attachments,
  disabled = false,
}: Props) {
  const upload = useUploadAttachment(certificateId);
  const remove = useDeleteAttachment(certificateId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const handleFiles = useCallback(
    async (files: File[]) => {
      const valid: File[] = [];
      for (const file of files) {
        const err = validateAttachment(file);
        if (err) {
          // toast simples — o hook já lida com erros de rede; aqui é validação client-side
          const { toast } = await import("sonner");
          toast.error(`${file.name}: ${err.message}`);
          continue;
        }
        valid.push(file);
      }
      if (valid.length === 0) return;

      setPendingCount((c) => c + valid.length);
      for (const file of valid) {
        try {
          await upload.mutateAsync(file);
        } catch {
          /* já tratado no onError do hook */
        } finally {
          setPendingCount((c) => Math.max(0, c - 1));
        }
      }
    },
    [upload]
  );

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      // Erros explícitos do react-dropzone (mime/size) viram toast
      rejections.forEach(async (r) => {
        const { toast } = await import("sonner");
        const reason = r.errors[0];
        if (reason?.code === "file-invalid-type") {
          toast.error(`${r.file.name}: apenas arquivos PDF são permitidos.`);
        } else if (reason?.code === "file-too-large") {
          toast.error(`${r.file.name}: o arquivo excede o limite de 10 MB.`);
        } else {
          toast.error(`${r.file.name}: ${reason?.message ?? "arquivo inválido"}`);
        }
      });
      handleFiles(accepted);
    },
    [handleFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { [ALLOWED_MIME_TYPE]: [".pdf"] },
    maxSize: MAX_ATTACHMENT_SIZE,
    multiple: true,
    disabled: disabled || upload.isPending,
    noClick: true,
    noKeyboard: true,
  });

  const isUploading = upload.isPending || pendingCount > 0;

  return (
    <section className="space-y-3" aria-label="Anexos em PDF">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-sm font-medium">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            Anexos em PDF
          </h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Apenas arquivos PDF, até {formatFileSize(MAX_ATTACHMENT_SIZE)} cada.
          </p>
        </div>
      </header>

      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 px-4 py-6 text-center transition-colors",
          isDragActive && "border-primary bg-primary/5",
          (disabled || isUploading) && "opacity-60"
        )}
      >
        <input
          {...getInputProps({
            ref: inputRef,
            "aria-label": "Selecionar arquivos PDF",
          })}
        />
        <UploadCloud
          className={cn(
            "h-7 w-7",
            isDragActive ? "text-primary" : "text-muted-foreground"
          )}
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-sm">
            {isDragActive
              ? "Solte os PDFs aqui…"
              : "Arraste os PDFs ou clique abaixo para selecionar."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Paperclip className="h-4 w-4" />
            )}
            {isUploading ? "Enviando…" : "Anexar PDF"}
          </Button>
        </div>
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum anexo enviado para este atestado.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Lista de anexos">
          {attachments.map((att) => (
            <li key={att.id}>
              <MedicalCertificateAttachmentItem
                attachment={att}
                onRemove={(id) => remove.mutate(id)}
                isRemoving={remove.isPending && remove.variables === att.id}
                disabled={disabled}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
