"""
Sincronização com Google Sheets.

O fluxo:
1. Coordenador configura a URL de exportação CSV da planilha no período.
2. POST /api/periods/{id}/sync-sheets → servidor baixa o CSV, parseia e
   atualiza as notas dos alunos já cadastrados (match por student_number).
   Alunos não encontrados são listados em `not_found`.

Formato esperado da planilha (colunas podem ser em qualquer ordem):
  student_number, tutor_grade, regular_exam_grade, makeup_exam_grade, absences
"""
import csv
import io
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.users import Profile
from ..services.grades import recalc_final

router = APIRouter(tags=["sheets"])

_COORD_ADMIN = require_role("coordinator", "admin")

GRADE_COLS = {
    "tutor_grade", "regular_exam_grade", "makeup_exam_grade", "absences"
}


async def _fetch_csv(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(
                502,
                f"Não foi possível baixar a planilha (HTTP {resp.status_code}).",
            )
        return resp.content


def _parse_sheet(content: bytes) -> list[dict]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    rows = []
    for row in reader:
        rows.append({k.strip().lower(): (v.strip() if v else "") for k, v in row.items()})
    return rows


@router.put("/api/periods/{period_id}/sync-url")
async def set_sync_url(
    period_id: str,
    body: dict,
    current_user: Profile = Depends(_COORD_ADMIN),
) -> dict:
    """Salva a URL de exportação CSV da planilha no período."""
    url: str = body.get("csv_sync_url", "").strip()
    db = get_admin_db()

    period = (
        db.table("academic_periods")
        .select("id, coordinator_id")
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not period.data:
        raise HTTPException(404, "Período não encontrado.")
    if current_user.role == "coordinator" and period.data["coordinator_id"] != current_user.id:
        raise HTTPException(403, "Você não gerencia este período.")

    db.table("academic_periods").update({"csv_sync_url": url or None}).eq("id", period_id).execute()
    return {"csv_sync_url": url or None}


@router.post("/api/periods/{period_id}/sync-sheets")
async def sync_sheets(
    period_id: str,
    current_user: Profile = Depends(_COORD_ADMIN),
) -> dict:
    db = get_admin_db()

    period = (
        db.table("academic_periods")
        .select("id, coordinator_id, csv_sync_url")
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not period.data:
        raise HTTPException(404, "Período não encontrado.")
    if current_user.role == "coordinator" and period.data["coordinator_id"] != current_user.id:
        raise HTTPException(403, "Você não gerencia este período.")

    sync_url: str | None = period.data.get("csv_sync_url")
    if not sync_url:
        raise HTTPException(422, "Nenhuma URL de planilha configurada para este período.")

    content = await _fetch_csv(sync_url)
    rows = _parse_sheet(content)

    if not rows:
        raise HTTPException(422, "A planilha está vazia ou não foi possível interpretar o CSV.")

    if "student_number" not in rows[0]:
        raise HTTPException(
            422,
            "Coluna 'student_number' não encontrada na planilha.",
        )

    # Buscar todos os alunos do período com seus enrollments e grades
    enrollments_resp = (
        db.table("enrollments")
        .select(
            "id, module_id, "
            "student:students!student_id(id, student_number), "
            "grade:grades!enrollment_id(enrollment_id, regular_exam_grade, makeup_exam_grade)"
        )
        .eq("students.academic_period_id", period_id)
        .execute()
    )

    # Índice: student_number → lista de enrollments
    enroll_by_student: dict[str, list[dict]] = {}
    for enr in (enrollments_resp.data or []):
        student = enr.get("student") or {}
        snum = student.get("student_number", "")
        if snum:
            enroll_by_student.setdefault(snum, []).append(enr)

    updated = 0
    not_found: list[str] = []
    now_iso = datetime.now(timezone.utc).isoformat()

    for row in rows:
        snum = row.get("student_number", "").strip()
        if not snum:
            continue

        enrollments = enroll_by_student.get(snum)
        if not enrollments:
            not_found.append(snum)
            continue

        patch: dict = {}
        for col in ("tutor_grade", "regular_exam_grade", "makeup_exam_grade"):
            val = row.get(col, "")
            if val:
                try:
                    patch[col] = round(min(10.0, max(0.0, float(val))), 2)
                except ValueError:
                    pass
        if row.get("absences", ""):
            try:
                patch["absences"] = max(0, int(row["absences"]))
            except ValueError:
                pass

        if not patch:
            continue

        for enr in enrollments:
            grade_data = enr.get("grade") or {}
            current_regular = patch.get("regular_exam_grade", grade_data.get("regular_exam_grade", 0) or 0)
            current_makeup = patch.get("makeup_exam_grade", grade_data.get("makeup_exam_grade", 0) or 0)
            patch_with_final = {
                **patch,
                "final_grade": recalc_final(float(current_regular), float(current_makeup)),
                "last_updated": now_iso,
            }
            enr_id = enr.get("id") or (grade_data.get("enrollment_id"))
            if enr_id:
                db.table("grades").update(patch_with_final).eq("enrollment_id", enr_id).execute()

        updated += 1

    # Atualizar timestamp de último sync
    db.table("academic_periods").update({"csv_last_sync": now_iso}).eq("id", period_id).execute()

    return {
        "updated": updated,
        "not_found": not_found,
        "not_found_count": len(not_found),
        "synced_at": now_iso,
    }
