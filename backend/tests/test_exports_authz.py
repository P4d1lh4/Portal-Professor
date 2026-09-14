"""B-13: exports CSV — alunos do período e notas do módulo."""
import pytest
from fastapi.testclient import TestClient

import app.routers.exports as exports_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

MODULE = {
    "id": "m1", "name": "Módulo", "code": "MOD1", "professor_id": "prof-1",
    "max_absences": 10, "academic_period_id": "p1",
}


def _use(monkeypatch, responses) -> FakeDb:
    db = FakeDb(responses)
    monkeypatch.setattr(exports_router, "get_admin_db", lambda: db)
    return db


@pytest.mark.parametrize("role,uid,esperado", [
    ("coordinator", "coord-1", 200),
    ("coordinator", "coord-2", 403),
    ("professor", "prof-1", 403),  # rota só de coordenador/admin
])
def test_export_de_alunos_do_periodo(as_user, monkeypatch, role, uid, esperado):
    as_user(role, uid)
    _use(monkeypatch, {
        "academic_periods": Resp({"id": "p1", "name": "2026.1", "coordinator_id": "coord-1"}),
        "students": Resp([]),
    })
    assert client.get("/api/periods/p1/students/export.csv").status_code == esperado


@pytest.mark.parametrize("role,uid,periodo_do_coord,esperado", [
    ("professor", "prof-1", None, 200),
    ("professor", "prof-2", None, 403),
    ("coordinator", "coord-1", {"id": "p1"}, 200),
    ("coordinator", "coord-2", None, 403),
])
def test_export_de_notas_do_modulo(as_user, monkeypatch, role, uid, periodo_do_coord, esperado):
    as_user(role, uid)
    _use(monkeypatch, {
        "modules": Resp(MODULE),
        "academic_periods": Resp(periodo_do_coord),
        "enrollments": Resp([]),
    })
    assert client.get("/api/modules/m1/grades/export.csv").status_code == esperado
