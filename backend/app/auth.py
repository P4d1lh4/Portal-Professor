from fastapi import HTTPException, status
from fastapi.security import HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt

from .config import settings

bearer_scheme = HTTPBearer(auto_error=True)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token inválido ou expirado.",
    headers={"WWW-Authenticate": "Bearer"},
)


def decode_supabase_jwt(token: str) -> dict:
    """Valida e decodifica um JWT emitido pelo Supabase Auth (HS256)."""
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Faça login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise _CREDENTIALS_EXCEPTION
