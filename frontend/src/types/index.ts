export type UserRole = "admin" | "coordinator" | "professor";
export type EnrollmentStatus = "active" | "dropped" | "completed";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicPeriod {
  id: string;
  name: string;
  coordinator_id: string;
  start_date?: string;
  end_date?: string;
  is_active: boolean;
  csv_sync_url?: string;
  csv_last_sync?: string;
  created_at: string;
}

export interface Student {
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
}

export interface Module {
  id: string;
  name: string;
  code: string;
  professor_id: string;
  academic_period_id: string;
  credits: number;
  max_absences: number;
  is_active: boolean;
  created_at: string;
}

export interface Enrollment {
  id: string;
  student_id: string;
  module_id: string;
  enrollment_date: string;
  status: EnrollmentStatus;
  created_at: string;
}

export interface Grade {
  id: string;
  enrollment_id: string;
  tutor_grade: number;
  regular_exam_grade: number;
  makeup_exam_grade: number;
  final_grade: number;
  absences: number;
  last_updated: string;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

export interface MedicalCertificateAttachment {
  id: string;
  certificate_id: string;
  file_name: string;
  file_size: number;
  mime_type: "application/pdf";
  file_url: string;
  uploaded_at: string;
  uploaded_by?: string;
}

export interface MedicalCertificate {
  id: string;
  student_id: string;
  reason: string;
  start_date: string;
  end_date: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  attachments: MedicalCertificateAttachment[];
}
