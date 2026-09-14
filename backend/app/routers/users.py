import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status  # noqa: I001

from ..db import get_admin_db
from ..deps import get_current_user, invalidate_profile_cache, require_role
from ..schemas.common import Paginated
from ..schemas.users import (
    ChangePasswordRequest,
    Profile,
    ProfilePublic,
    UserCreate,
    UserUpdate,
    UserRole,
)
from ..config import settings
from ..services.audit import write_audit_log
from ..services.search import build_ilike_or
from ..services.ratelimit import check_rate_limit
from supabase import create_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["usuários"])

_USER_AUDIT_FIELDS = ("username", "full_name", "email", "role", "is_active")


# ---------------------------------------------------------------
# /api/me
# ---------------------------------------------------------------

@router.get("/me", response_model=Profile)
def me(current_user: Profile = Depends(get_current_user)) -> Profile:
    """Retorna o perfil do usuário autenticado."""
    return current_user


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(
    body: ChangePasswordRequest,
    current_user: Profile = Depends(get_current_user),
) -> None:
    """
    Permite o usuário trocar a própria senha.

    Valida a senha atual via login no Supabase Auth (com anon key)
    e, em sucesso, atualiza via Admin API (service role).
    """
    # Rate limit por usuário: evita brute-force da senha atual (que é
    # revalidada por login no Supabase a cada tentativa).
    if not check_rate_limit(f"change-password:{current_user.id}", max_calls=5, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Muitas tentativas de troca de senha. Aguarde um minuto e tente novamente.",
        )
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A nova senha deve ter ao menos 8 caracteres.",
        )
    if body.new_password == body.current_password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="A nova senha deve ser diferente da atual.",
        )

    # Valida a senha atual fazendo um login no endpoint /auth/v1/token via
    # httpx (não via supabase-py, que valida o formato JWT da chave —
    # incompatível com o novo formato `sb_publishable_*`).
    async with httpx.AsyncClient(timeout=10.0) as client:
        login_resp = await client.post(
            f"{settings.supabase_url}/auth/v1/token?grant_type=password",
            headers={
                "apikey": settings.supabase_anon_key,
                "Content-Type": "application/json",
            },
            json={"email": current_user.email, "password": body.current_password},
        )
    if login_resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta.",
        )

    # Atualiza via Admin API
    admin_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        admin_client.auth.admin.update_user_by_id(
            current_user.id, {"password": body.new_password}
        )
    except Exception:
        # Não expõe detalhes internos do Supabase Auth (stack trace, hosts)
        # na resposta — apenas registra no log do servidor.
        logger.exception("Falha ao atualizar senha do usuário %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível alterar a senha. Tente novamente mais tarde.",
        )


# ---------------------------------------------------------------
# Listagem (admin e helpers para dropdowns)
# ---------------------------------------------------------------

@router.get("/users", response_model=Paginated[Profile])
def list_users(
    search: str | None = Query(None, description="Busca por nome, e-mail ou usuário"),
    role: UserRole | None = Query(None, description="Filtra por papel"),
    is_active: bool | None = Query(None, description="Filtra por ativo/inativo"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _: Profile = Depends(require_role("admin")),
) -> Paginated[Profile]:
    """Lista usuários com busca + paginação. Apenas admin."""
    db = get_admin_db()

    q = db.table("profiles").select("*", count="exact").order("full_name")

    if role is not None:
        q = q.eq("role", role)
    if is_active is not None:
        q = q.eq("is_active", is_active)
    if search:
        or_filter = build_ilike_or(search, ["full_name", "email", "username"])
        if or_filter:
            q = q.or_(or_filter)

    resp = q.range(offset, offset + limit - 1).execute()
    items = [Profile(**row) for row in resp.data]
    total = resp.count if resp.count is not None else len(items)
    return Paginated[Profile](items=items, total=total, limit=limit, offset=offset)


@router.get("/coordinators", response_model=list[ProfilePublic])
def list_coordinators(
    _: Profile = Depends(get_current_user),
) -> list[ProfilePublic]:
    """Lista coordenadores (para dropdowns). Qualquer usuário autenticado."""
    db = get_admin_db()
    resp = (
        db.table("profiles")
        .select("id, username, full_name, role")
        .eq("role", "coordinator")
        .order("full_name")
        .execute()
    )
    return [ProfilePublic(**row) for row in resp.data]


@router.get("/professors", response_model=list[ProfilePublic])
def list_professors(
    _: Profile = Depends(get_current_user),
) -> list[ProfilePublic]:
    """Lista professores (para dropdowns). Qualquer usuário autenticado."""
    db = get_admin_db()
    resp = (
        db.table("profiles")
        .select("id, username, full_name, role")
        .eq("role", "professor")
        .order("full_name")
        .execute()
    )
    return [ProfilePublic(**row) for row in resp.data]


# ---------------------------------------------------------------
# CRUD de usuários (admin)
# ---------------------------------------------------------------

@router.post("/users", response_model=Profile, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    current_user: Profile = Depends(require_role("admin")),
) -> Profile:
    """Cria um novo usuário via Supabase Admin API. Apenas admin."""
    db = get_admin_db()

    # Checa o username antes de criar a conta: Auth e profiles não têm rollback
    # entre si, e a colisão depois deixava a conta no Auth sem profile coerente.
    taken = (
        db.table("profiles")
        .select("id")
        .eq("username", body.username)
        .maybe_single()
        .execute()
    )
    if taken.data:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe um usuário com este nome de usuário.",
        )

    # Usamos a service role key diretamente para a Admin API
    admin_client = create_client(settings.supabase_url, settings.supabase_service_role_key)

    try:
        auth_resp = admin_client.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
            "user_metadata": {
                "role": body.role,
                "username": body.username,
                "full_name": body.full_name,
            },
        })
    except Exception as exc:
        if "already registered" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um usuário com este e-mail.",
            )
        # Não devolve a mensagem crua do SDK (hosts, detalhes internos).
        logger.exception("Falha ao criar usuário no Supabase Auth")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Não foi possível criar o usuário. Tente novamente mais tarde.",
        )

    user_id = auth_resp.user.id

    # O trigger handle_new_user já criou o profile; garante campos corretos
    db.table("profiles").update({
        "username": body.username,
        "full_name": body.full_name,
        "role": body.role,
    }).eq("id", user_id).execute()

    resp = db.table("profiles").select("*").eq("id", user_id).single().execute()
    created = Profile(**resp.data)
    write_audit_log(
        db,
        actor=current_user,
        action="insert",
        entity="users",
        entity_id=user_id,
        summary=f"Usuário criado: {created.full_name} ({created.role})",
        after={k: getattr(created, k) for k in _USER_AUDIT_FIELDS},
    )
    return created


@router.put("/users/{user_id}", response_model=Profile)
def update_user(
    user_id: str,
    body: UserUpdate,
    current_user: Profile = Depends(require_role("admin")),
) -> Profile:
    """Atualiza dados de um usuário. Apenas admin."""
    db = get_admin_db()

    # exclude_unset: só os campos que o cliente enviou explicitamente (permite
    # limpar um campo mandando null, ao contrário de exclude_none).
    update_data = body.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhum campo para atualizar.",
        )

    before = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if not before.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    db.table("profiles").update(update_data).eq("id", user_id).execute()
    invalidate_profile_cache(user_id)

    after = db.table("profiles").select("*").eq("id", user_id).single().execute().data
    old_role, new_role = before.data.get("role"), after.get("role")
    write_audit_log(
        db,
        actor=current_user,
        action="update",
        entity="users",
        entity_id=user_id,
        summary=(
            f"Papel alterado: {after.get('full_name')} ({old_role} → {new_role})"
            if old_role != new_role
            else f"Usuário atualizado: {after.get('full_name')}"
        ),
        before={k: before.data.get(k) for k in update_data},
        after={k: after.get(k) for k in update_data},
    )
    return Profile(**after)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: str,
    current_user: Profile = Depends(require_role("admin")),
) -> None:
    """
    Desativa um usuário (soft delete). Apenas admin. Não permite auto-desativação.

    O registro fica no banco para preservar FKs em períodos/módulos/atestados.
    Próximas requisições do usuário recebem 403 até ser reativado.
    """
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode desativar sua própria conta.",
        )

    db = get_admin_db()
    target = (
        db.table("profiles")
        .select("id, is_active, full_name")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not target.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    if not target.data.get("is_active", True):
        # Já está inativo — operação idempotente
        return

    db.table("profiles").update({"is_active": False}).eq("id", user_id).execute()
    invalidate_profile_cache(user_id)

    write_audit_log(
        db,
        actor=current_user,
        action="update",
        entity="users",
        entity_id=user_id,
        summary=f"Usuário desativado: {target.data.get('full_name', user_id)}",
        before={"is_active": True},
        after={"is_active": False},
    )


@router.post("/users/{user_id}/reactivate", response_model=Profile)
def reactivate_user(
    user_id: str,
    current_user: Profile = Depends(require_role("admin")),
) -> Profile:
    """Reativa um usuário previamente desativado. Apenas admin."""
    db = get_admin_db()

    target = (
        db.table("profiles")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    if not target.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )

    db.table("profiles").update({"is_active": True}).eq("id", user_id).execute()
    invalidate_profile_cache(user_id)

    if not target.data.get("is_active", True):
        write_audit_log(
            db,
            actor=current_user,
            action="update",
            entity="users",
            entity_id=user_id,
            summary=f"Usuário reativado: {target.data.get('full_name', user_id)}",
            before={"is_active": False},
            after={"is_active": True},
        )

    resp = db.table("profiles").select("*").eq("id", user_id).single().execute()
    return Profile(**resp.data)
