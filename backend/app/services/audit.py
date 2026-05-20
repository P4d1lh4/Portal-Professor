"""Helper para escrever entradas no audit_log.

A escrita é best-effort: se a tabela ainda não existir (migração não
aplicada) ou se houver falha transitória, o log emite warning mas a
ação principal NÃO falha por causa do log.
"""
from __future__ import annotations

import logging
from typing import Any

from ..schemas.audit import AuditAction
from ..schemas.users import Profile

logger = logging.getLogger(__name__)


def _diff_payload(
    before: dict[str, Any] | None, after: dict[str, Any] | None
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Reduz before/after para apenas os campos que mudaram, evitando
    armazenar JSON gigantes redundantes."""
    if before is None or after is None:
        return before, after

    changed_keys = {
        k for k in set(before.keys()) | set(after.keys())
        if before.get(k) != after.get(k)
    }
    if not changed_keys:
        return None, None

    return (
        {k: before.get(k) for k in changed_keys},
        {k: after.get(k) for k in changed_keys},
    )


def write_audit_log(
    db,
    *,
    actor: Profile,
    action: AuditAction,
    entity: str,
    entity_id: str,
    summary: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    """Insere uma entrada no audit_log usando o cliente admin do Supabase.

    `entity` é uma string curta identificando a tabela ("grades",
    "students", "modules", "periods", etc). `summary` é uma frase
    curta em pt-BR descrevendo a ação para exibição direta na UI.
    """
    before_diff, after_diff = _diff_payload(before, after)

    payload = {
        "actor_id": actor.id,
        "actor_name": actor.full_name,
        "actor_role": actor.role,
        "action": action,
        "entity": entity,
        "entity_id": str(entity_id),
        "summary": summary,
        "before_data": before_diff,
        "after_data": after_diff,
    }

    try:
        db.table("audit_log").insert(payload).execute()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Falha ao gravar audit_log: %s", exc)
