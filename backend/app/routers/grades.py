from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.users import Profile
from ..schemas.grades import Grade, GradeUpdate

router = APIRouter(tags=["grades"])

_ANY_ROLE = require_role("professor", "coordinator", "admin")


def _recalc_final(regular: float, makeup: float) -> float:
    if makeup > 0:
        return round(max(regular, makeup), 2)
    return round(regular, 2)


async def _get_grade_with_permission(enrollment_id: str, current_user: Profile) -> dict:
    db = get_admin_db()

    row = (
        db.table("grades")
        .select("*, enrollment:enrollments!enrollment_id(module_id, student_id)")
        .eq("enrollment_id", enrollment_id)
        .maybe_single()
        .execute()
    )
    if not row.data:
        raise HTTPException(404, "Nota não encontrada.")

    grade = row.data
    module_id = grade["enrollment"]["module_id"]

    if current_user.role == "professor":
        mod = (
            db.table("modules")
            .select("id")
            .eq("id", module_id)
            .eq("professor_id", current_user.id)
            .maybe_single()
            .execute()
        )
        if not mod.data:
            raise HTTPException(403, "Você não tem permissão para editar notas deste módulo.")

    return grade


@router.get("/api/grades/{enrollment_id}", response_model=Grade)
async def get_grade(
    enrollment_id: str,
    current_user: Profile = Depends(_ANY_ROLE),
):
    grade = await _get_grade_with_permission(enrollment_id, current_user)
    return grade


@router.put("/api/grades/{enrollment_id}", response_model=Grade)
async def update_grade(
    enrollment_id: str,
    body: GradeUpdate,
    current_user: Profile = Depends(_ANY_ROLE),
):
    db = get_admin_db()
    grade = await _get_grade_with_permission(enrollment_id, current_user)

    patch: dict = {}
    if body.tutor_grade is not None:
        patch["tutor_grade"] = body.tutor_grade
    if body.regular_exam_grade is not None:
        patch["regular_exam_grade"] = body.regular_exam_grade
    if body.makeup_exam_grade is not None:
        patch["makeup_exam_grade"] = body.makeup_exam_grade
    if body.absences is not None:
        patch["absences"] = body.absences

    if not patch:
        return grade

    current_regular = patch.get("regular_exam_grade", grade["regular_exam_grade"])
    current_makeup = patch.get("makeup_exam_grade", grade["makeup_exam_grade"])
    patch["final_grade"] = _recalc_final(current_regular, current_makeup)
    patch["last_updated"] = datetime.now(timezone.utc).isoformat()

    updated = (
        db.table("grades")
        .update(patch)
        .eq("enrollment_id", enrollment_id)
        .select()
        .single()
        .execute()
    )
    return updated.data
