"""B-06: criação de usuário checa o username antes do Auth e não vaza erro do SDK."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.routers.users as users_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

BODY = {
    "email": "novo@x.com", "password": "senha-forte-123",
    "username": "novo", "full_name": "Novo", "role": "professor",
}


@pytest.fixture(autouse=True)
def _admin(as_user):
    as_user("admin", "admin-1")


def test_username_duplicado_409_sem_criar_no_auth(monkeypatch):
    chamadas: list = []
    monkeypatch.setattr(
        users_router, "get_admin_db", lambda: FakeDb({"profiles": Resp({"id": "u1"})})
    )
    monkeypatch.setattr(users_router, "create_client", lambda *a, **k: chamadas.append(a))

    resp = client.post("/api/users", json=BODY)
    assert resp.status_code == 409
    assert not chamadas


def test_erro_do_auth_nao_vaza_detalhe_interno(monkeypatch):
    def _boom(_payload):
        raise RuntimeError("connection to db.interno:5432 refused")

    admin = SimpleNamespace(auth=SimpleNamespace(admin=SimpleNamespace(create_user=_boom)))
    monkeypatch.setattr(
        users_router, "get_admin_db", lambda: FakeDb({"profiles": Resp(None)})
    )
    monkeypatch.setattr(users_router, "create_client", lambda *a, **k: admin)

    resp = client.post("/api/users", json=BODY)
    assert resp.status_code == 400
    assert "interno" not in resp.text
