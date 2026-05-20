from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_admin_db
from ..deps import get_current_user, require_role
from ..schemas.modules import Module, ModuleCreate, ModuleUpdate, StudentGradeInfo
from ..schemas.users import Profile
from ..services.audit import write_audit_log


_MODULE_AUDIT_FIELDS = (
    "name",
    "code",
    "professor_id",
    "credits",
    "max_absences",
    "is_active",
)

router = APIRouter(prefix="/api", tags=["módulos"])

_SELECT = (
    "*, "
    "professor:profiles!professor_id(id, full_name), "
    "academic_period:academic_periods!academic_period_id(id, name, is_active)"
)


def _to_module(row: dict) -> Module:
    return Module(**row)


# ---------------------------------------------------------------
# Listagem
# ---------------------------------------------------------------

@router.get("/modules", response_model=list[Module])
async def list_modules(
    period_id: str | None = None,
    current_user: Profile = Depends(get_current_user),
) -> list[Module]:
    """
    Filtra por papel:
    - admin: todos
    - coordinator: módulos dos seus períodos
    - professor: apenas os seus módulos
    """
    db = get_admin_db()
    q = db.table("modules").select(_SELECT).order("name")

    if period_id:
        q = q.eq("academic_period_id", period_id)

    if current_user.role == "coordinator":
        # Busca IDs dos períodos do coordenador
        periods = (
            db.table("academic_periods")
            .select("id")
            .eq("coordinator_id", current_user.id)
            .execute()
        )
        period_ids = [p["id"] for p in periods.data]
        if not period_ids:
            return []
        q = q.in_("academic_period_id", period_ids)
    elif current_user.role == "professor":
        q = q.eq("professor_id", current_user.id)

    resp = q.execute()
    return [_to_module(r) for r in resp.data]


@router.get("/modules/{module_id}", response_model=Module)
async def get_module(
    module_id: str,
    current_user: Profile = Depends(get_current_user),
) -> Module:
    db = get_admin_db()
    resp = (
        db.table("modules")
        .select(_SELECT)
        .eq("id", module_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Módulo não encontrado.")

    mod = _to_module(resp.data)
    _assert_access(current_user, mod)
    return mod


@router.get("/modules/{module_id}/students", response_model=list[StudentGradeInfo])
async def list_module_students(
    module_id: str,
    current_user: Profile = Depends(get_current_user),
) -> list[StudentGradeInfo]:
    """Alunos matriculados no módulo com notas. Professor vê só os seus módulos."""
    db = get_admin_db()

    mod_resp = (
        db.table("modules").select("id, professor_id, academic_period_id")
        .eq("id", module_id).maybe_single().execute()
    )
    if not mod_resp.data:
        raise HTTPException(status_code=404, detail="Módulo não encontrado.")

    _assert_access_raw(current_user, mod_resp.data)

    resp = (
        db.table("enrollments")
        .select(
            "id, status, "
            "student:students!student_id(id, student_number, full_name, email), "
            "grade:grades!enrollment_id(tutor_grade, regular_exam_grade, makeup_exam_grade, final_grade, absences, last_updated)"
        )
        .eq("module_id", module_id)
        .order("student(full_name)")
        .execute()
    )

    results: list[StudentGradeInfo] = []
    for row in resp.data:
        student = row.get("student") or {}
        grade = row.get("grade") or {}
        results.append(
            StudentGradeInfo(
                enrollment_id=row["id"],
                student_id=student.get("id", ""),
                student_number=student.get("student_number", ""),
                full_name=student.get("full_name", ""),
                email=student.get("email"),
                enrollment_status=row["status"],
                tutor_grade=grade.get("tutor_grade", 0),
                regular_exam_grade=grade.get("regular_exam_grade", 0),
                makeup_exam_grade=grade.get("makeup_exam_grade", 0),
                final_grade=grade.get("final_grade", 0),
                absences=grade.get("absences", 0),
                last_updated=grade.get("last_updated"),
            )
        )
    return results


# ---------------------------------------------------------------
# Criação
# ---------------------------------------------------------------

@router.post("/modules", response_model=Module, status_code=status.HTTP_201_CREATED)
async def create_module(
    body: ModuleCreate,
    current_user: Profile = Depends(require_role("admin", "coordinator", "professor")),
) -> Module:
    db = get_admin_db()

    # Coordenador só pode criar em seus períodos
    if current_user.role == "coordinator":
        _assert_coord_owns_period(db, current_user.id, body.academic_period_id)
    # Professor só pode criar em períodos onde já leciona
    elif current_user.role == "professor":
        existing = (
            db.table("modules")
            .select("id", count="exact")
            .eq("academic_period_id", body.academic_period_id)
            .eq("professor_id", current_user.id)
            .execute()
        )
        if (existing.count or 0) == 0:
            raise HTTPException(
                status_code=403,
                detail="Você não pode criar módulos em períodos onde ainda não leciona.",
            )
        body.professor_id = current_user.id

    _assert_code_unique(db, body.code, body.academic_period_id)

    resp = db.table("modules").insert(body.model_dump()).execute()
    created_id = resp.data[0]["id"]
    return _fetch_module(db, created_id)


@router.post(
    "/coordinator/periods/{period_id}/modules",
    response_model=Module,
    status_code=status.HTTP_201_CREATED,
)
async def coordinator_create_module(
    period_id: str,
    body: ModuleCreate,
    current_user: Profile = Depends(require_role("coordinator", "admin")),
) -> Module:
    """Coordenador cria módulo num período específico definindo o professor."""
    db = get_admin_db()

    if current_user.role == "coordinator":
        _assert_coord_owns_period(db, current_user.id, period_id)

    body.academic_period_id = period_id
    _assert_code_unique(db, body.code, period_id)

    resp = db.table("modules").insert(body.model_dump()).execute()
    created_id = resp.data[0]["id"]
    return _fetch_module(db, created_id)


# ---------------------------------------------------------------
# Atualização / Exclusão
# ---------------------------------------------------------------

@router.put("/modules/{module_id}", response_model=Module)
async def update_module(
    module_id: str,
    body: ModuleUpdate,
    current_user: Profile = Depends(require_role("admin", "coordinator")),
) -> Module:
    db = get_admin_db()

    mod_resp = (
        db.table("modules").select("id, academic_period_id")
        .eq("id", module_id).maybe_single().execute()
    )
    if not mod_resp.data:
        raise HTTPException(status_code=404, detail="Módulo não encontrado.")

    if current_user.role == "coordinator":
        _assert_coord_owns_period(db, current_user.id, mod_resp.data["academic_period_id"])

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=422, detail="Nenhum campo para atualizar.")

    before = (
        db.table("modules").select("*").eq("id", module_id).single().execute()
    )

    db.table("modules").update(update_data).eq("id", module_id).execute()
    fetched = _fetch_module(db, module_id)

    write_audit_log(
        db,
        actor=current_user,
        action="update",
        entity="modules",
        entity_id=module_id,
        summary=f"Módulo atualizado: {fetched.name}",
        before={k: before.data.get(k) for k in _MODULE_AUDIT_FIELDS},
        after={k: getattr(fetched, k, None) for k in _MODULE_AUDIT_FIELDS},
    )

    return fetched


@router.delete("/modules/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: str,
    current_user: Profile = Depends(require_role("admin", "coordinator")),
) -> None:
    db = get_admin_db()

    mod_resp = (
        db.table("modules").select("id, academic_period_id")
        .eq("id", module_id).maybe_single().execute()
    )
    if not mod_resp.data:
        raise HTTPException(status_code=404, detail="Módulo não encontrado.")

    if current_user.role == "coordinator":
        _assert_coord_owns_period(db, current_user.id, mod_resp.data["academic_period_id"])

    # Bloqueia se houver matrículas ativas
    enrollments = (
        db.table("enrollments")
        .select("id", count="exact")
        .eq("module_id", module_id)
        .execute()
    )
    if (enrollments.count or 0) > 0:
        raise HTTPException(
            status_code=400,
            detail="Não é possível excluir este módulo pois há alunos matriculados.",
        )

    before = (
        db.table("modules").select("*").eq("id", module_id).single().execute()
    )

    db.table("modules").delete().eq("id", module_id).execute()

    write_audit_log(
        db,
        actor=current_user,
        action="delete",
        entity="modules",
        entity_id=module_id,
        summary=f"Módulo excluído: {before.data.get('name', '')}",
        before={k: before.data.get(k) for k in _MODULE_AUDIT_FIELDS},
        after=None,
    )


# ---------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------

def _fetch_module(db, module_id: str) -> Module:
    resp = db.table("modules").select(_SELECT).eq("id", module_id).single().execute()
    return _to_module(resp.data)


def _assert_coord_owns_period(db, coordinator_id: str, period_id: str) -> None:
    chk = (
        db.table("academic_periods")
        .select("id")
        .eq("id", period_id)
        .eq("coordinator_id", coordinator_id)
        .maybe_single()
        .execute()
    )
    if not chk.data:
        raise HTTPException(
            status_code=403,
            detail="Você não tem permissão para gerenciar módulos neste período.",
        )


def _assert_code_unique(db, code: str, period_id: str) -> None:
    chk = (
        db.table("modules")
        .select("id")
        .eq("code", code)
        .eq("academic_period_id", period_id)
        .maybe_single()
        .execute()
    )
    if chk.data:
        raise HTTPException(
            status_code=409,
            detail=f"Já existe um módulo com o código '{code}' neste período.",
        )


def _assert_access(current_user: Profile, mod: Module) -> None:
    if current_user.role == "professor" and mod.professor_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")


def _assert_access_raw(current_user: Profile, mod_data: dict) -> None:
    if current_user.role == "professor" and mod_data.get("professor_id") != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado.")
