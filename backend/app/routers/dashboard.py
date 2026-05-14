"""
Dashboard — dados agregados por papel.

GET /api/dashboard
  - admin/coordinator: visão geral do período selecionado
  - professor: visão dos seus módulos
"""
from fastapi import APIRouter, Depends, Query

from ..db import get_admin_db
from ..deps import get_current_user
from ..schemas.users import Profile

router = APIRouter(prefix="/api", tags=["dashboard"])


def _grade_bucket(final: float) -> str:
    if final >= 9:
        return "9–10"
    if final >= 7:
        return "7–8.9"
    if final >= 5:
        return "5–6.9"
    return "0–4.9"


BUCKETS = ["0–4.9", "5–6.9", "7–8.9", "9–10"]


@router.get("/dashboard")
async def get_dashboard(
    period_id: str | None = Query(None),
    current_user: Profile = Depends(get_current_user),
) -> dict:
    db = get_admin_db()
    role = current_user.role

    # ── Professor ─────────────────────────────────────────────────────────────
    if role == "professor":
        mods_resp = (
            db.table("modules")
            .select("id, name, code, max_absences, is_active")
            .eq("professor_id", current_user.id)
            .execute()
        )
        modules = mods_resp.data or []
        if not modules:
            return {
                "role": role,
                "summary": {"modules": 0, "students": 0, "approvals": 0, "approval_rate": 0},
                "modules_detail": [],
                "grade_distribution": [],
            }

        module_ids = [m["id"] for m in modules]

        enroll_resp = (
            db.table("enrollments")
            .select("id, module_id, grade:grades!enrollment_id(final_grade, absences)")
            .in_("module_id", module_ids)
            .execute()
        )
        enrollments = enroll_resp.data or []

        # Agrega por módulo
        mod_map: dict[str, dict] = {m["id"]: {**m, "students": 0, "approved": 0, "reproved_abs": 0} for m in modules}
        dist: dict[str, int] = {b: 0 for b in BUCKETS}
        total_students = 0
        total_approved = 0

        for enr in enrollments:
            mid = enr["module_id"]
            grade = enr.get("grade") or {}
            final = float(grade.get("final_grade") or 0)
            absences = int(grade.get("absences") or 0)
            max_abs = mod_map[mid]["max_absences"]

            mod_map[mid]["students"] += 1
            total_students += 1
            dist[_grade_bucket(final)] += 1

            if absences > max_abs:
                mod_map[mid]["reproved_abs"] += 1
            elif final >= 7:
                mod_map[mid]["approved"] += 1
                total_approved += 1

        modules_detail = []
        for m in modules:
            d = mod_map[m["id"]]
            n = d["students"]
            rate = round(d["approved"] / n * 100) if n > 0 else 0
            modules_detail.append({
                "id": m["id"],
                "name": m["name"],
                "code": m["code"],
                "is_active": m["is_active"],
                "students": n,
                "approved": d["approved"],
                "reproved_abs": d["reproved_abs"],
                "approval_rate": rate,
            })

        rate_total = round(total_approved / total_students * 100) if total_students > 0 else 0

        return {
            "role": role,
            "summary": {
                "modules": len(modules),
                "students": total_students,
                "approvals": total_approved,
                "approval_rate": rate_total,
            },
            "modules_detail": modules_detail,
            "grade_distribution": [{"label": b, "count": dist[b]} for b in BUCKETS],
        }

    # ── Coordinator / Admin ───────────────────────────────────────────────────
    # Determinar período a consultar
    if period_id:
        periods_resp = (
            db.table("academic_periods")
            .select("id, name, is_active")
            .eq("id", period_id)
            .execute()
        )
    elif role == "coordinator":
        periods_resp = (
            db.table("academic_periods")
            .select("id, name, is_active")
            .eq("coordinator_id", current_user.id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
    else:
        periods_resp = (
            db.table("academic_periods")
            .select("id, name, is_active")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )

    periods_list = periods_resp.data or []
    if not periods_list:
        return {
            "role": role,
            "period": None,
            "summary": {"students": 0, "modules": 0, "enrollments": 0, "approved": 0, "approval_rate": 0},
            "modules_breakdown": [],
            "grade_distribution": [],
        }

    period = periods_list[0]
    pid = period["id"]

    # Students
    students_resp = (
        db.table("students")
        .select("id", count="exact")
        .eq("academic_period_id", pid)
        .eq("is_active", True)
        .execute()
    )
    student_count = students_resp.count or 0

    # Modules
    mods_resp = (
        db.table("modules")
        .select("id, name, code, max_absences, professor:profiles!professor_id(full_name)")
        .eq("academic_period_id", pid)
        .execute()
    )
    modules = mods_resp.data or []
    module_ids = [m["id"] for m in modules]

    if not module_ids:
        return {
            "role": role,
            "period": period,
            "summary": {"students": student_count, "modules": 0, "enrollments": 0, "approved": 0, "approval_rate": 0},
            "modules_breakdown": [],
            "grade_distribution": [],
        }

    enroll_resp = (
        db.table("enrollments")
        .select("id, module_id, grade:grades!enrollment_id(final_grade, absences)")
        .in_("module_id", module_ids)
        .execute()
    )
    enrollments = enroll_resp.data or []

    mod_map = {m["id"]: {**m, "students": 0, "approved": 0, "reproved_abs": 0} for m in modules}
    dist: dict[str, int] = {b: 0 for b in BUCKETS}
    total_approved = 0

    for enr in enrollments:
        mid = enr["module_id"]
        if mid not in mod_map:
            continue
        grade = enr.get("grade") or {}
        final = float(grade.get("final_grade") or 0)
        absences = int(grade.get("absences") or 0)
        max_abs = mod_map[mid]["max_absences"]

        mod_map[mid]["students"] += 1
        dist[_grade_bucket(final)] += 1

        if absences > max_abs:
            mod_map[mid]["reproved_abs"] += 1
        elif final >= 7:
            mod_map[mid]["approved"] += 1
            total_approved += 1

    enroll_count = len(enrollments)
    rate_total = round(total_approved / enroll_count * 100) if enroll_count > 0 else 0

    modules_breakdown = []
    for m in modules:
        d = mod_map[m["id"]]
        n = d["students"]
        rate = round(d["approved"] / n * 100) if n > 0 else 0
        modules_breakdown.append({
            "id": m["id"],
            "name": m["name"],
            "code": m["code"],
            "professor": (m.get("professor") or {}).get("full_name", "—"),
            "students": n,
            "approved": d["approved"],
            "reproved_abs": d["reproved_abs"],
            "approval_rate": rate,
        })

    return {
        "role": role,
        "period": period,
        "summary": {
            "students": student_count,
            "modules": len(modules),
            "enrollments": enroll_count,
            "approved": total_approved,
            "approval_rate": rate_total,
        },
        "modules_breakdown": modules_breakdown,
        "grade_distribution": [{"label": b, "count": dist[b]} for b in BUCKETS],
    }
