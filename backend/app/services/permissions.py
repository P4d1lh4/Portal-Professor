"""Helpers canônicos de autorização (camada de aplicação).

A API usa service role (bypassa RLS), então o isolamento por papel é garantido
aqui — não no banco. Centralizar as checagens evita que cópias divirjam
silenciosamente (a melhoria [A2] mostrou o risco concreto disso).
"""
from fastapi import HTTPException

from ..schemas.users import Profile


def assert_coordinator_owns_period(
    db,
    period_id: str,
    current_user: Profile,
    *,
    detail: str = "Você não tem permissão para este período.",
) -> None:
    """Se o usuário é coordenador, exige que ele coordene o período (senão 403).

    No-op para os demais papéis: o `require_role` do endpoint já restringe quem
    chega aqui, e admin não é escopado por período. Não cobre o caso do professor
    (períodos que ele leciona) — isso segue em `periods._assert_period_access`,
    que usa 404 de propósito.
    """
    if current_user.role != "coordinator":
        return
    chk = (
        db.table("academic_periods")
        .select("id")
        .eq("id", period_id)
        .eq("coordinator_id", current_user.id)
        .maybe_single()
        .execute()
    )
    if not chk.data:
        raise HTTPException(status_code=403, detail=detail)
