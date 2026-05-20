"""Guards de regra de negócio reutilizáveis entre routers."""
from __future__ import annotations

from fastapi import HTTPException, status

from ..schemas.users import Profile


def is_period_active_for_module(db, module_id: str) -> bool:
    """Retorna True se o período acadêmico do módulo está ativo.

    Se o módulo ou o período não forem encontrados, considera inativo
    (fail-safe — não permite edição em estado inconsistente).
    """
    resp = (
        db.table("modules")
        .select("academic_period:academic_periods!academic_period_id(is_active)")
        .eq("id", module_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        return False
    period = resp.data.get("academic_period") or {}
    return bool(period.get("is_active", False))


def assert_module_period_active(db, module_id: str, current_user: Profile) -> None:
    """Bloqueia edição se o período do módulo está inativo (fechado).

    Admin é exceção: pode corrigir mesmo com período fechado (a ação fica
    registrada no audit_log). Professor e coordenador são bloqueados.
    """
    if current_user.role == "admin":
        return
    if not is_period_active_for_module(db, module_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Este período acadêmico está encerrado. "
                "As notas e faltas não podem mais ser alteradas. "
                "Solicite ao administrador, se necessário."
            ),
        )
