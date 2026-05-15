import api from "@/lib/axios";
import type {
  MedicalCertificate,
  MedicalCertificateAttachment,
} from "@/types";

export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPE = "application/pdf" as const;

export interface MedicalCertificatePayload {
  reason: string;
  start_date: string;
  end_date: string;
  notes?: string;
}

export const medicalCertificatesApi = {
  listByStudent: (studentId: string) =>
    api
      .get<MedicalCertificate[]>(
        `/api/students/${studentId}/medical-certificates`
      )
      .then((r) => r.data),

  create: (studentId: string, body: MedicalCertificatePayload) =>
    api
      .post<MedicalCertificate>(
        `/api/students/${studentId}/medical-certificates`,
        body
      )
      .then((r) => r.data),

  update: (certificateId: string, body: Partial<MedicalCertificatePayload>) =>
    api
      .put<MedicalCertificate>(
        `/api/medical-certificates/${certificateId}`,
        body
      )
      .then((r) => r.data),

  remove: (certificateId: string) =>
    api.delete(`/api/medical-certificates/${certificateId}`),

  listAttachments: (certificateId: string) =>
    api
      .get<MedicalCertificateAttachment[]>(
        `/api/medical-certificates/${certificateId}/attachments`
      )
      .then((r) => r.data),

  uploadAttachment: (certificateId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<MedicalCertificateAttachment>(
        `/api/medical-certificates/${certificateId}/attachments`,
        form,
        { headers: { "Content-Type": "multipart/form-data" } }
      )
      .then((r) => r.data);
  },

  removeAttachment: (certificateId: string, attachmentId: string) =>
    api.delete(
      `/api/medical-certificates/${certificateId}/attachments/${attachmentId}`
    ),
};
