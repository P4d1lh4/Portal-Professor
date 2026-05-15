from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


# Limite de 10 MB por anexo (igual à constraint do banco)
MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
ALLOWED_MIME_TYPE: Literal["application/pdf"] = "application/pdf"


class MedicalCertificateAttachment(BaseModel):
    id: str
    certificate_id: str
    file_name: str
    file_size: int
    mime_type: Literal["application/pdf"] = "application/pdf"
    file_url: str
    uploaded_at: datetime
    uploaded_by: str | None = None


class MedicalCertificateBase(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)
    start_date: date
    end_date: date
    notes: str | None = None

    @field_validator("end_date")
    @classmethod
    def _end_after_start(cls, v: date, info) -> date:
        start = info.data.get("start_date")
        if start and v < start:
            raise ValueError("A data final não pode ser anterior à inicial.")
        return v


class MedicalCertificateCreate(MedicalCertificateBase):
    pass


class MedicalCertificateUpdate(BaseModel):
    reason: str | None = Field(None, min_length=1, max_length=500)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class MedicalCertificate(MedicalCertificateBase):
    id: str
    student_id: str
    created_by: str | None = None
    created_at: datetime
    updated_at: datetime
    attachments: list[MedicalCertificateAttachment] = []
