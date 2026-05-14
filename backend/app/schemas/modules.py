from datetime import datetime
from pydantic import BaseModel


class ProfessorRef(BaseModel):
    id: str
    full_name: str


class PeriodRef(BaseModel):
    id: str
    name: str


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
    credits: int = 4
    max_absences: int = 10
    is_active: bool = True


class ModuleUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    professor_id: str | None = None
    credits: int | None = None
    max_absences: int | None = None
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
