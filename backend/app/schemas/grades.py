from datetime import datetime
from pydantic import BaseModel, field_validator


class GradeUpdate(BaseModel):
    tutor_grade: float | None = None
    regular_exam_grade: float | None = None
    makeup_exam_grade: float | None = None
    absences: int | None = None

    @field_validator(
        "tutor_grade", "regular_exam_grade", "makeup_exam_grade", mode="before"
    )
    @classmethod
    def clamp_grade(cls, v: float | None) -> float | None:
        if v is None:
            return v
        return round(max(0.0, min(10.0, float(v))), 2)

    @field_validator("absences", mode="before")
    @classmethod
    def clamp_absences(cls, v: int | None) -> int | None:
        if v is None:
            return v
        return max(0, int(v))


class Grade(BaseModel):
    id: str
    enrollment_id: str
    tutor_grade: float
    regular_exam_grade: float
    makeup_exam_grade: float
    final_grade: float
    absences: int
    last_updated: datetime
