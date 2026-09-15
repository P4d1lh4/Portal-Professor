"""B-13: /api/users e afins — só admin gerencia usuários."""
from types import SimpleNamespace

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
    ("post", "/api/users/u2/reset-password", {"new_password": "senha-nova-123"}),
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
    # A entrada do audit_log é coberta em test_audit_coverage.py.
    assert [w for w in db.writes if w[0] == "profiles"] == [
        ("profiles", "update", {"role": "coordinator"})
    ]


def test_admin_desativa_outro_usuario(as_user, db):
    as_user("admin", "admin-1")
    resp = client.delete("/api/users/u2")
    assert resp.status_code == 204
    assert [w for w in db.writes if w[0] == "profiles"] == [
        ("profiles", "update", {"is_active": False})
    ]
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


# ─── B-S5: admin redefine a senha ────────────────────────────────────────────


def _auth(monkeypatch, update_user_by_id):
    auth = SimpleNamespace(admin=SimpleNamespace(update_user_by_id=update_user_by_id))
    monkeypatch.setattr(users_router, "create_client", lambda *a, **k: SimpleNamespace(auth=auth))


def test_admin_redefine_a_senha_de_outro_usuario(as_user, db, monkeypatch):
    as_user("admin", "admin-1")
    chamadas = []
    _auth(monkeypatch, lambda uid, attrs: chamadas.append((uid, attrs)))

    resp = client.post("/api/users/u2/reset-password", json={"new_password": "senha-nova-123"})

    assert resp.status_code == 204
    assert chamadas == [("u2", {"password": "senha-nova-123"})]


def test_admin_nao_redefine_a_propria_senha_por_aqui(as_user, db):
    # A própria senha passa por /me/change-password, que confere a atual.
    as_user("admin", "admin-1")
    resp = client.post("/api/users/admin-1/reset-password", json={"new_password": "senha-nova-123"})
    assert resp.status_code == 400
    assert not db.writes


def test_redefinir_senha_de_usuario_inexistente_404(as_user, db):
    as_user("admin", "admin-1")
    db.responses["profiles"] = Resp(None)
    resp = client.post("/api/users/u2/reset-password", json={"new_password": "senha-nova-123"})
    assert resp.status_code == 404


@pytest.mark.parametrize("senha", ["curta12", "x" * 73])
def test_senha_fora_do_tamanho_422(as_user, db, senha):
    as_user("admin", "admin-1")
    resp = client.post("/api/users/u2/reset-password", json={"new_password": senha})
    assert resp.status_code == 422


def test_falha_no_auth_nao_vaza_detalhe_nem_audita(as_user, db, monkeypatch):
    as_user("admin", "admin-1")

    def falha(*_a):
        raise RuntimeError("db.interno.supabase.co recusou")

    _auth(monkeypatch, falha)
    resp = client.post("/api/users/u2/reset-password", json={"new_password": "senha-nova-123"})

    assert resp.status_code == 400
    assert "interno" not in resp.text
    assert not db.writes
