"""B-13: /api/audit-log — admin vê tudo; os demais, só as próprias ações.

O escopo é um filtro na query (não há checagem separada), então os testes
afirmam sobre os filtros registrados pelo FakeDb.
"""
import pytest
from fastapi.testclient import TestClient

import app.routers.audit as audit_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb({"audit_log": Resp([], count=0)})
    monkeypatch.setattr(audit_router, "get_admin_db", lambda: fake)
    return fake


@pytest.mark.parametrize("role", ["coordinator", "professor"])
def test_nao_admin_so_ve_as_proprias_acoes(as_user, db, role):
    as_user(role, f"{role}-1")
    # Pedir o log de outro usuário não adianta: o filtro é forçado.
    resp = client.get("/api/audit-log?actor_id=outro-usuario")
    assert resp.status_code == 200
    filtros = db.calls("audit_log")
    assert ("eq", ("actor_id", f"{role}-1")) in filtros
    assert ("eq", ("actor_id", "outro-usuario")) not in filtros


def test_admin_filtra_pelo_autor_e_entidade_pedidos(as_user, db):
    as_user("admin")
    resp = client.get("/api/audit-log?actor_id=u9&entity=grades")
    assert resp.status_code == 200
    filtros = db.calls("audit_log")
    assert ("eq", ("actor_id", "u9")) in filtros
    assert ("eq", ("entity", "grades")) in filtros


def test_admin_sem_filtro_ve_tudo(as_user, db):
    as_user("admin")
    assert client.get("/api/audit-log").status_code == 200
    assert not [c for c in db.calls("audit_log") if c[0] == "eq"]
