import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, ExternalLink, FileText, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatFileSize } from "@/lib/utils";
import type { MedicalCertificateAttachment } from "@/types";

interface Props {
  attachment: MedicalCertificateAttachment;
  onRemove: (id: string) => void;
  isRemoving?: boolean;
  disabled?: boolean;
}

export function MedicalCertificateAttachmentItem({
  attachment,
  onRemove,
  isRemoving = false,
  disabled = false,
}: Props) {
  const [confirming, setConfirming] = useState(false);

  const handleOpen = () => {
    if (!attachment.file_url) return;
    window.open(attachment.file_url, "_blank", "noopener,noreferrer");
  };

  const handleDownload = () => {
    if (!attachment.file_url) return;
    const a = document.createElement("a");
    a.href = attachment.file_url;
    a.download = attachment.file_name;
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleRemove = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    onRemove(attachment.id);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive"
          aria-hidden
        >
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={attachment.file_name}>
            {attachment.file_name}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatFileSize(attachment.file_size)} ·{" "}
            {format(new Date(attachment.uploaded_at), "dd/MM/yyyy HH:mm", {
              locale: ptBR,
            })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleOpen}
          aria-label={`Visualizar ${attachment.file_name}`}
          disabled={!attachment.file_url || disabled}
        >
          <ExternalLink className="h-4 w-4" />
          <span className="hidden sm:inline">Visualizar</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDownload}
          aria-label={`Baixar ${attachment.file_name}`}
          disabled={!attachment.file_url || disabled}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Baixar</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRemove}
          onBlur={() => setConfirming(false)}
          disabled={isRemoving || disabled}
          aria-label={`Remover ${attachment.file_name}`}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">
            {confirming ? "Confirmar?" : "Remover"}
          </span>
        </Button>
      </div>
    </div>
  );
}
