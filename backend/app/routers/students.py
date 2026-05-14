from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_admin_db
from ..deps import get_current_user, require_role
from ..schemas.students import (
    AbsenceUpdate,
    ModuleGradeSummary,
    Student,
    StudentCreate,
    StudentDetail,
    StudentUpdate,
)
from ..schemas.users import Profile

router = APIRouter(prefix="/api", tags=["alunos"])


# ---------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------

def _to_student(row: dict) -> Student:
    return Student(**row)


def _build_detail(student_row: dict, db) -> StudentDetail:
    """Constrói StudentDetail com módulos e notas agregadas."""
    student_id = student_row["id"]

    enrollments = (
        db.table("enrollments")
        .select(
            "id, status, "
            "module:modules!module_id(id, name, code, max_absences), "
            "grade:grades!enrollment_id(final_grade, absences)"
        )
        .eq("student_id", student_id)
        .execute()
    )

    modules: list[ModuleGradeSummary] = []
    total_abs = 0
    grades_sum = 0.0
    count = 0

    for enr in enrollments.data:
        mod = enr.get("module") or {}
        grade = enr.get("grade") or {}
        final = float(grade.get("final_grade", 0))
        absences = int(grade.get("absences", 0))
        total_abs += absences
        grades_sum += final
        count += 1
        modules.append(
            ModuleGradeSummary(
                module_id=mod.get("id", ""),
                module_name=mod.get("name", ""),
                module_code=mod.get("code", ""),
                enrollment_id=enr["id"],
                enrollment_status=enr["status"],
                final_grade=final,
                absences=absences,
                max_absences=int(mod.get("max_absences", 10)),
            )
        )

    avg = round(grades_sum / count, 2) if count > 0 else None

    return StudentDetail(
        **student_row,
        enrolled_modules=modules,
        total_absences=total_abs,
        avg_final_grade=avg,
    )


def _auto_enroll(db, student_id: str, professor_id: str) -> None:
    """Matricula o aluno em todos os módulos ativos do professor."""
    modules = (
        db.table("modules")
        .select("id")
        .eq("professor_id", professor_id)
        .eq("is_active", True)
        .execute()
    )
    for mod in modules.data:
        # Insere enrollment + grade apenas se ainda não existir
        existing = (
            db.table("enrollments")
            .select("id")
            .eq("student_id", student_id)
            .eq("module_id", mod["id"])
            .maybe_single()
            .execute()
        )
        if existing.data:
            continue

        enr = (
            db.table("enrollments")
            .insert({"student_id": student_id, "module_id": mod["id"]})
            .execute()
        )
        enrollment_id = enr.data[0]["id"]
        db.table("grades").insert({"enrollment_id": enrollment_id}).execute()


# ---------------------------------------------------------------
# Rotas de Coordenador — /api/periods/{period_id}/students
# ---------------------------------------------------------------

@router.get("/periods/{period_id}/students", response_model=list[Student])
async def list_period_students(
    period_id: str,
    active_only: bool = True,
    current_user: Profile = Depends(require_role("admin", "coordinator")),
) -> list[Student]:
    db = get_admin_db()

    if current_user.role == "coordinator":
        period_chk = (
            db.table("academic_periods")
            .select("id")
            .eq("id", period_id)
            .eq("coordinator_id", current_user.id)
            .maybe_single()
            .execute()
        )
        if not period_chk.data:
            raise HTTPException(403, "Acesso negado a este período.")

    q = db.table("students").select("*").eq("academic_period_id", period_id)
    if active_only:
        q = q.eq("is_active", True)
    resp = q.order("full_name").execute()
    return [_to_student(r) for r in resp.data]


@router.post(
    "/periods/{period_id}/students",
    response_model=Student,
    status_code=status.HTTP_201_CREATED,
)
async def create_period_student(
    period_id: str,
    body: StudentCreate,
    current_user: Profile = Depends(require_role("admin", "coordinator")),
) -> Student:
    db = get_admin_db()

    if current_user.role == "coordinator":
        period_chk = (
            db.table("academic_periods")
            .select("id")
            .eq("id", period_id)
            .eq("coordinator_id", current_user.id)
            .maybe_single()
            .execute()
        )
        if not period_chk.data:
            raise HTTPException(403, "Acesso negado a este período.")

    existing = (
        db.table("students")
        .select("id")
        .eq("student_number", body.student_number)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            409,
            f"Já existe um aluno com a matrícula '{body.student_number}'.",
        )

    payload = body.model_dump(exclude_none=True)
    payload["academic_period_id"] = period_id
    if "enrollment_date" in payload:
        payload["enrollment_date"] = str(payload["enrollment_date"])

    resp = db.table("students").insert(payload).execute()
    return _to_student(resp.data[0])


# ---------------------------------------------------------------
# Rotas de Professor — /api/professor/students
# ---------------------------------------------------------------

@router.get("/professor/students", response_model=list[StudentDetail])
async def list_professor_students(
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> list[StudentDetail]:
    """
    Agrega todos os alunos matriculados nos módulos do professor.
    Para coord/admin, retorna via período — use /periods/{id}/students.
    """
    db = get_admin_db()

    modules = (
        db.table("modules")
        .select("id")
        .eq("professor_id", current_user.id)
        .eq("is_active", True)
        .execute()
    )
    if not modules.data:
        return []

    module_ids = [m["id"] for m in modules.data]

    enrollments = (
        db.table("enrollments")
        .select("student_id")
        .in_("module_id", module_ids)
        .execute()
    )
    student_ids = list({e["student_id"] for e in enrollments.data})
    if not student_ids:
        return []

    students = (
        db.table("students")
        .select("*")
        .in_("id", student_ids)
        .eq("is_active", True)
        .order("full_name")
        .execute()
    )

    return [_build_detail(s, db) for s in students.data]


@router.post(
    "/professor/students",
    response_model=StudentDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_professor_student(
    body: StudentCreate,
    current_user: Profile = Depends(require_role("professor")),
) -> StudentDetail:
    """Cria aluno e auto-matricula em todos os módulos ativos do professor."""
    db = get_admin_db()

    # Busca o período ativo do professor
    modules = (
        db.table("modules")
        .select("academic_period_id")
        .eq("professor_id", current_user.id)
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    if not modules.data:
        raise HTTPException(
            400,
            "Você não tem módulos ativos. Solicite ao coordenador que crie um módulo.",
        )

    period_id = modules.data[0]["academic_period_id"]

    existing = (
        db.table("students")
        .select("id")
        .eq("student_number", body.student_number)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            409,
            f"Já existe um aluno com a matrícula '{body.student_number}'.",
        )

    payload = body.model_dump(exclude_none=True)
    payload["academic_period_id"] = period_id
    if "enrollment_date" in payload:
        payload["enrollment_date"] = str(payload["enrollment_date"])

    resp = db.table("students").insert(payload).execute()
    student_row = resp.data[0]
    _auto_enroll(db, student_row["id"], current_user.id)

    return _build_detail(student_row, db)


@router.get("/professor/students/{student_id}", response_model=StudentDetail)
async def get_professor_student(
    student_id: str,
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> StudentDetail:
    db = get_admin_db()

    if current_user.role == "professor":
        _assert_prof_has_student(db, current_user.id, student_id)

    resp = (
        db.table("students").select("*").eq("id", student_id).maybe_single().execute()
    )
    if not resp.data:
        raise HTTPException(404, "Aluno não encontrado.")

    return _build_detail(resp.data, db)


@router.put("/professor/students/{student_id}", response_model=Student)
async def update_professor_student(
    student_id: str,
    body: StudentUpdate,
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> Student:
    db = get_admin_db()

    if current_user.role == "professor":
        _assert_prof_has_student(db, current_user.id, student_id)

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(422, "Nenhum campo para atualizar.")
    if "enrollment_date" in update_data:
        update_data["enrollment_date"] = str(update_data["enrollment_date"])

    db.table("students").update(update_data).eq("id", student_id).execute()

    resp = (
        db.table("students").select("*").eq("id", student_id).single().execute()
    )
    return _to_student(resp.data)


@router.delete(
    "/professor/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def deactivate_student(
    student_id: str,
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> None:
    """Soft delete — marca o aluno como inativo."""
    db = get_admin_db()

    if current_user.role == "professor":
        _assert_prof_has_student(db, current_user.id, student_id)
        # Verifica se o aluno pertence EXCLUSIVAMENTE a módulos deste professor
        all_enrollments = (
            db.table("enrollments")
            .select("module_id")
            .eq("student_id", student_id)
            .execute()
        )
        module_ids = [e["module_id"] for e in all_enrollments.data]
        other_modules = (
            db.table("modules")
            .select("id", count="exact")
            .in_("id", module_ids)
            .neq("professor_id", current_user.id)
            .execute()
        )
        if (other_modules.count or 0) > 0:
            raise HTTPException(
                403,
                "Este aluno está matriculado em módulos de outros professores. "
                "Solicite ao coordenador que o desative.",
            )

    db.table("students").update({"is_active": False}).eq("id", student_id).execute()


# ---------------------------------------------------------------
# Faltas / Certificados médicos
# ---------------------------------------------------------------

@router.get("/professor/students/{student_id}/absences")
async def get_student_absences(
    student_id: str,
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> dict:
    db = get_admin_db()

    if current_user.role == "professor":
        _assert_prof_has_student(db, current_user.id, student_id)

    student = (
        db.table("students")
        .select("id, full_name, student_number, medical_certificates")
        .eq("id", student_id)
        .maybe_single()
        .execute()
    )
    if not student.data:
        raise HTTPException(404, "Aluno não encontrado.")

    enrollments = (
        db.table("enrollments")
        .select(
            "id, status, "
            "module:modules!module_id(id, name, code, max_absences), "
            "grade:grades!enrollment_id(absences)"
        )
        .eq("student_id", student_id)
        .execute()
    )

    by_module = []
    for enr in enrollments.data:
        mod = enr.get("module") or {}
        grade = enr.get("grade") or {}
        by_module.append(
            {
                "module_id": mod.get("id"),
                "module_name": mod.get("name"),
                "module_code": mod.get("code"),
                "enrollment_id": enr["id"],
                "absences": int(grade.get("absences", 0)),
                "max_absences": int(mod.get("max_absences", 10)),
            }
        )

    return {
        "student_id": student_id,
        "full_name": student.data["full_name"],
        "student_number": student.data["student_number"],
        "medical_certificates": student.data["medical_certificates"],
        "absences_by_module": by_module,
    }


@router.put("/professor/students/{student_id}/absences")
async def update_student_absences(
    student_id: str,
    body: AbsenceUpdate,
    current_user: Profile = Depends(require_role("professor", "coordinator", "admin")),
) -> dict:
    db = get_admin_db()

    if current_user.role == "professor":
        _assert_prof_has_student(db, current_user.id, student_id)

    update_data: dict = {}
    if body.medical_certificates is not None:
        update_data["medical_certificates"] = body.medical_certificates

    if update_data:
        db.table("students").update(update_data).eq("id", student_id).execute()

    return {"message": "Atualizado com sucesso."}


# ---------------------------------------------------------------
# Helper de permissão
# ---------------------------------------------------------------

def _assert_prof_has_student(db, professor_id: str, student_id: str) -> None:
    """Verifica que o aluno está matriculado em pelo menos um módulo do professor."""
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
