import logging

from fastapi import APIRouter, Depends, HTTPException, status

from ..db import fetch_all, get_admin_db
from ..deps import get_current_user, require_role
from ..schemas.periods import Period, PeriodCreate, PeriodDeletionSummary, PeriodUpdate
from ..schemas.users import Profile
from ..services.audit import write_audit_log
from .medical_certificates import BUCKET as CERTIFICATES_BUCKET

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["períodos"])

_SELECT = "*, coordinator:profiles!coordinator_id(id, full_name)"

_PERIOD_AUDIT_FIELDS = ("name", "coordinator_id", "start_date", "end_date", "is_active")


def _to_period(row: dict) -> Period:
    return Period(**row)


def _assert_period_access(db, current_user: Profile, period: dict) -> None:
    """Garante que o usuário tem acesso ao período conforme o papel.

    Como o backend usa o service role (que faz bypass de RLS), o isolamento
    por papel precisa ser garantido aqui na camada de aplicação — caso
    contrário qualquer usuário autenticado leria qualquer período por ID.

    Levanta 404 (em vez de 403) para não revelar a existência de períodos
    de terceiros.
    """
    if current_user.role == "admin":
        return
    if current_user.role == "coordinator":
        if period.get("coordinator_id") == current_user.id:
            return
    elif current_user.role == "professor":
        mods = (
            db.table("modules")
            .select("id")
            .eq("professor_id", current_user.id)
            .eq("academic_period_id", period["id"])
            .limit(1)
            .execute()
        )
        if mods.data:
            return
    raise HTTPException(status_code=404, detail="Período não encontrado.")


# ---------------------------------------------------------------
# Listagem
# ---------------------------------------------------------------

@router.get("/periods", response_model=list[Period])
def list_periods(
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
def list_active_periods(
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
def coordinator_periods(
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
def get_period(
    period_id: str,
    current_user: Profile = Depends(get_current_user),
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
    _assert_period_access(db, current_user, resp.data)
    return _to_period(resp.data)


# ---------------------------------------------------------------
# CRUD (admin)
# ---------------------------------------------------------------

def _insert_period(db, body: PeriodCreate) -> str:
    """Checa o nome (único) e insere o período; devolve o id novo."""
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
    return resp.data[0]["id"]


@router.post(
    "/periods/{period_id}/clone",
    response_model=Period,
    status_code=status.HTTP_201_CREATED,
)
def clone_period(
    period_id: str,
    body: PeriodCreate,
    current_user: Profile = Depends(require_role("admin")),
) -> Period:
    """Cria um período novo com cópia dos módulos ativos de outro (P-Q5).

    Copia código, nome, professor, créditos e limite de faltas. Alunos não:
    `student_number` é único no banco inteiro (0001) e o vínculo aluno ×
    período ainda é decisão pendente (B-08).
    """
    db = get_admin_db()

    source = (
        db.table("academic_periods").select("id, name").eq("id", period_id).maybe_single().execute()
    )
    if not source.data:
        raise HTTPException(status_code=404, detail="Período não encontrado.")

    new_id = _insert_period(db, body)

    modules = (
        db.table("modules")
        .select("name, code, professor_id, credits, max_absences")
        .eq("academic_period_id", period_id)
        .eq("is_active", True)
        .execute()
    ).data or []
    if modules:
        try:
            db.table("modules").insert(
                [{**m, "academic_period_id": new_id, "is_active": True} for m in modules]
            ).execute()
        except Exception:
            # ponytail: compensação no app, como na matrícula (alteração 42); sem
            # ela sobrava um período novo sem os módulos que o admin pediu.
            db.table("academic_periods").delete().eq("id", new_id).execute()
            raise

    full = db.table("academic_periods").select(_SELECT).eq("id", new_id).single().execute()
    write_audit_log(
        db,
        actor=current_user,
        action="insert",
        entity="periods",
        entity_id=new_id,
        summary=(
            f"Período criado a partir de {source.data['name']}: "
            f"{len(modules)} módulo(s) copiado(s)"
        ),
        after={
            **{k: full.data.get(k) for k in _PERIOD_AUDIT_FIELDS},
            "cloned_from": period_id,
            "modules": len(modules),
        },
    )
    return _to_period(full.data)


@router.post("/periods", response_model=Period, status_code=status.HTTP_201_CREATED)
def create_period(
    body: PeriodCreate,
    current_user: Profile = Depends(require_role("admin")),
) -> Period:
    db = get_admin_db()
    created_id = _insert_period(db, body)

    full = (
        db.table("academic_periods")
        .select(_SELECT)
        .eq("id", created_id)
        .single()
        .execute()
    )
    write_audit_log(
        db,
        actor=current_user,
        action="insert",
        entity="periods",
        entity_id=created_id,
        summary=f"Período criado: {body.name}",
        after={k: full.data.get(k) for k in _PERIOD_AUDIT_FIELDS},
    )
    return _to_period(full.data)


@router.put("/periods/{period_id}", response_model=Period)
def update_period(
    period_id: str,
    body: PeriodUpdate,
    current_user: Profile = Depends(require_role("admin")),
) -> Period:
    db = get_admin_db()

    # exclude_unset permite limpar campos (ex.: end_date=null) — exclude_none os descartava.
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=422, detail="Nenhum campo para atualizar.")

    for date_field in ("start_date", "end_date"):
        if date_field in update_data and update_data[date_field]:
            update_data[date_field] = str(update_data[date_field])

    before = (
        db.table("academic_periods").select("*").eq("id", period_id).maybe_single().execute()
    )
    if not before.data:
        raise HTTPException(status_code=404, detail="Período não encontrado.")

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

    # Encerrar/reabrir é o que trava ou libera notas e chamada do período.
    was_active, is_active = before.data.get("is_active"), resp.data.get("is_active")
    write_audit_log(
        db,
        actor=current_user,
        action="update",
        entity="periods",
        entity_id=period_id,
        summary=(
            f"Período {'reaberto' if is_active else 'encerrado'}: {resp.data.get('name')}"
            if was_active != is_active
            else f"Período atualizado: {resp.data.get('name')}"
        ),
        before={k: before.data.get(k) for k in update_data},
        after={k: resp.data.get(k) for k in update_data},
    )
    return _to_period(resp.data)


# ---------------------------------------------------------------
# Exclusão (admin): resumo do que vai junto + exclusão em cascata
# ---------------------------------------------------------------

def _count(db, table: str, select: str, column: str, period_id: str) -> int:
    resp = db.table(table).select(select, count="exact").eq(column, period_id).limit(1).execute()
    return resp.count or 0


def _attachment_paths(db, period_id: str) -> list[str]:
    rows = fetch_all(
        lambda lo, hi: db.table("medical_certificate_attachments")
        .select("storage_path, medical_certificates!inner(students!inner(academic_period_id))")
        .eq("medical_certificates.students.academic_period_id", period_id)
        .range(lo, hi)
    )
    return [r["storage_path"] for r in rows]


def _period_links(db, period_id: str) -> dict:
    """Conta o que a exclusão do período leva junto.

    Matrícula, chamada e atestado não guardam o período: o filtro vai no
    recurso embutido, com `!inner` (sem ele o filtro não tira linhas; ver
    sheets.py). A matrícula exige aluno e módulo do mesmo período (P-Q1), então
    contar pelo módulo basta. Cada matrícula tem sua linha de notas e faltas.
    """
    modules = (
        db.table("modules")
        .select("professor:profiles!professor_id(full_name)")
        .eq("academic_period_id", period_id)
        .execute()
    ).data or []
    by_module = ("id, modules!inner(academic_period_id)", "modules.academic_period_id")
    by_student = ("id, students!inner(academic_period_id)", "students.academic_period_id")
    return {
        "students": _count(db, "students", "id", "academic_period_id", period_id),
        "modules": len(modules),
        "professors": sorted({m["professor"]["full_name"] for m in modules if m.get("professor")}),
        "enrollments": _count(db, "enrollments", *by_module, period_id),
        "attendance_records": _count(db, "attendance_records", *by_module, period_id),
        "medical_certificates": _count(db, "medical_certificates", *by_student, period_id),
        "attachments": len(_attachment_paths(db, period_id)),
    }


def _delete_period_contents(db, period_id: str) -> None:
    """Apaga alunos e módulos do período; o banco leva o resto em cascata
    (matrículas com notas e presenças, chamadas, atestados com anexos).

    ponytail: passos soltos, sem transação. Se um falhar no meio, o período
    fica com parte do conteúdo e excluir de novo termina o serviço. Vira
    função plpgsql (como a 0007) se precisar ser atômico.
    """
    paths = _attachment_paths(db, period_id)
    if paths:
        # Os PDFs antes das linhas: o cascade apaga os registros, não os arquivos.
        try:
            db.storage.from_(CERTIFICATES_BUCKET).remove(paths)
        except Exception as exc:  # pragma: no cover
            logger.warning("Falha ao remover anexos do período %s: %s", period_id, exc)
    db.table("students").delete().eq("academic_period_id", period_id).execute()
    db.table("modules").delete().eq("academic_period_id", period_id).execute()


@router.get("/periods/{period_id}/deletion-summary", response_model=PeriodDeletionSummary)
def period_deletion_summary(
    period_id: str,
    current_user: Profile = Depends(require_role("admin")),
) -> PeriodDeletionSummary:
    """O que a exclusão apaga junto, para a tela mostrar antes de confirmar."""
    db = get_admin_db()
    period = db.table("academic_periods").select(_SELECT).eq("id", period_id).maybe_single().execute()
    if not period.data:
        raise HTTPException(status_code=404, detail="Período não encontrado.")
    return PeriodDeletionSummary(
        name=period.data["name"],
        coordinator=(period.data.get("coordinator") or {}).get("full_name"),
        **_period_links(db, period_id),
    )


@router.delete("/periods/{period_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_period(
    period_id: str,
    cascade: bool = False,
    current_user: Profile = Depends(require_role("admin")),
) -> None:
    """Exclui o período. Com alunos ou módulos, só com `cascade=true`, que apaga
    tudo o que é dele: a tela mostra antes o `deletion-summary` e pede
    confirmação. Sem o parâmetro a recusa continua, e um front antigo em cache
    não apaga tudo com o diálogo simples.
    """
    db = get_admin_db()
    before = (
        db.table("academic_periods")
        .select("name, is_active")
        .eq("id", period_id)
        .maybe_single()
        .execute()
    )
    if not before.data:
        raise HTTPException(status_code=404, detail="Período não encontrado.")

    links = _period_links(db, period_id)
    if links["students"] or links["modules"]:
        if not cascade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Este período tem alunos ou módulos vinculados. Atualize a "
                    "página para ver o que será excluído junto e confirmar."
                ),
            )
        _delete_period_contents(db, period_id)

    db.table("academic_periods").delete().eq("id", period_id).execute()

    write_audit_log(
        db,
        actor=current_user,
        action="delete",
        entity="periods",
        entity_id=period_id,
        summary=f"Período excluído: {before.data['name']}",
        before={**before.data, **links},
        after=None,
    )
