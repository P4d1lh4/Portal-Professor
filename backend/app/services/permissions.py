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


def assert_can_access_student(db, current_user: Profile, student_id: str) -> None:
    """Acesso a um aluno: professor precisa lecionar para ele; coordenador, que
    ele esteja num período seu; admin, livre. Única barreira em runtime."""
    if current_user.role == "professor":
        assert_professor_has_student(db, current_user.id, student_id)
    elif current_user.role == "coordinator":
        resp = (
            db.table("students")
            .select("academic_period_id")
            .eq("id", student_id)
            .maybe_single()
            .execute()
        )
        if not resp.data:
            raise HTTPException(404, "Aluno não encontrado.")
        assert_coordinator_owns_period(
            db, resp.data["academic_period_id"], current_user,
            detail="Você não tem permissão para acessar este aluno.",
        )


def assert_professor_has_student(db, professor_id: str, student_id: str) -> None:
    """O aluno precisa estar matriculado em pelo menos um módulo do professor."""
    modules = (
        db.table("modules")
        .select("id")
        .eq("professor_id", professor_id)
        .execute()
    )
    module_ids = [m["id"] for m in modules.data]
    if not module_ids:
        raise HTTPException(403, "Acesso negado.")

    enrollment = (
        db.table("enrollments")
        .select("id", count="exact")
        .in_("module_id", module_ids)
        .eq("student_id", student_id)
        .execute()
    )
    if (enrollment.count or 0) == 0:
        raise HTTPException(403, "Acesso negado.")


def assert_module_access(db, current_user: Profile, module_id: str) -> dict:
    """Acesso a um módulo: professor só o próprio; coordenador, os dos seus
    períodos; admin, qualquer um. Devolve a linha do módulo (404 se não existe).

    Chamada, exports e import de notas usavam cópias desta checagem."""
    mod = (
        db.table("modules")
        .select("id, name, code, professor_id, max_absences, academic_period_id")
        .eq("id", module_id)
        .maybe_single()
        .execute()
    )
    if not mod.data:
        raise HTTPException(404, "Módulo não encontrado.")

    if current_user.role == "professor" and mod.data["professor_id"] != current_user.id:
        raise HTTPException(403, "Você não leciona este módulo.")
    assert_coordinator_owns_period(
        db, mod.data["academic_period_id"], current_user,
        detail="Você não coordena este período.",
    )
    return mod.data
