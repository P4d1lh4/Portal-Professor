import asyncio  # noqa: I001
import time
from threading import Lock

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from .auth import bearer_scheme, decode_supabase_jwt
from .db import get_admin_db
from .schemas.users import Profile, UserRole


# Cache em memória de profiles. Chave: user_id (sub do JWT). Valor: (Profile, expires_at).
# TTL curto (5 min) garante que mudanças de papel/dados se propaguem rapidamente
# sem precisar de invalidação manual.
_PROFILE_TTL_SECONDS = 300
_profile_cache: dict[str, tuple[Profile, float]] = {}
_profile_lock = Lock()


def _cache_get(user_id: str) -> Profile | None:
    with _profile_lock:
        entry = _profile_cache.get(user_id)
        if entry is None:
            return None
        profile, expires_at = entry
        if time.monotonic() >= expires_at:
            _profile_cache.pop(user_id, None)
            return None
        return profile


def _cache_set(user_id: str, profile: Profile) -> None:
    with _profile_lock:
        _profile_cache[user_id] = (profile, time.monotonic() + _PROFILE_TTL_SECONDS)


def invalidate_profile_cache(user_id: str) -> None:
    """Remove o profile do cache (chamar após updates em /profiles)."""
    with _profile_lock:
        _profile_cache.pop(user_id, None)


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

    cached = _cache_get(user_id)
    if cached is not None:
        if not cached.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sua conta foi desativada. Procure o administrador.",
            )
        return cached

    db = get_admin_db()
    resp = await asyncio.to_thread(
        lambda: db.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Perfil de usuário não encontrado.",
        )
    profile = Profile(**resp.data)
    if not profile.is_active:
        # Não cacheia inativos — assim, se admin reativar, próxima request
        # já vê o novo estado em até 5 min (sem precisar invalidar manual).
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sua conta foi desativada. Procure o administrador.",
        )
    _cache_set(user_id, profile)
    return profile


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
