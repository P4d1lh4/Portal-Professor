"""Endpoints de exportação CSV: alunos do período e notas do módulo."""
from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.users import Profile
from ..services.exports import (
    GradeExportRow,
    StudentExportRow,
    build_grades_csv,
    build_students_csv,
    classify,
)

router = APIRouter(prefix="/api", tags=["exportações"])

_ANY_ROLE = require_role("professor", "coordinator", "admin")
_COORD_ADMIN = require_role("coordinator", "admin")


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return normalized or "documento"


def _csv_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


# ---------------------------------------------------------------
# Alunos de um período
# ---------------------------------------------------------------

@router.get("/periods/{period_id}/students/export.csv")
async def export_period_students(
    period_id: str,
    active_only: bool = True,
    current_user: Profile = Depends(_COORD_ADMIN),
):
    db = get_admin_db()

    period = (
        db.table("academic_periods")
        .select("id, name, coordinator_id")
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not period.data:
        raise HTTPException(404, "Período não encontrado.")

    if (
        current_user.role == "coordinator"
        and period.data["coordinator_id"] != current_user.id
    ):
        raise HTTPException(403, "Você não coordena este período.")

    q = (
        db.table("students")
        .select(
            "student_number, full_name, email, enrollment_date, "
            "is_active, medical_certificates, referral_info, observations"
        )
        .eq("academic_period_id", period_id)
    )
    if active_only:
        q = q.eq("is_active", True)
    resp = q.order("full_name").execute()

    rows = [
        StudentExportRow(
            student_number=r.get("student_number", ""),
            full_name=r.get("full_name", ""),
            email=r.get("email"),
            enrollment_date=str(r.get("enrollment_date") or ""),
            is_active=bool(r.get("is_active", True)),
            medical_certificates=int(r.get("medical_certificates", 0)),
            referral_info=r.get("referral_info"),
            observations=r.get("observations"),
        )
        for r in resp.data
    ]

    csv_bytes = build_students_csv(rows)
    filename = f"alunos-{_slugify(period.data['name'])}.csv"
    return _csv_response(csv_bytes, filename)


# ---------------------------------------------------------------
# Notas de um módulo
# ---------------------------------------------------------------

@router.get("/modules/{module_id}/grades/export.csv")
async def export_module_grades(
    module_id: str,
    current_user: Profile = Depends(_ANY_ROLE),
):
    db = get_admin_db()

    mod = (
        db.table("modules")
        .select("id, name, code, professor_id, max_absences, academic_period_id")
        .eq("id", module_id)
        .maybe_single()
        .execute()
    )
    if not mod.data:
        raise HTTPException(404, "Módulo não encontrado.")

    # Permissão: professor só do próprio módulo; coord só dos seus períodos
    if current_user.role == "professor" and mod.data["professor_id"] != current_user.id:
        raise HTTPException(403, "Você não leciona este módulo.")
    if current_user.role == "coordinator":
        period = (
            db.table("academic_periods")
            .select("id")
            .eq("id", mod.data["academic_period_id"])
            .eq("coordinator_id", current_user.id)
            .maybe_single()
            .execute()
        )
        if not period.data:
            raise HTTPException(403, "Você não coordena este período.")

    max_abs = int(mod.data.get("max_absences", 10))

    resp = (
        db.table("enrollments")
        .select(
            "id, "
            "student:students!student_id(student_number, full_name), "
            "grade:grades!enrollment_id(tutor_grade, regular_exam_grade, makeup_exam_grade, final_grade, absences)"
        )
        .eq("module_id", module_id)
        .order("student(full_name)")
        .execute()
    )

    rows: list[GradeExportRow] = []
    for r in resp.data:
        s = r.get("student") or {}
        g = r.get("grade") or {}
        final = float(g.get("final_grade", 0))
        abs_ = int(g.get("absences", 0))
        rows.append(
            GradeExportRow(
                student_number=s.get("student_number", ""),
                full_name=s.get("full_name", ""),
                tutor_grade=float(g.get("tutor_grade", 0)),
                regular_exam_grade=float(g.get("regular_exam_grade", 0)),
                makeup_exam_grade=float(g.get("makeup_exam_grade", 0)),
                final_grade=final,
                absences=abs_,
                max_absences=max_abs,
                status=classify(final, abs_, max_abs),
            )
        )

    csv_bytes = build_grades_csv(rows)
    filename = f"notas-{_slugify(mod.data['code'])}.csv"
    return _csv_response(csv_bytes, filename)
