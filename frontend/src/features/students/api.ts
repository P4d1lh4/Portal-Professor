import api from "@/lib/axios";

export interface ModuleGradeSummary {
  module_id: string;
  module_name: string;
  module_code: string;
  enrollment_id: string;
  enrollment_status: string;
  final_grade: number;
  absences: number;
  max_absences: number;
}

export interface StudentItem {
  id: string;
  student_number: string;
  full_name: string;
  email?: string;
  academic_period_id: string;
  enrollment_date: string;
  medical_certificates: number;
  referral_info?: string;
  observations?: string;
  is_active: boolean;
  created_at: string;
  enrolled_modules?: ModuleGradeSummary[];
  total_absences?: number;
  avg_final_grade?: number | null;
}

export interface StudentCreate {
  student_number: string;
  full_name: string;
  email?: string;
  enrollment_date: string;
  medical_certificates?: number;
  referral_info?: string;
  observations?: string;
}

export interface StudentUpdate extends Partial<StudentCreate> {
  is_active?: boolean;
}

export interface ListPeriodStudentsParams {
  search?: string;
  active_only?: boolean;
  limit?: number;
  offset?: number;
}

export interface PaginatedStudents {
  items: StudentItem[];
  total: number;
  limit: number;
  offset: number;
}

export const studentsApi = {
  listByPeriod: (periodId: string, params: ListPeriodStudentsParams = {}) =>
    api
      .get<PaginatedStudents>(`/api/periods/${periodId}/students`, { params })
      .then((r) => r.data),

  listProfessor: () =>
    api.get<StudentItem[]>("/api/professor/students").then((r) => r.data),

  getDetail: (studentId: string) =>
    api
      .get<StudentItem>(`/api/professor/students/${studentId}`)
      .then((r) => r.data),

  createInPeriod: (periodId: string, body: StudentCreate) =>
    api
      .post<StudentItem>(`/api/periods/${periodId}/students`, body)
      .then((r) => r.data),

  createProfessor: (body: StudentCreate) =>
    api
      .post<StudentItem>("/api/professor/students", body)
      .then((r) => r.data),

  update: (studentId: string, body: StudentUpdate) =>
    api
      .put<StudentItem>(`/api/professor/students/${studentId}`, body)
      .then((r) => r.data),

  deactivate: (studentId: string) =>
    api.delete(`/api/professor/students/${studentId}`),
};
