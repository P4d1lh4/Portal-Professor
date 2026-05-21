"""Testes da validação de JWT (migração python-jose → PyJWT)."""
import time

import jwt
import pytest
from fastapi import HTTPException

from app.auth import decode_supabase_jwt
from app.config import settings


def _hs256(payload: dict) -> str:
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")


def test_decode_hs256_valido():
    token = _hs256({"sub": "user-1", "role": "professor"})
    decoded = decode_supabase_jwt(token)
    assert decoded["sub"] == "user-1"


def test_token_malformado_levanta_401():
    with pytest.raises(HTTPException) as exc:
        decode_supabase_jwt("isto-nao-e-um-jwt")
    assert exc.value.status_code == 401


def test_token_expirado_levanta_401():
    token = _hs256({"sub": "user-1", "exp": int(time.time()) - 10})
    with pytest.raises(HTTPException) as exc:
        decode_supabase_jwt(token)
    assert exc.value.status_code == 401


def test_assinatura_invalida_levanta_401():
    token = jwt.encode({"sub": "user-1"}, "segredo-errado", algorithm="HS256")
    with pytest.raises(HTTPException) as exc:
        decode_supabase_jwt(token)
    assert exc.value.status_code == 401
