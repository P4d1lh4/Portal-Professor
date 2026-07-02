"""Política de senha na criação de usuário + security headers."""
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.schemas.users import UserCreate

client = TestClient(app)


def test_user_create_rejeita_senha_curta():
    with pytest.raises(ValidationError):
        UserCreate(
            email="a@b.com", password="curta", username="u",
            full_name="Fulano", role="professor",
        )


def test_user_create_aceita_senha_forte():
    u = UserCreate(
        email="a@b.com", password="senha-forte-123", username="u",
        full_name="Fulano", role="professor",
    )
    assert u.password == "senha-forte-123"


def test_security_headers_presentes():
    resp = client.get("/api/healthz")
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert resp.headers["Referrer-Policy"] == "no-referrer"
    assert "Strict-Transport-Security" in resp.headers
