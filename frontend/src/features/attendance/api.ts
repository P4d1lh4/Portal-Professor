import api from "@/lib/axios";

export type AttendanceStatus = "present" | "absent" | "justified";

export interface AttendanceEntryWithStudent {
  enrollment_id: string;
  student_id: string;
  student_number: string;
  full_name: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface AttendanceDayDraft {
  module_id: string;
  attendance_date: string;
  record_id: string | null;
  notes: string | null;
  entries: AttendanceEntryWithStudent[];
}

export interface AttendanceSummary {
  id: string;
  module_id: string;
  attendance_date: string;
  total_present: number;
  total_absent: number;
  total_justified: number;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  module_id: string;
  attendance_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceEntryInput {
  enrollment_id: string;
  status: AttendanceStatus;
  notes?: string | null;
}

export interface AttendanceSavePayload {
  notes?: string | null;
  entries: AttendanceEntryInput[];
}

export const attendanceApi = {
  list: (moduleId: string) =>
    api
      .get<AttendanceSummary[]>(`/api/modules/${moduleId}/attendance`)
      .then((r) => r.data),

  getDay: (moduleId: string, date: string) =>
    api
      .get<AttendanceDayDraft>(`/api/modules/${moduleId}/attendance/${date}`)
      .then((r) => r.data),

  save: (moduleId: string, date: string, body: AttendanceSavePayload) =>
    api
      .put<AttendanceRecord>(
        `/api/modules/${moduleId}/attendance/${date}`,
        body,
      )
      .then((r) => r.data),

  remove: (moduleId: string, date: string) =>
    api.delete(`/api/modules/${moduleId}/attendance/${date}`),
};
