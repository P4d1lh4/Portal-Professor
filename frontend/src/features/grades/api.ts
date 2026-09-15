import api from "@/lib/axios";

export interface GradeRow {
  id: string;
  enrollment_id: string;
  tutor_grade: number;
  regular_exam_grade: number;
  makeup_exam_grade: number;
  final_grade: number;
  absences: number;
  last_updated: string;
}

export interface GradeUpdate {
  tutor_grade?: number | null;
  regular_exam_grade?: number | null;
  makeup_exam_grade?: number | null;
  absences?: number | null;
}

// Matches the backend StudentGradeInfo schema (flat, from /api/modules/{id}/students)
export interface StudentGradeRow {
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
  /** Motivos de alerta calculados no backend: "faltas" e/ou "nota" (P-N1). */
  risk?: string[];
}

export interface GradesImportResult {
  updated: number;
  not_found: string[];
  invalid: { line: number; error: string }[];
}

export const gradesApi = {
  getByModule: (moduleId: string) =>
    api
      .get<StudentGradeRow[]>(`/api/modules/${moduleId}/students`)
      .then((r) => r.data),

  update: (enrollmentId: string, body: GradeUpdate) =>
    api
      .put<GradeRow>(`/api/grades/${enrollmentId}`, body)
      .then((r) => r.data),

  importCsv: (moduleId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post<GradesImportResult>(`/api/modules/${moduleId}/grades/import`, form)
      .then((r) => r.data);
  },
};
