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

export interface PeriodUpdate extends Partial<PeriodCreate> {}

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

  delete: (id: string) => api.delete(`/api/periods/${id}`),
};
