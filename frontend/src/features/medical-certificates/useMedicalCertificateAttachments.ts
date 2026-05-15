import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ALLOWED_MIME_TYPE,
  MAX_ATTACHMENT_SIZE,
  medicalCertificatesApi,
} from "./api";
import { MEDICAL_CERTIFICATES_KEY } from "./useMedicalCertificates";

export interface AttachmentValidationError {
  file: File;
  reason: "mime" | "size";
  message: string;
}

export function validateAttachment(file: File): AttachmentValidationError | null {
  const isPdf =
    file.type === ALLOWED_MIME_TYPE ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return {
      file,
      reason: "mime",
      message: "Apenas arquivos PDF são permitidos.",
    };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return {
      file,
      reason: "size",
      message: "O arquivo excede o limite de 10 MB.",
    };
  }
  return null;
}

export function useUploadAttachment(certificateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      medicalCertificatesApi.uploadAttachment(certificateId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDICAL_CERTIFICATES_KEY });
      toast.success("PDF anexado com sucesso.");
    },
    onError: (err: Error) =>
      toast.error(err.message || "Falha ao enviar o arquivo."),
  });
}

export function useDeleteAttachment(certificateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      medicalCertificatesApi.removeAttachment(certificateId, attachmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDICAL_CERTIFICATES_KEY });
      toast.success("Anexo removido com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
