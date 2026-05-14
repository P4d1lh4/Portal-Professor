"""Testes do health check e estrutura base da API."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthz():
    resp = client.get("/api/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_me_sem_token_retorna_401():
    resp = client.get("/api/me")
    assert resp.status_code == 403  # HTTPBearer retorna 403 quando sem token


def test_me_com_token_invalido_retorna_401():
    resp = client.get("/api/me", headers={"Authorization": "Bearer token_invalido"})
    assert resp.status_code == 401
