from fastapi import APIRouter, Depends, HTTPException, status

from ..db import get_admin_db
from ..deps import get_current_user, require_role
from ..schemas.users import Profile, ProfilePublic, UserCreate, UserUpdate
from ..config import settings
from supabase import create_client

router = APIRouter(prefix="/api", tags=["usuários"])


# ---------------------------------------------------------------
# /api/me
# ---------------------------------------------------------------

@router.get("/me", response_model=Profile)
async def me(current_user: Profile = Depends(get_current_user)) -> Profile:
    """Retorna o perfil do usuário autenticado."""
    return current_user


# ---------------------------------------------------------------
# Listagem (admin e helpers para dropdowns)
# ---------------------------------------------------------------

@router.get("/users", response_model=list[Profile])
async def list_users(
    _: Profile = Depends(require_role("admin")),
) -> list[Profile]:
    """Lista todos os usuários. Apenas admin."""
    db = get_admin_db()
    resp = db.table("profiles").select("*").order("full_name").execute()
    return [Profile(**row) for row in resp.data]


@router.get("/coordinators", response_model=list[ProfilePublic])
async def list_coordinators(
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
async def list_professors(
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
async def create_user(
    body: UserCreate,
    _: Profile = Depends(require_role("admin")),
) -> Profile:
    """Cria um novo usuário via Supabase Admin API. Apenas admin."""
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
        detail = str(exc)
        if "already registered" in detail.lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um usuário com este e-mail.",
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    user_id = auth_resp.user.id

    # O trigger handle_new_user já criou o profile; garante campos corretos
    db = get_admin_db()
    db.table("profiles").update({
        "username": body.username,
        "full_name": body.full_name,
        "role": body.role,
    }).eq("id", user_id).execute()

    resp = db.table("profiles").select("*").eq("id", user_id).single().execute()
    return Profile(**resp.data)


@router.put("/users/{user_id}", response_model=Profile)
async def update_user(
    user_id: str,
    body: UserUpdate,
    _: Profile = Depends(require_role("admin")),
) -> Profile:
    """Atualiza dados de um usuário. Apenas admin."""
    db = get_admin_db()

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhum campo para atualizar.",
        )

    db.table("profiles").update(update_data).eq("id", user_id).execute()

    resp = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado.",
        )
    return Profile(**resp.data)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_user: Profile = Depends(require_role("admin")),
) -> None:
    """Remove um usuário. Apenas admin. Não permite auto-exclusão."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode excluir sua própria conta.",
        )

    admin_client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    try:
        admin_client.auth.admin.delete_user(user_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Erro ao remover usuário: {exc}",
        )
