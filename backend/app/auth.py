import json
from functools import lru_cache

import httpx
import jwt
from fastapi import HTTPException, status
from fastapi.security import HTTPBearer
from jwt.algorithms import ECAlgorithm, RSAAlgorithm

from .config import settings

bearer_scheme = HTTPBearer(auto_error=True)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Token inválido ou expirado.",
    headers={"WWW-Authenticate": "Bearer"},
)


@lru_cache(maxsize=1)
def _get_jwks() -> dict:
    """Busca o JWKS do Supabase Auth (chaves assimétricas)."""
    url = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10.0)
    resp.raise_for_status()
    return resp.json()


def _find_jwk(kid: str | None) -> dict | None:
    if not kid:
        return None
    for key in _get_jwks().get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


def _key_from_jwk(jwk: dict, alg: str):
    """Constrói a chave pública a partir do JWK (PyJWT exige objeto, não dict)."""
    jwk_json = json.dumps(jwk)
    if alg == "ES256":
        return ECAlgorithm.from_jwk(jwk_json)
    return RSAAlgorithm.from_jwk(jwk_json)


def decode_supabase_jwt(token: str) -> dict:
    """Valida um JWT emitido pelo Supabase Auth.

    Suporta ES256/RS256 (assimétrico, padrão atual via JWKS) e HS256
    (simétrico, projetos legacy que ainda usam o segredo compartilhado).
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "HS256":
            key: object = settings.supabase_jwt_secret
        elif alg in ("ES256", "RS256"):
            kid = header.get("kid")
            jwk = _find_jwk(kid)
            if jwk is None:
                _get_jwks.cache_clear()
                jwk = _find_jwk(kid)
            if jwk is None:
                raise _CREDENTIALS_EXCEPTION
            key = _key_from_jwk(jwk, alg)
        else:
            raise _CREDENTIALS_EXCEPTION

        return jwt.decode(
            token,
            key,
            algorithms=[alg],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Faça login novamente.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise _CREDENTIALS_EXCEPTION
    except HTTPException:
        raise
    except Exception:
        raise _CREDENTIALS_EXCEPTION
