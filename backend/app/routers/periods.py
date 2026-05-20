from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_admin_db
from ..deps import get_current_user, require_role
from ..schemas.periods import Period, PeriodCreate, PeriodUpdate
from ..schemas.users import Profile
from ..services.audit import write_audit_log

router = APIRouter(prefix="/api", tags=["períodos"])

_SELECT = "*, coordinator:profiles!coordinator_id(id, full_name)"


def _to_period(row: dict) -> Period:
    return Period(**row)


# ---------------------------------------------------------------
# Listagem
# ---------------------------------------------------------------

@router.get("/periods", response_model=list[Period])
async def list_periods(
    current_user: Profile = Depends(get_current_user),
) -> list[Period]:
    """Admin lista todos; coordenador lista os seus; professor lista os que tem módulos."""
    db = get_admin_db()
    q = db.table("academic_periods").select(_SELECT).order("name")

    if current_user.role == "coordinator":
        q = q.eq("coordinator_id", current_user.id)
    elif current_user.role == "professor":
        # Lista períodos que possuem módulos do professor
        modules_resp = (
            db.table("modules")
            .select("academic_period_id")
            .eq("professor_id", current_user.id)
            .execute()
        )
        period_ids = list({m["academic_period_id"] for m in modules_resp.data})
        if not period_ids:
            return []
        q = q.in_("id", period_ids)

    resp = q.execute()
    return [_to_period(r) for r in resp.data]


@router.get("/periods/active", response_model=list[Period])
async def list_active_periods(
    current_user: Profile = Depends(get_current_user),
) -> list[Period]:
    """
    Lista períodos ativos filtrados pelo papel — mesmo critério de
    /api/periods, garantindo que selects/dropdowns não ofereçam
    períodos aos quais o usuário não tem acesso (evita 403 silencioso).

    - admin: todos os ativos
    - coordinator: ativos sob sua coordenação
    - professor: ativos onde tem ao menos um módulo
    """
    db = get_admin_db()
    q = (
        db.table("academic_periods")
        .select(_SELECT)
        .eq("is_active", True)
        .order("name")
    )

    if current_user.role == "coordinator":
        q = q.eq("coordinator_id", current_user.id)
    elif current_user.role == "professor":
        modules_resp = (
            db.table("modules")
            .select("academic_period_id")
            .eq("professor_id", current_user.id)
            .execute()
        )
        period_ids = list({m["academic_period_id"] for m in modules_resp.data})
        if not period_ids:
            return []
        q = q.in_("id", period_ids)

    resp = q.execute()
    return [_to_period(r) for r in resp.data]


@router.get("/coordinator/periods", response_model=list[Period])
async def coordinator_periods(
    current_user: Profile = Depends(require_role("coordinator")),
) -> list[Period]:
    """Atalho: períodos do coordenador autenticado."""
    db = get_admin_db()
    resp = (
        db.table("academic_periods")
        .select(_SELECT)
        .eq("coordinator_id", current_user.id)
        .order("name")
        .execute()
    )
    return [_to_period(r) for r in resp.data]


@router.get("/periods/{period_id}", response_model=Period)
async def get_period(
    period_id: str,
    _: Profile = Depends(get_current_user),
) -> Period:
    db = get_admin_db()
    resp = (
        db.table("academic_periods")
        .select(_SELECT)
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Período não encontrado.")
    return _to_period(resp.data)


# ---------------------------------------------------------------
# CRUD (admin)
# ---------------------------------------------------------------

@router.post("/periods", response_model=Period, status_code=status.HTTP_201_CREATED)
async def create_period(
    body: PeriodCreate,
    _: Profile = Depends(require_role("admin")),
) -> Period:
    db = get_admin_db()

    # Verifica unicidade do nome
    existing = (
        db.table("academic_periods")
        .select("id")
        .eq("name", body.name)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe um período com o nome '{body.name}'.",
        )

    payload = body.model_dump(exclude_none=True)
    if "start_date" in payload and payload["start_date"]:
        payload["start_date"] = str(payload["start_date"])
    if "end_date" in payload and payload["end_date"]:
        payload["end_date"] = str(payload["end_date"])

    resp = db.table("academic_periods").insert(payload).execute()
    created_id = resp.data[0]["id"]

    full = (
        db.table("academic_periods")
        .select(_SELECT)
        .eq("id", created_id)
        .single()
        .execute()
    )
    return _to_period(full.data)


@router.put("/periods/{period_id}", response_model=Period)
async def update_period(
    period_id: str,
    body: PeriodUpdate,
    _: Profile = Depends(require_role("admin")),
) -> Period:
    db = get_admin_db()

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=422, detail="Nenhum campo para atualizar.")

    for date_field in ("start_date", "end_date"):
        if date_field in update_data and update_data[date_field]:
            update_data[date_field] = str(update_data[date_field])

    db.table("academic_periods").update(update_data).eq("id", period_id).execute()

    resp = (
        db.table("academic_periods")
        .select(_SELECT)
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Período não encontrado.")
    return _to_period(resp.data)


@router.delete("/periods/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_period(
    period_id: str,
    current_user: Profile = Depends(require_role("admin")),
) -> None:
    db = get_admin_db()

    # Impede exclusão se houver alunos ou módulos no período
    students = (
        db.table("students")
        .select("id", count="exact")
        .eq("academic_period_id", period_id)
        .execute()
    )
    modules = (
        db.table("modules")
        .select("id", count="exact")
        .eq("academic_period_id", period_id)
        .execute()
    )

    if (students.count or 0) > 0 or (modules.count or 0) > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Não é possível excluir este período pois ele possui "
                "alunos ou módulos vinculados. Desative-o em vez disso."
            ),
        )

    before = (
        db.table("academic_periods")
        .select("*")
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )

    db.table("academic_periods").delete().eq("id", period_id).execute()

    period_name = (before.data or {}).get("name", period_id)
    write_audit_log(
        db,
        actor=current_user,
        action="delete",
        entity="periods",
        entity_id=period_id,
        summary=f"Período excluído: {period_name}",
        before={"name": period_name, "is_active": (before.data or {}).get("is_active")},
        after=None,
    )
