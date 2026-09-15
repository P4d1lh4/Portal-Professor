"""
Importação via CSV: alunos do período e notas do módulo (P-N9).

Alunos: endpoint único com query-param dry_run:
  dry_run=true  → valida e retorna preview sem persistir
  dry_run=false → valida e persiste as linhas válidas

Aceita o cabeçalho técnico (student_number, full_name...) e o do export de
alunos (Matrícula, Nome, Data de matrícula...), com ou sem acento (P-Q2): o CSV
exportado pelo sistema volta sem edição. O import de notas faz o mesmo com o
export de notas do módulo.
"""
import asyncio
import csv
import io
import logging
import unicodedata
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile, HTTPException

from ..db import fetch_all, get_admin_db
from ..deps import require_role
from ..schemas.students import _check_enrollment_date
from ..schemas.users import Profile
from ..services.audit import write_audit_log
from ..services.grades import recalc_final
from ..services.guards import assert_module_period_active
from ..services.permissions import assert_module_access

logger = logging.getLogger(__name__)

router = APIRouter(tags=["importação"])

_COORD_ADMIN = require_role("coordinator", "admin")

REQUIRED_COLS = {"student_number", "full_name", "enrollment_date"}
OPTIONAL_COLS = {"email", "referral_info", "observations"}
ALL_COLS = REQUIRED_COLS | OPTIONAL_COLS

# Cabeçalhos do export (services/exports.py, build_students_csv), já sem acento.
# "Ativo" e "Atestados médicos" são ignorados: aluno importado entra ativo, e a
# contagem de atestados vem da lista (trigger da 0003, alteração 64).
_HEADER_ALIASES = {
    "matricula": "student_number",
    "nome": "full_name",
    "e-mail": "email",
    "data de matricula": "enrollment_date",
    "encaminhamento": "referral_info",
    "observacoes": "observations",
}
_REQUIRED_LABELS = {
    "student_number": "Matrícula",
    "full_name": "Nome",
    "enrollment_date": "Data de matrícula",
}
# ISO é o que o export grava; dd/mm/aaaa é como o Excel pt-BR salva de volta.
_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y")

MAX_ROWS = 500


def _canon(header: str, aliases: dict[str, str] = _HEADER_ALIASES) -> str:
    """Nome canônico da coluna: minúsculo, sem acento e com o alias do export."""
    key = unicodedata.normalize("NFKD", " ".join(header.lower().split()))
    key = "".join(c for c in key if not unicodedata.combining(c))
    return aliases.get(key, key)


def _parse_date(raw: str) -> date | None:
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _parse_csv(
    content: bytes,
    required: set[str] = REQUIRED_COLS,
    aliases: dict[str, str] = _HEADER_ALIASES,
    labels: dict[str, str] = _REQUIRED_LABELS,
) -> tuple[list[dict], str | None]:
    """Retorna (linhas, erro_fatal). Os padrões são os do import de alunos;
    o de notas (P-N9) passa as colunas e os aliases dele."""
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

    cols = {_canon(c, aliases) for c in reader.fieldnames if c}
    missing = required - cols
    if missing:
        names = ", ".join(f"{labels[c]} ({c})" for c in sorted(missing))
        return [], f"Colunas obrigatórias ausentes: {names}."

    rows = []
    for row in reader:
        # Chave None = valores além do cabeçalho (linha com colunas a mais).
        normalised = {
            _canon(k, aliases): (v.strip() if v else "") for k, v in row.items() if k is not None
        }
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

    parsed_date = _parse_date(enrollment_date)
    if parsed_date is None:
        return None, (
            f"Linha {idx}: data de matrícula inválida ({enrollment_date}); "
            "use AAAA-MM-DD ou DD/MM/AAAA."
        )
    try:
        _check_enrollment_date(parsed_date)  # mesma regra do formulário de aluno
    except ValueError as exc:
        return None, f"Linha {idx}: {exc}"

    data: dict = {
        "student_number": student_number,
        "full_name": full_name,
        "enrollment_date": parsed_date.isoformat(),
    }
    if raw.get("email"):
        data["email"] = raw["email"]
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
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:  # 5 MB
        raise HTTPException(413, "Arquivo muito grande. Limite: 5 MB.")
    # Validação + persistência são síncronas (supabase-py) → threadpool, para não
    # travar o event loop durante o loop de até MAX_ROWS RPCs (worker único).
    return await asyncio.to_thread(_run_import, period_id, content, dry_run, current_user)


def _run_import(period_id: str, content: bytes, dry_run: bool, current_user: Profile) -> dict:
    db = get_admin_db()

    # Verificar que o período existe (e pertence ao coordenador, se for o caso)
    period_q = db.table("academic_periods").select("id, coordinator_id").eq("id", period_id).maybe_single().execute()
    if not period_q.data:
        raise HTTPException(404, "Período não encontrado.")
    if current_user.role == "coordinator" and period_q.data.get("coordinator_id") != current_user.id:
        raise HTTPException(403, "Você não gerencia este período.")

    raw_rows, fatal = _parse_csv(content)
    if fatal:
        raise HTTPException(422, fatal)

    valid_rows: list[dict] = []
    invalid_rows: list[dict] = []

    # student_number é único no banco inteiro (0001), não por período: a
    # checagem olha todos, senão o preview aprovava a linha e a gravação falhava
    # na RPC com o erro cru do banco. fetch_all: sem ele, passava de 1000 alunos
    # e a duplicata escapava.
    period_of_number = {
        r["student_number"]: r["academic_period_id"]
        for r in fetch_all(
            lambda lo, hi: db.table("students")
            .select("student_number, academic_period_id")
            .range(lo, hi)
        )
    }
    seen: set[str] = set()

    for idx, raw in enumerate(raw_rows, start=2):  # linha 1 = cabeçalho
        data, err = _validate_row(raw, idx)
        if err:
            invalid_rows.append({"line": idx, "raw": raw, "error": err})
            continue

        number = data["student_number"]
        owner = period_of_number.get(number)
        if number in seen:
            err = f"Linha {idx}: matrícula {number} repetida neste arquivo."
        elif owner == period_id:
            err = f"Linha {idx}: matrícula {number} já existe no período."
        elif owner:
            err = f"Linha {idx}: matrícula {number} já pertence a um aluno de outro período."
        if err:
            invalid_rows.append({"line": idx, "raw": raw, "error": err})
            continue

        valid_rows.append(data)
        seen.add(number)

    if dry_run:
        return {
            "dry_run": True,
            "total": len(raw_rows),
            "valid_count": len(valid_rows),
            "invalid_count": len(invalid_rows),
            "valid": valid_rows,
            "invalid": invalid_rows,
        }

    # Persistir — cada aluno é criado ATOMICAMENTE (aluno + matrículas + notas)
    # via RPC transacional (0007 create_student_with_enrollments). Antes, uma
    # falha no meio do loop de matrículas deixava o aluno criado com matrículas
    # parciais (agora é tudo-ou-nada por aluno).
    imported = 0
    errors_on_save: list[str] = []

    # Módulos ativos do período — buscados UMA vez (antes, por aluno).
    mods = (
        db.table("modules")
        .select("id")
        .eq("academic_period_id", period_id)
        .eq("is_active", True)
        .execute()
    )
    module_ids = [m["id"] for m in (mods.data or [])]

    for data in valid_rows:
        try:
            db.rpc(
                "create_student_with_enrollments",
                {
                    "p_student": {**data, "academic_period_id": period_id, "is_active": True},
                    "p_module_ids": module_ids,
                },
            ).execute()
            imported += 1
        except Exception as e:
            logger.warning("Falha ao importar aluno %s: %s", data.get("student_number"), e)
            errors_on_save.append(f"Matrícula {data['student_number']}: {e}")

    # Um registro agregado por importação (até MAX_ROWS alunos de uma vez).
    write_audit_log(
        db,
        actor=current_user,
        action="insert",
        entity="students",
        entity_id=period_id,
        summary=f"Importação CSV: {imported} aluno(s) importado(s)",
        after={"imported": imported, "invalid_count": len(invalid_rows) + len(errors_on_save)},
    )

    return {
        "dry_run": False,
        "total": len(raw_rows),
        "imported": imported,
        "invalid_count": len(invalid_rows) + len(errors_on_save),
        "invalid": invalid_rows,
        "errors_on_save": errors_on_save,
    }


# ---------------------------------------------------------------
# Notas do módulo (P-N9)
# ---------------------------------------------------------------

# Cabeçalhos do export de notas (services/exports.py, build_grades_csv), sem
# acento; o formato da planilha (student_number, tutor_grade...) passa direto.
# Nome, Final, Máx. faltas e Status são ignorados: a final é recalculada.
_GRADE_ALIASES = {
    "matricula": "student_number",
    "tutoria": "tutor_grade",
    "prova regular": "regular_exam_grade",
    "recuperacao": "makeup_exam_grade",
    "faltas": "absences",
}
_GRADE_LABELS = {
    "tutor_grade": "tutoria",
    "regular_exam_grade": "prova regular",
    "makeup_exam_grade": "recuperação",
}


def _grade_patch(raw: dict, idx: int) -> tuple[dict, str | None]:
    """Campos preenchidos da linha, validados. Célula vazia mantém o valor.

    O PUT /grades ajusta a nota para 0–10; aqui a linha é recusada, porque num
    import em lote o ajuste passaria despercebido ("85" no lugar de "8,5" virava 10).
    """
    patch: dict = {}
    for col, label in _GRADE_LABELS.items():
        val = raw.get(col, "")
        if not val:
            continue
        try:
            num = float(val.replace(",", "."))
        except ValueError:
            num = None
        if num is None or not 0 <= num <= 10:  # nan também cai aqui
            return {}, f"Linha {idx}: {label} deve ser um número de 0 a 10 ({val})."
        patch[col] = round(num, 2)
    val = raw.get("absences", "")
    if val:
        if not val.isdecimal():
            return {}, f"Linha {idx}: faltas deve ser um número inteiro ({val})."
        patch["absences"] = int(val)
    return patch, None


@router.post("/api/modules/{module_id}/grades/import")
def import_module_grades(
    module_id: str,
    file: Annotated[UploadFile, File(description="CSV de notas do módulo")],
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> dict:
    """Aplica as notas de um CSV às matrículas do módulo (P-N9).

    Casa por matrícula só entre as matrículas deste módulo. O sync da planilha
    (sheets.py) casa no período inteiro e repete a linha em todos os módulos do
    aluno (P-07, B-03); por isso este caminho não o reaproveita.
    """
    db = get_admin_db()
    mod = assert_module_access(db, current_user, module_id)
    assert_module_period_active(db, module_id, current_user)

    content = file.file.read()
    if len(content) > 5 * 1024 * 1024:  # 5 MB
        raise HTTPException(413, "Arquivo muito grande. Limite: 5 MB.")
    raw_rows, fatal = _parse_csv(
        content,
        required={"student_number"},
        aliases=_GRADE_ALIASES,
        labels={"student_number": "Matrícula"},
    )
    if fatal:
        raise HTTPException(422, fatal)

    enrollments = fetch_all(
        lambda lo, hi: db.table("enrollments")
        .select(
            "id, student:students!student_id(student_number), "
            "grade:grades!enrollment_id(regular_exam_grade, makeup_exam_grade)"
        )
        .eq("module_id", module_id)
        .range(lo, hi)
    )
    by_number = {(e.get("student") or {}).get("student_number"): e for e in enrollments}

    updated = 0
    not_found: list[str] = []
    invalid: list[dict] = []
    seen: set[str] = set()

    for idx, raw in enumerate(raw_rows, start=2):  # linha 1 = cabeçalho
        number = raw.get("student_number", "")
        if not number:
            continue
        if number in seen:
            invalid.append({"line": idx, "error": f"Linha {idx}: matrícula {number} repetida neste arquivo."})
            continue
        seen.add(number)
        enr = by_number.get(number)
        if not enr:
            not_found.append(number)
            continue
        patch, err = _grade_patch(raw, idx)
        if err:
            invalid.append({"line": idx, "error": err})
            continue
        if not patch:
            continue

        grade = enr.get("grade") or {}
        patch["final_grade"] = recalc_final(
            float(patch.get("regular_exam_grade", grade.get("regular_exam_grade") or 0)),
            float(patch.get("makeup_exam_grade", grade.get("makeup_exam_grade") or 0)),
        )
        db.table("grades").update(patch).eq("enrollment_id", enr["id"]).execute()
        updated += 1

    # Um registro agregado, como no sync da planilha.
    write_audit_log(
        db,
        actor=current_user,
        action="update",
        entity="grades",
        entity_id=module_id,
        summary=f"Import CSV de notas ({mod['code']}): {updated} aluno(s) atualizado(s)",
        after={
            "updated": updated,
            "not_found_count": len(not_found),
            "invalid_count": len(invalid),
        },
    )
    return {"updated": updated, "not_found": not_found, "invalid": invalid}
