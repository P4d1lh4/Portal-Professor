"""B-13: /api/users e afins — só admin gerencia usuários."""
import pytest
from fastapi.testclient import TestClient

import app.routers.users as users_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


def _profile_row(uid: str, **kw) -> dict:
    return {
        "id": uid, "username": "u", "full_name": "U", "email": "u@x.com",
        "role": "professor", "is_active": True,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00", **kw,
    }


ADMIN_ONLY = [
    ("get", "/api/users", None),
    ("post", "/api/users", {
        "email": "n@x.com", "password": "senha-forte-123",
        "username": "n", "full_name": "N", "role": "professor",
    }),
    ("put", "/api/users/u2", {"role": "admin"}),
    ("delete", "/api/users/u2", None),
    ("post", "/api/users/u2/reactivate", None),
]


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb({"profiles": Resp(_profile_row("u2"))})
    monkeypatch.setattr(users_router, "get_admin_db", lambda: fake)
    monkeypatch.setattr(
        users_router, "create_client",
        lambda *a, **k: pytest.fail("não deveria chegar ao Supabase Auth"),
    )
    return fake


@pytest.mark.parametrize("role", ["coordinator", "professor"])
@pytest.mark.parametrize("method,path,body", ADMIN_ONLY)
def test_nao_admin_403_sem_escrita(as_user, db, role, method, path, body):
    as_user(role)
    resp = client.request(method, path, json=body)
    assert resp.status_code == 403
    assert not db.writes


def test_me_devolve_o_usuario_logado(as_user, db):
    as_user("professor", "prof-1")
    resp = client.get("/api/me")
    assert resp.status_code == 200
    assert resp.json()["id"] == "prof-1"


@pytest.mark.parametrize("path,role", [("/api/professors", "professor"), ("/api/coordinators", "coordinator")])
def test_dropdowns_liberados_para_qualquer_papel(as_user, monkeypatch, path, role):
    as_user("professor")
    fake = FakeDb({"profiles": Resp([_profile_row("u2", role=role)])})
    monkeypatch.setattr(users_router, "get_admin_db", lambda: fake)

    resp = client.get(path)
    assert resp.status_code == 200
    assert ("eq", ("role", role)) in fake.calls("profiles")
    # ProfilePublic: sem e-mail na resposta
    assert "email" not in resp.json()[0]


def test_admin_muda_papel(as_user, db):
    as_user("admin")
    resp = client.put("/api/users/u2", json={"role": "coordinator"})
    assert resp.status_code == 200
    assert db.writes == [("profiles", "update", {"role": "coordinator"})]


def test_admin_desativa_outro_usuario(as_user, db):
    as_user("admin", "admin-1")
    resp = client.delete("/api/users/u2")
    assert resp.status_code == 204
    assert db.writes == [("profiles", "update", {"is_active": False})]
    assert ("eq", ("id", "u2")) in db.calls("profiles")


def test_admin_nao_desativa_a_si_mesmo(as_user, db):
    as_user("admin", "admin-1")
    resp = client.delete("/api/users/admin-1")
    assert resp.status_code == 400
    assert not db.writes


def test_admin_reativa(as_user, db):
    as_user("admin")
    resp = client.post("/api/users/u2/reactivate")
    assert resp.status_code == 200
    assert db.writes == [("profiles", "update", {"is_active": True})]
