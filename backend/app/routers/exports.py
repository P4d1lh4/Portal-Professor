"""Endpoints de exportação CSV: alunos do período, notas e frequência do módulo."""
from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..db import fetch_all, get_admin_db
from ..deps import require_role
from ..schemas.users import Profile
from ..services.permissions import assert_coordinator_owns_period
from ..services.exports import (
    AttendanceExportRow,
    GradeExportRow,
    StudentExportRow,
    build_attendance_csv,
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


def _module_for_export(db, module_id: str, current_user: Profile) -> dict:
    """Módulo a exportar, com a permissão já checada: professor só o próprio
    módulo; coordenador só os dos seus períodos; admin qualquer um."""
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


# ---------------------------------------------------------------
# Alunos de um período
# ---------------------------------------------------------------

@router.get("/periods/{period_id}/students/export.csv")
def export_period_students(
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

    # Builder novo a cada página: os do supabase-py acumulam parâmetros, então
    # reusar um só repetiria o offset/limit.
    def _page(lo: int, hi: int):
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
        return q.order("full_name").range(lo, hi)

    data = fetch_all(_page)

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
        for r in data
    ]

    csv_bytes = build_students_csv(rows)
    filename = f"alunos-{_slugify(period.data['name'])}.csv"
    return _csv_response(csv_bytes, filename)


# ---------------------------------------------------------------
# Notas de um módulo
# ---------------------------------------------------------------

@router.get("/modules/{module_id}/grades/export.csv")
def export_module_grades(
    module_id: str,
    current_user: Profile = Depends(_ANY_ROLE),
):
    db = get_admin_db()
    mod = _module_for_export(db, module_id, current_user)

    max_abs = int(mod.get("max_absences", 10))

    data = fetch_all(
        lambda lo, hi: db.table("enrollments")
        .select(
            "id, "
            "student:students!student_id(student_number, full_name), "
            "grade:grades!enrollment_id(tutor_grade, regular_exam_grade, makeup_exam_grade, final_grade, absences)"
        )
        .eq("module_id", module_id)
        .order("student(full_name)")
        .range(lo, hi)
    )

    rows: list[GradeExportRow] = []
    for r in data:
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
    filename = f"notas-{_slugify(mod['code'])}.csv"
    return _csv_response(csv_bytes, filename)


# ---------------------------------------------------------------
# Frequência de um módulo (P-Q4)
# ---------------------------------------------------------------

# Não é /attendance/export.csv: o GET /modules/{id}/attendance/{data} da Chamada
# pegaria "export.csv" como data (422).
@router.get("/modules/{module_id}/attendance.csv")
def export_module_attendance(
    module_id: str,
    current_user: Profile = Depends(_ANY_ROLE),
):
    db = get_admin_db()
    mod = _module_for_export(db, module_id, current_user)

    records = fetch_all(
        lambda lo, hi: db.table("attendance_records")
        .select("id, attendance_date")
        .eq("module_id", module_id)
        .order("attendance_date")
        .range(lo, hi)
    )
    record_ids = [r["id"] for r in records]

    # ponytail: in_ com os ids das chamadas do módulo (umas 60 por semestre
    # cabem na URL); se passar de centenas, filtrar pelo módulo via join.
    entries = (
        fetch_all(
            lambda lo, hi: db.table("attendance_entries")
            .select("attendance_record_id, enrollment_id, status")
            .in_("attendance_record_id", record_ids)
            .range(lo, hi)
        )
        if record_ids
        else []
    )
    status_of = {(e["enrollment_id"], e["attendance_record_id"]): e["status"] for e in entries}

    enrollments = fetch_all(
        lambda lo, hi: db.table("enrollments")
        .select("id, student:students!student_id(student_number, full_name)")
        .eq("module_id", module_id)
        .order("student(full_name)")
        .range(lo, hi)
    )

    rows = [
        AttendanceExportRow(
            student_number=(e.get("student") or {}).get("student_number", ""),
            full_name=(e.get("student") or {}).get("full_name", ""),
            statuses=[status_of.get((e["id"], rid)) for rid in record_ids],
        )
        for e in enrollments
    ]

    csv_bytes = build_attendance_csv([r["attendance_date"] for r in records], rows)
    filename = f"frequencia-{_slugify(mod['code'])}.csv"
    return _csv_response(csv_bytes, filename)
