from datetime import date, datetime
from pydantic import BaseModel, Field


class ProfessorRef(BaseModel):
    id: str
    full_name: str


class PeriodRef(BaseModel):
    id: str
    name: str
    is_active: bool | None = None


class Module(BaseModel):
    id: str
    name: str
    code: str
    professor_id: str
    professor: ProfessorRef | None = None
    academic_period_id: str
    academic_period: PeriodRef | None = None
    credits: int
    max_absences: int
    is_active: bool
    created_at: datetime


class ModuleCreate(BaseModel):
    name: str
    code: str
    professor_id: str
    academic_period_id: str
    # Espelham os CHECK da 0008 (credits > 0, max_absences >= 0): sem isto, o
    # erro chegava como 500, não 422.
    credits: int = Field(4, gt=0)
    max_absences: int = Field(10, ge=0)
    is_active: bool = True


class ModuleUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    professor_id: str | None = None
    credits: int | None = Field(None, gt=0)
    max_absences: int | None = Field(None, ge=0)
    is_active: bool | None = None


class StudentGradeInfo(BaseModel):
    """Aluno matriculado em um módulo, com suas notas."""
    enrollment_id: str
    student_id: str
    student_number: str
    full_name: str
    email: str | None = None
    enrollment_status: str
    tutor_grade: float
    regular_exam_grade: float
    makeup_exam_grade: float
    final_grade: float
    absences: int
    last_updated: datetime | None = None
    # Motivos de alerta (services/classification.risk_reasons): "faltas", "nota".
    risk: list[str] = []


class EnrollmentCreate(BaseModel):
    student_id: str


class Enrollment(BaseModel):
    id: str
    student_id: str
    module_id: str
    status: str
    enrollment_date: date
