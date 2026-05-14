import api from "@/lib/axios";

export interface ModuleProfessor {
  id: string;
  full_name: string;
}

export interface ModulePeriod {
  id: string;
  name: string;
}

export interface ModuleItem {
  id: string;
  name: string;
  code: string;
  professor_id: string;
  professor?: ModuleProfessor;
  academic_period_id: string;
  academic_period?: ModulePeriod;
  credits: number;
  max_absences: number;
  is_active: boolean;
  created_at: string;
}

export interface StudentGradeInfo {
  enrollment_id: string;
  student_id: string;
  student_number: string;
  full_name: string;
  email?: string;
  enrollment_status: string;
  tutor_grade: number;
  regular_exam_grade: number;
  makeup_exam_grade: number;
  final_grade: number;
  absences: number;
  last_updated?: string;
}

export interface ModuleCreate {
  name: string;
  code: string;
  professor_id: string;
  academic_period_id: string;
  credits?: number;
  max_absences?: number;
  is_active?: boolean;
}

export interface ModuleUpdate extends Partial<Omit<ModuleCreate, "academic_period_id">> {}

export const modulesApi = {
  list: (periodId?: string) =>
    api
      .get<ModuleItem[]>("/api/modules", {
        params: periodId ? { period_id: periodId } : undefined,
      })
      .then((r) => r.data),

  get: (id: string) =>
    api.get<ModuleItem>(`/api/modules/${id}`).then((r) => r.data),

  getStudents: (moduleId: string) =>
    api
      .get<StudentGradeInfo[]>(`/api/modules/${moduleId}/students`)
      .then((r) => r.data),

  create: (body: ModuleCreate) =>
    api.post<ModuleItem>("/api/modules", body).then((r) => r.data),

  createForPeriod: (periodId: string, body: ModuleCreate) =>
    api
      .post<ModuleItem>(`/api/coordinator/periods/${periodId}/modules`, body)
      .then((r) => r.data),

  update: (id: string, body: ModuleUpdate) =>
    api.put<ModuleItem>(`/api/modules/${id}`, body).then((r) => r.data),

  delete: (id: string) => api.delete(`/api/modules/${id}`),
};
