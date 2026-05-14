"""
Importação de alunos via CSV.

Endpoint único com query-param dry_run:
  dry_run=true  → valida e retorna preview sem persistir
  dry_run=false → valida e persiste as linhas válidas
"""
import csv
import io
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException

from ..db import get_admin_db
from ..deps import require_role
from ..schemas.users import Profile

router = APIRouter(tags=["importação"])

_COORD_ADMIN = require_role("coordinator", "admin")

REQUIRED_COLS = {"student_number", "full_name", "enrollment_date"}
OPTIONAL_COLS = {"email", "medical_certificates", "referral_info", "observations"}
ALL_COLS = REQUIRED_COLS | OPTIONAL_COLS

MAX_ROWS = 500


def _parse_csv(content: bytes) -> tuple[list[dict], str | None]:
    """Retorna (linhas, erro_fatal)."""
    try:
        text = content.decode("utf-8-sig")  # aceita BOM
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except Exception:
            return [], "Não foi possível decodificar o arquivo. Use UTF-8 ou Latin-1."

    if not text.strip():
        return [], "O arquivo está vazio."

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel  # type: ignore[assignment]
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)

    if not reader.fieldnames:
        return [], "O arquivo não contém cabeçalho."

    cols = {c.strip().lower() for c in reader.fieldnames}
    missing = REQUIRED_COLS - cols
    if missing:
        return [], f"Colunas obrigatórias ausentes: {', '.join(sorted(missing))}."

    rows = []
    for row in reader:
        normalised = {k.strip().lower(): (v.strip() if v else "") for k, v in row.items()}
        rows.append(normalised)
        if len(rows) >= MAX_ROWS:
            break

    return rows, None


def _validate_row(raw: dict, idx: int) -> tuple[dict | None, str | None]:
    """Valida uma linha. Retorna (dados_limpos, mensagem_erro)."""
    student_number = raw.get("student_number", "")
    full_name = raw.get("full_name", "")
    enrollment_date = raw.get("enrollment_date", "")

    errors = []
    if not student_number:
        errors.append("matrícula vazia")
    if not full_name:
        errors.append("nome vazio")
    if not enrollment_date:
        errors.append("data de matrícula vazia")

    if errors:
        return None, f"Linha {idx}: {', '.join(errors)}."

    data: dict = {
        "student_number": student_number,
        "full_name": full_name,
        "enrollment_date": enrollment_date,
    }
    if raw.get("email"):
        data["email"] = raw["email"]
    if raw.get("medical_certificates"):
        try:
            data["medical_certificates"] = int(raw["medical_certificates"])
        except ValueError:
            pass
    if raw.get("referral_info"):
        data["referral_info"] = raw["referral_info"]
    if raw.get("observations"):
        data["observations"] = raw["observations"]

    return data, None


@router.post("/api/periods/{period_id}/students/import")
async def import_students(
    period_id: str,
    file: Annotated[UploadFile, File(description="Arquivo CSV com os alunos")],
    dry_run: bool = Query(True, description="true=preview, false=importar"),
    current_user: Profile = Depends(_COORD_ADMIN),
) -> dict:
    db = get_admin_db()

    # Verificar que o período existe (e pertence ao coordenador, se for o caso)
    period_q = db.table("academic_periods").select("id, coordinator_id").eq("id", period_id).maybe_single().execute()
    if not period_q.data:
        raise HTTPException(404, "Período não encontrado.")
    if current_user.role == "coordinator" and period_q.data.get("coordinator_id") != current_user.id:
        raise HTTPException(403, "Você não gerencia este período.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5 MB
        raise HTTPException(413, "Arquivo muito grande. Limite: 5 MB.")

    raw_rows, fatal = _parse_csv(content)
    if fatal:
        raise HTTPException(422, fatal)

    valid_rows: list[dict] = []
    invalid_rows: list[dict] = []

    # Buscar matrículas já existentes no período para checar duplicatas
    existing_resp = (
        db.table("students")
        .select("student_number")
        .eq("academic_period_id", period_id)
        .execute()
    )
    existing_numbers = {r["student_number"] for r in (existing_resp.data or [])}

    for idx, raw in enumerate(raw_rows, start=2):  # linha 1 = cabeçalho
        data, err = _validate_row(raw, idx)
        if err:
            invalid_rows.append({"line": idx, "raw": raw, "error": err})
            continue

        if data["student_number"] in existing_numbers:
            invalid_rows.append({
                "line": idx,
                "raw": raw,
                "error": f"Linha {idx}: matrícula {data['student_number']} já existe no período.",
            })
            continue

        valid_rows.append(data)
        existing_numbers.add(data["student_number"])  # evita duplicata dentro do próprio CSV

    if dry_run:
        return {
            "dry_run": True,
            "total": len(raw_rows),
            "valid_count": len(valid_rows),
            "invalid_count": len(invalid_rows),
            "valid": valid_rows,
            "invalid": invalid_rows,
        }

    # Persistir
    imported = 0
    errors_on_save: list[str] = []

    for data in valid_rows:
        try:
            ins = db.table("students").insert({**data, "academic_period_id": period_id, "is_active": True}).execute()
            student_id = ins.data[0]["id"]
            # Auto-enroll in all active modules of the period
            mods = (
                db.table("modules")
                .select("id")
                .eq("academic_period_id", period_id)
                .eq("is_active", True)
                .execute()
            )
            for mod in (mods.data or []):
                try:
                    enroll = db.table("enrollments").insert({
                        "student_id": student_id,
                        "module_id": mod["id"],
                        "status": "active",
                    }).execute()
                    enrollment_id = enroll.data[0]["id"]
                    db.table("grades").insert({
                        "enrollment_id": enrollment_id,
                        "tutor_grade": 0, "regular_exam_grade": 0,
                        "makeup_exam_grade": 0, "final_grade": 0, "absences": 0,
                    }).execute()
                except Exception:
                    pass
            imported += 1
        except Exception as e:
            errors_on_save.append(f"Matrícula {data['student_number']}: {e}")

    return {
        "dry_run": False,
        "total": len(raw_rows),
        "imported": imported,
        "invalid_count": len(invalid_rows) + len(errors_on_save),
        "invalid": invalid_rows,
        "errors_on_save": errors_on_save,
    }
