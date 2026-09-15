import api from "@/lib/axios";
import type { AcademicPeriod } from "@/types";

export interface PeriodWithCoordinator extends AcademicPeriod {
  coordinator?: { id: string; full_name: string };
}

export interface PeriodCreate {
  name: string;
  coordinator_id: string;
  start_date?: string;
  end_date?: string;
  is_active?: boolean;
}

export type PeriodUpdate = Partial<PeriodCreate>;

/** O que a exclusão do período apaga junto. Coordenador e professores só
 *  perdem o vínculo: as contas continuam. */
export interface PeriodDeletionSummary {
  name: string;
  coordinator: string | null;
  professors: string[];
  students: number;
  modules: number;
  enrollments: number;
  attendance_records: number;
  medical_certificates: number;
  attachments: number;
}

export const periodsApi = {
  list: () =>
    api.get<PeriodWithCoordinator[]>("/api/periods").then((r) => r.data),

  listActive: () =>
    api.get<PeriodWithCoordinator[]>("/api/periods/active").then((r) => r.data),

  get: (id: string) =>
    api.get<PeriodWithCoordinator>(`/api/periods/${id}`).then((r) => r.data),

  create: (body: PeriodCreate) =>
    api.post<PeriodWithCoordinator>("/api/periods", body).then((r) => r.data),

  update: (id: string, body: PeriodUpdate) =>
    api.put<PeriodWithCoordinator>(`/api/periods/${id}`, body).then((r) => r.data),

  deletionSummary: (id: string) =>
    api
      .get<PeriodDeletionSummary>(`/api/periods/${id}/deletion-summary`)
      .then((r) => r.data),

  /** Apaga o período e tudo o que é dele; a tela mostra antes o resumo. */
  delete: (id: string) =>
    api.delete(`/api/periods/${id}`, { params: { cascade: true } }),

  /** Cria um período novo com cópia dos módulos ativos de `id` (P-Q5). */
  clone: (id: string, body: PeriodCreate) =>
    api
      .post<PeriodWithCoordinator>(`/api/periods/${id}/clone`, body)
      .then((r) => r.data),
};
