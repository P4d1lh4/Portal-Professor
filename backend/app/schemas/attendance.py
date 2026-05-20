from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


AttendanceStatus = Literal["present", "absent", "justified"]


class AttendanceEntryBase(BaseModel):
    enrollment_id: str
    status: AttendanceStatus = "present"
    notes: str | None = None


class AttendanceEntryInput(AttendanceEntryBase):
    """Payload de uma entrada ao salvar uma chamada em lote."""


class AttendanceEntry(AttendanceEntryBase):
    id: str
    attendance_record_id: str
    created_at: datetime
    updated_at: datetime


class AttendanceEntryWithStudent(BaseModel):
    """Linha exibida na tela de chamada: aluno + status (pode estar ausente)."""

    enrollment_id: str
    student_id: str
    student_number: str
    full_name: str
    status: AttendanceStatus = "present"
    notes: str | None = None


class AttendanceRecordSave(BaseModel):
    notes: str | None = None
    entries: list[AttendanceEntryInput] = Field(default_factory=list)


class AttendanceRecord(BaseModel):
    id: str
    module_id: str
    attendance_date: date
    notes: str | None = None
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime


class AttendanceRecordDetail(AttendanceRecord):
    entries: list[AttendanceEntryWithStudent] = []


class AttendanceDayDraft(BaseModel):
    """Resposta de GET quando ainda não há chamada para a data — retorna
    a lista de alunos elegíveis com status default 'present' para edição."""

    module_id: str
    attendance_date: date
    record_id: str | None = None
    notes: str | None = None
    entries: list[AttendanceEntryWithStudent] = []


class AttendanceSummary(BaseModel):
    """Resumo de uma chamada na listagem."""

    id: str
    module_id: str
    attendance_date: date
    total_present: int
    total_absent: int
    total_justified: int
    notes: str | None = None
    created_at: datetime
    updated_at: datetime
