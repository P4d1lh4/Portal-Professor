from datetime import date, datetime
from pydantic import BaseModel


class CoordinatorRef(BaseModel):
    id: str
    full_name: str


class Period(BaseModel):
    id: str
    name: str
    coordinator_id: str
    coordinator: CoordinatorRef | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool
    csv_sync_url: str | None = None
    csv_last_sync: datetime | None = None
    created_at: datetime


class PeriodCreate(BaseModel):
    name: str
    coordinator_id: str
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool = True


class PeriodDeletionSummary(BaseModel):
    """O que a exclusão do período apaga junto. Coordenador e professores só
    perdem o vínculo: as contas continuam."""
    name: str
    coordinator: str | None = None
    professors: list[str]
    students: int
    modules: int
    enrollments: int
    attendance_records: int
    medical_certificates: int
    attachments: int


class PeriodUpdate(BaseModel):
    name: str | None = None
    coordinator_id: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None
    csv_sync_url: str | None = None
