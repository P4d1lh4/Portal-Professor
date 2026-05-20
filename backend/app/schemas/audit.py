from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from .users import UserRole


AuditAction = Literal["insert", "update", "delete"]


class AuditLogEntry(BaseModel):
    id: str
    actor_id: str | None = None
    actor_name: str
    actor_role: UserRole
    action: AuditAction
    entity: str
    entity_id: str
    summary: str
    before_data: dict[str, Any] | None = None
    after_data: dict[str, Any] | None = None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogEntry]
    total: int
    limit: int
    offset: int
