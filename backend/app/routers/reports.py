"""Endpoints de relatórios em PDF: boletim individual e relatório do período."""
from __future__ import annotations

import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.users import Profile
from ..services.reports import (
    PeriodReportData,
    PeriodReportRow,
    StudentModuleLine,
    StudentReportData,
    build_period_report_pdf,
    build_student_report_pdf,
)

router = APIRouter(prefix="/api", tags=["relatórios"])

_ANY_ROLE = require_role("professor", "coordinator", "admin")
_COORD_ADMIN = require_role("coordinator", "admin")


def _slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", normalized).strip("-").lower()
    return normalized or "documento"


def _pdf_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )


def _classify(final_grade: float, absences: int, max_absences: int) -> str:
    if absences > max_absences:
        return "failed"
    if final_grade >= 7:
        return "approved"
    if final_grade >= 5:
        return "recovery"
    return "failed"


# ---------------------------------------------------------------
# Boletim do aluno
# ---------------------------------------------------------------

@router.get("/students/{student_id}/report")
async def student_report(
    student_id: str,
    current_user: Profile = Depends(_ANY_ROLE),
):
    """Gera o boletim do aluno em PDF (todos os módulos do período)."""
    db = get_admin_db()

    student = (
        db.table("students")
        .select(
            "id, student_number, full_name, email, medical_certificates, "
            "academic_period:academic_periods!academic_period_id(id, name)"
        )
        .eq("id", student_id)
        .maybe_single()
        .execute()
    )
    if not student.data:
        raise HTTPException(404, "Aluno não encontrado.")

    if current_user.role == "professor":
        _assert_professor_has_student(db, current_user.id, student_id)
    elif current_user.role == "coordinator":
        period = student.data.get("academic_period") or {}
        _assert_coord_owns_period(db, current_user.id, period.get("id"))

    enrollments = (
        db.table("enrollments")
        .select(
            "id, status, "
            "module:modules!module_id(id, name, code, max_absences), "
            "grade:grades!enrollment_id(tutor_grade, regular_exam_grade, makeup_exam_grade, final_grade, absences)"
        )
        .eq("student_id", student_id)
        .execute()
    )

    modules: list[StudentModuleLine] = []
    for enr in enrollments.data:
        mod = enr.get("module") or {}
        grade = enr.get("grade") or {}
        modules.append(
            StudentModuleLine(
                module_code=mod.get("code", ""),
                module_name=mod.get("name", ""),
                tutor_grade=float(grade.get("tutor_grade", 0)),
                regular_exam_grade=float(grade.get("regular_exam_grade", 0)),
                makeup_exam_grade=float(grade.get("makeup_exam_grade", 0)),
                final_grade=float(grade.get("final_grade", 0)),
                absences=int(grade.get("absences", 0)),
                max_absences=int(mod.get("max_absences", 10)),
            )
        )

    modules.sort(key=lambda m: m.module_code)

    period_obj = student.data.get("academic_period") or {}
    data = StudentReportData(
        student_number=student.data["student_number"],
        full_name=student.data["full_name"],
        email=student.data.get("email"),
        period_name=period_obj.get("name", "—"),
        medical_certificates=int(student.data.get("medical_certificates", 0)),
        modules=modules,
    )

    pdf = build_student_report_pdf(data)
    filename = f"boletim-{_slugify(data.full_name)}.pdf"
    return _pdf_response(pdf, filename)


# ---------------------------------------------------------------
# Relatório consolidado do período
# ---------------------------------------------------------------

@router.get("/periods/{period_id}/report")
async def period_report(
    period_id: str,
    current_user: Profile = Depends(_COORD_ADMIN),
):
    """Gera o relatório consolidado do período em PDF."""
    db = get_admin_db()

    period = (
        db.table("academic_periods")
        .select(
            "id, name, coordinator:profiles!coordinator_id(id, full_name)"
        )
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not period.data:
        raise HTTPException(404, "Período não encontrado.")

    if current_user.role == "coordinator":
        _assert_coord_owns_period(db, current_user.id, period_id)

    students = (
        db.table("students")
        .select("id, student_number, full_name")
        .eq("academic_period_id", period_id)
        .eq("is_active", True)
        .order("full_name")
        .execute()
    )

    rows: list[PeriodReportRow] = []
    if students.data:
        student_ids = [s["id"] for s in students.data]
        enrollments = (
            db.table("enrollments")
            .select(
                "student_id, "
                "module:modules!module_id(max_absences), "
                "grade:grades!enrollment_id(final_grade, absences)"
            )
            .in_("student_id", student_ids)
            .execute()
        )

        by_student: dict[str, list[dict]] = {sid: [] for sid in student_ids}
        for e in enrollments.data:
            by_student.setdefault(e["student_id"], []).append(e)

        for s in students.data:
            ents = by_student.get(s["id"], [])
            grades = [(e.get("grade") or {}) for e in ents]
            mods = [(e.get("module") or {}) for e in ents]

            finals = [float(g.get("final_grade", 0)) for g in grades]
            absences = [int(g.get("absences", 0)) for g in grades]
            max_abs = [int(m.get("max_absences", 10)) for m in mods]

            approved = recovery = failed = 0
            for f, a, ma in zip(finals, absences, max_abs):
                cls = _classify(f, a, ma)
                if cls == "approved":
                    approved += 1
                elif cls == "recovery":
                    recovery += 1
                else:
                    failed += 1

            avg = sum(finals) / len(finals) if finals else 0.0

            rows.append(
                PeriodReportRow(
                    student_number=s["student_number"],
                    full_name=s["full_name"],
                    avg_final_grade=avg,
                    total_absences=sum(absences),
                    modules_approved=approved,
                    modules_recovery=recovery,
                    modules_failed=failed,
                )
            )

    coord = period.data.get("coordinator") or {}
    data = PeriodReportData(
        period_name=period.data["name"],
        coordinator_name=coord.get("full_name"),
        rows=rows,
    )

    pdf = build_period_report_pdf(data)
    filename = f"relatorio-{_slugify(data.period_name)}.pdf"
    return _pdf_response(pdf, filename)


# ---------------------------------------------------------------
# Helpers de permissão
# ---------------------------------------------------------------

def _assert_professor_has_student(db, professor_id: str, student_id: str) -> None:
    modules = (
        db.table("modules").select("id").eq("professor_id", professor_id).execute()
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


def _assert_coord_owns_period(db, coordinator_id: str, period_id: str | None) -> None:
    if not period_id:
        raise HTTPException(403, "Acesso negado.")
    chk = (
        db.table("academic_periods")
        .select("id")
        .eq("id", period_id)
        .eq("coordinator_id", coordinator_id)
        .maybe_single()
        .execute()
    )
    if not chk.data:
        raise HTTPException(403, "Você não coordena este período.")
