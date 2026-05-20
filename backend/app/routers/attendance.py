"""Endpoints de chamada (frequência) por módulo e por dia."""
from __future__ import annotations

from datetime import date as date_cls

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.attendance import (
    AttendanceDayDraft,
    AttendanceEntryWithStudent,
    AttendanceRecord,
    AttendanceRecordSave,
    AttendanceSummary,
)
from ..schemas.users import Profile
from ..services.guards import assert_module_period_active

router = APIRouter(prefix="/api", tags=["frequência"])

_ANY_ROLE = require_role("professor", "coordinator", "admin")


# ---------------------------------------------------------------
# Helpers de permissão
# ---------------------------------------------------------------

def _assert_module_access(db, current_user: Profile, module_id: str) -> dict:
    """Garante que o usuário pode operar sobre o módulo e devolve a linha do módulo."""
    mod = (
        db.table("modules")
        .select("id, professor_id, academic_period_id")
        .eq("id", module_id)
        .maybe_single()
        .execute()
    )
    if not mod.data:
        raise HTTPException(404, "Módulo não encontrado.")

    if current_user.role == "professor":
        if mod.data["professor_id"] != current_user.id:
            raise HTTPException(403, "Você não leciona este módulo.")
    elif current_user.role == "coordinator":
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

    return mod.data


def _list_module_students(db, module_id: str) -> list[dict]:
    """Alunos ativos matriculados no módulo (ordenados por nome)."""
    resp = (
        db.table("enrollments")
        .select(
            "id, status, "
            "student:students!student_id(id, student_number, full_name, is_active)"
        )
        .eq("module_id", module_id)
        .execute()
    )
    rows: list[dict] = []
    for r in resp.data:
        student = r.get("student") or {}
        if not student.get("is_active", True):
            continue
        rows.append(
            {
                "enrollment_id": r["id"],
                "student_id": student.get("id", ""),
                "student_number": student.get("student_number", ""),
                "full_name": student.get("full_name", ""),
            }
        )
    rows.sort(key=lambda r: r["full_name"].lower())
    return rows


# ---------------------------------------------------------------
# Listagem de chamadas do módulo
# ---------------------------------------------------------------

@router.get(
    "/modules/{module_id}/attendance",
    response_model=list[AttendanceSummary],
)
async def list_module_attendance(
    module_id: str,
    current_user: Profile = Depends(_ANY_ROLE),
) -> list[AttendanceSummary]:
    """Lista todas as chamadas registradas para o módulo, mais recente primeiro."""
    db = get_admin_db()
    _assert_module_access(db, current_user, module_id)

    records = (
        db.table("attendance_records")
        .select("*")
        .eq("module_id", module_id)
        .order("attendance_date", desc=True)
        .execute()
    )
    if not records.data:
        return []

    record_ids = [r["id"] for r in records.data]
    entries = (
        db.table("attendance_entries")
        .select("attendance_record_id, status")
        .in_("attendance_record_id", record_ids)
        .execute()
    )

    counts: dict[str, dict[str, int]] = {
        rid: {"present": 0, "absent": 0, "justified": 0} for rid in record_ids
    }
    for e in entries.data:
        rid = e["attendance_record_id"]
        st = e["status"]
        if rid in counts and st in counts[rid]:
            counts[rid][st] += 1

    return [
        AttendanceSummary(
            id=r["id"],
            module_id=r["module_id"],
            attendance_date=r["attendance_date"],
            total_present=counts[r["id"]]["present"],
            total_absent=counts[r["id"]]["absent"],
            total_justified=counts[r["id"]]["justified"],
            notes=r.get("notes"),
            created_at=r["created_at"],
            updated_at=r["updated_at"],
        )
        for r in records.data
    ]


# ---------------------------------------------------------------
# Buscar chamada de uma data específica (com lista de alunos)
# ---------------------------------------------------------------

@router.get(
    "/modules/{module_id}/attendance/{attendance_date}",
    response_model=AttendanceDayDraft,
)
async def get_attendance_day(
    module_id: str,
    attendance_date: date_cls,
    current_user: Profile = Depends(_ANY_ROLE),
) -> AttendanceDayDraft:
    """
    Devolve a chamada do dia se existir, OU um rascunho com a lista de alunos
    matriculados ativos com status default 'present'. Não cria registro no banco.
    """
    db = get_admin_db()
    _assert_module_access(db, current_user, module_id)

    record = (
        db.table("attendance_records")
        .select("*")
        .eq("module_id", module_id)
        .eq("attendance_date", str(attendance_date))
        .maybe_single()
        .execute()
    )

    students = _list_module_students(db, module_id)

    saved_by_enrollment: dict[str, dict] = {}
    if record.data:
        entries = (
            db.table("attendance_entries")
            .select("*")
            .eq("attendance_record_id", record.data["id"])
            .execute()
        )
        saved_by_enrollment = {e["enrollment_id"]: e for e in entries.data}

    rows = [
        AttendanceEntryWithStudent(
            enrollment_id=s["enrollment_id"],
            student_id=s["student_id"],
            student_number=s["student_number"],
            full_name=s["full_name"],
            status=saved_by_enrollment.get(s["enrollment_id"], {}).get(
                "status", "present"
            ),
            notes=saved_by_enrollment.get(s["enrollment_id"], {}).get("notes"),
        )
        for s in students
    ]

    return AttendanceDayDraft(
        module_id=module_id,
        attendance_date=attendance_date,
        record_id=record.data["id"] if record.data else None,
        notes=record.data.get("notes") if record.data else None,
        entries=rows,
    )


# ---------------------------------------------------------------
# Salvar chamada do dia (upsert do record + replace das entries)
# ---------------------------------------------------------------

@router.put(
    "/modules/{module_id}/attendance/{attendance_date}",
    response_model=AttendanceRecord,
)
async def save_attendance_day(
    module_id: str,
    attendance_date: date_cls,
    body: AttendanceRecordSave,
    current_user: Profile = Depends(_ANY_ROLE),
) -> AttendanceRecord:
    """
    Cria ou atualiza a chamada do dia e sobrescreve TODAS as entries.
    Aceita apenas enrollments que pertencem ao módulo informado.
    """
    db = get_admin_db()
    _assert_module_access(db, current_user, module_id)
    assert_module_period_active(db, module_id, current_user)

    # Encontra ou cria o record
    existing = (
        db.table("attendance_records")
        .select("*")
        .eq("module_id", module_id)
        .eq("attendance_date", str(attendance_date))
        .maybe_single()
        .execute()
    )

    if existing.data:
        record_id = existing.data["id"]
        db.table("attendance_records").update(
            {"notes": body.notes}
        ).eq("id", record_id).execute()
    else:
        created = (
            db.table("attendance_records")
            .insert(
                {
                    "module_id": module_id,
                    "attendance_date": str(attendance_date),
                    "notes": body.notes,
                    "created_by": current_user.id,
                }
            )
            .execute()
        )
        record_id = created.data[0]["id"]

    # Valida que todas as enrollments fazem parte do módulo
    if body.entries:
        enrollment_ids = [e.enrollment_id for e in body.entries]
        valid = (
            db.table("enrollments")
            .select("id")
            .eq("module_id", module_id)
            .in_("id", enrollment_ids)
            .execute()
        )
        valid_ids = {r["id"] for r in valid.data}
        invalid = [eid for eid in enrollment_ids if eid not in valid_ids]
        if invalid:
            raise HTTPException(
                400,
                f"Algumas matrículas informadas não pertencem a este módulo: {invalid}",
            )

    # Replace: apaga as antigas e insere as novas (trigger recalcula grades.absences)
    db.table("attendance_entries").delete().eq(
        "attendance_record_id", record_id
    ).execute()

    if body.entries:
        payload = [
            {
                "attendance_record_id": record_id,
                "enrollment_id": e.enrollment_id,
                "status": e.status,
                "notes": e.notes,
            }
            for e in body.entries
        ]
        db.table("attendance_entries").insert(payload).execute()

    final = (
        db.table("attendance_records")
        .select("*")
        .eq("id", record_id)
        .single()
        .execute()
    )
    return AttendanceRecord(**final.data)


# ---------------------------------------------------------------
# Excluir chamada do dia
# ---------------------------------------------------------------

@router.delete(
    "/modules/{module_id}/attendance/{attendance_date}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_attendance_day(
    module_id: str,
    attendance_date: date_cls,
    current_user: Profile = Depends(_ANY_ROLE),
) -> None:
    db = get_admin_db()
    _assert_module_access(db, current_user, module_id)
    assert_module_period_active(db, module_id, current_user)

    record = (
        db.table("attendance_records")
        .select("id")
        .eq("module_id", module_id)
        .eq("attendance_date", str(attendance_date))
        .maybe_single()
        .execute()
    )
    if not record.data:
        raise HTTPException(404, "Não há chamada registrada nesta data.")

    # ON DELETE CASCADE apaga as entries; trigger recalcula grades.absences
    db.table("attendance_records").delete().eq("id", record.data["id"]).execute()
