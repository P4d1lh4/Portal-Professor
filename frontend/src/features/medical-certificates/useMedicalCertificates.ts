import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { STUDENTS_KEY } from "@/features/students/useStudents";
import {
  medicalCertificatesApi,
  type MedicalCertificatePayload,
} from "./api";

export const MEDICAL_CERTIFICATES_KEY = ["medical-certificates"] as const;

export function useMedicalCertificates(studentId: string | undefined) {
  return useQuery({
    queryKey: [...MEDICAL_CERTIFICATES_KEY, { studentId }],
    queryFn: () => medicalCertificatesApi.listByStudent(studentId!),
    enabled: !!studentId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, studentId?: string) {
  qc.invalidateQueries({ queryKey: MEDICAL_CERTIFICATES_KEY });
  // O contador medical_certificates dos alunos é sincronizado por trigger —
  // invalidamos a lista/detalhe para refletir o novo total na UI.
  qc.invalidateQueries({ queryKey: STUDENTS_KEY });
  if (studentId) {
    qc.invalidateQueries({ queryKey: [...STUDENTS_KEY, studentId] });
  }
}

export function useCreateMedicalCertificate(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MedicalCertificatePayload) =>
      medicalCertificatesApi.create(studentId, body),
    onSuccess: () => {
      invalidate(qc, studentId);
      toast.success("Atestado adicionado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateMedicalCertificate(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<MedicalCertificatePayload>;
    }) => medicalCertificatesApi.update(id, body),
    onSuccess: () => {
      invalidate(qc, studentId);
      toast.success("Atestado atualizado com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDeleteMedicalCertificate(studentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => medicalCertificatesApi.remove(id),
    onSuccess: () => {
      invalidate(qc, studentId);
      toast.success("Atestado removido com sucesso.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
