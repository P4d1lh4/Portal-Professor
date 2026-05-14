from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from .auth import bearer_scheme, decode_supabase_jwt
from .db import get_admin_db
from .schemas.users import Profile, UserRole


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Profile:
    """Valida o JWT do Supabase e retorna o profile do usuário corrente."""
    payload = decode_supabase_jwt(credentials.credentials)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token sem identificador de usuário.",
        )

    db = get_admin_db()
    resp = db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de usuário não encontrado.",
        )
    return Profile(**resp.data)


def require_role(*roles: UserRole):
    """Factory que retorna uma dependency que exige um dos papéis informados."""

    async def _check(current_user: Profile = Depends(get_current_user)) -> Profile:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Acesso negado. Você não tem permissão para esta ação.",
            )
        return current_user

    return _check
