"""Endpoint de leitura do audit_log. Apenas admin lê o histórico completo;
coordenador e professor veem suas próprias ações."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..db import get_admin_db
from ..deps import get_current_user
from ..schemas.audit import AuditLogEntry, AuditLogPage
from ..schemas.users import Profile

router = APIRouter(prefix="/api", tags=["auditoria"])


@router.get("/audit-log", response_model=AuditLogPage)
async def list_audit_log(
    entity: str | None = Query(None, description="Filtrar por entidade"),
    actor_id: str | None = Query(None, description="Filtrar por autor"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: Profile = Depends(get_current_user),
) -> AuditLogPage:
    db = get_admin_db()
    q = db.table("audit_log").select("*", count="exact")

    # Não-admin: força filtro pelo próprio actor_id
    if current_user.role != "admin":
        q = q.eq("actor_id", current_user.id)
    elif actor_id:
        q = q.eq("actor_id", actor_id)

    if entity:
        q = q.eq("entity", entity)

    resp = q.order("created_at", desc=True).range(offset, offset + limit - 1).execute()

    items = [AuditLogEntry(**row) for row in resp.data]
    total = resp.count or len(items)

    return AuditLogPage(items=items, total=total, limit=limit, offset=offset)
