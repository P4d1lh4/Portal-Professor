from datetime import date, datetime
from pydantic import BaseModel, field_validator


def _check_enrollment_date(v: date | None) -> date | None:
    """Rejeita data de matrícula futura ou absurdamente antiga (provável erro)."""
    if v is None:
        return v
    today = date.today()
    if v > today:
        raise ValueError("A data de matrícula não pode ser futura.")
    if v < date(today.year - 50, 1, 1):
        raise ValueError("Data de matrícula inválida (muito antiga).")
    return v


class ModuleGradeSummary(BaseModel):
    module_id: str
    module_name: str
    module_code: str
    enrollment_id: str
    enrollment_status: str
    final_grade: float
    absences: int
    max_absences: int


class Student(BaseModel):
    id: str
    student_number: str
    full_name: str
    email: str | None = None
    academic_period_id: str
    enrollment_date: date
    medical_certificates: int
    referral_info: str | None = None
    observations: str | None = None
    is_active: bool
    created_at: datetime


class StudentDetail(Student):
    enrolled_modules: list[ModuleGradeSummary] = []
    total_absences: int = 0
    avg_final_grade: float | None = None


class StudentCreate(BaseModel):
    student_number: str
    full_name: str
    email: str | None = None
    enrollment_date: date
    medical_certificates: int = 0
    referral_info: str | None = None
    observations: str | None = None
    is_active: bool = True

    _validate_enrollment_date = field_validator("enrollment_date")(
        _check_enrollment_date
    )


class StudentUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    enrollment_date: date | None = None
    medical_certificates: int | None = None
    referral_info: str | None = None
    observations: str | None = None
    is_active: bool | None = None

    _validate_enrollment_date = field_validator("enrollment_date")(
        _check_enrollment_date
    )


class AbsenceUpdate(BaseModel):
    medical_certificates: int | None = None
