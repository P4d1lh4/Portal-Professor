"""Clonar período: período novo com cópia dos módulos ativos, sem alunos (P-Q5)."""
import pytest
from fastapi.testclient import TestClient

import app.routers.periods as periods_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

TS = "2026-01-01T00:00:00+00:00"
SOURCE = {"id": "p1", "name": "2026.1"}
NEW = {
    "id": "p2", "name": "2026.2", "coordinator_id": "coord-1", "start_date": None,
    "end_date": None, "is_active": True, "csv_sync_url": None, "csv_last_sync": None,
    "created_at": TS,
}
MODULES = [
    {"name": "Anatomia", "code": "ANA1", "professor_id": "prof-1", "credits": 4, "max_absences": 10},
    {"name": "Fisiologia", "code": "FIS1", "professor_id": "prof-2", "credits": 2, "max_absences": 5},
]
BODY = {"name": "2026.2", "coordinator_id": "coord-1"}


def _setup(monkeypatch, *, source=SOURCE, duplicate=False, modules=MODULES, modules_insert=None):
    def periods(q):
        if q.op == "insert":
            return Resp([{"id": "p2"}])
        if q.op == "delete":
            return Resp([])
        if ("eq", ("name", "2026.2")) in q.calls:
            return Resp({"id": "outro"} if duplicate else None)
        if ("eq", ("id", "p2")) in q.calls:
            return Resp(NEW)
        return Resp(source)

    responses = {"academic_periods": periods, "modules": Resp(modules)}
    if modules_insert:
        responses["modules.insert"] = modules_insert
    db = FakeDb(responses)
    monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)
    return db


def _writes(db, table, op):
    return [w[2] for w in db.writes if w[0] == table and w[1] == op]


def test_admin_clona_copiando_so_os_modulos_ativos(as_user, monkeypatch):
    as_user("admin", "admin-1")
    db = _setup(monkeypatch)

    resp = client.post("/api/periods/p1/clone", json=BODY)

    assert resp.status_code == 201
    assert resp.json()["id"] == "p2"
    assert _writes(db, "academic_periods", "insert") == [
        {"name": "2026.2", "coordinator_id": "coord-1", "is_active": True}
    ]
    assert ("eq", ("is_active", True)) in db.calls("modules")
    [copies] = _writes(db, "modules", "insert")
    assert copies == [
        {**m, "academic_period_id": "p2", "is_active": True} for m in MODULES
    ]
    [audit] = _writes(db, "audit_log", "insert")
    assert audit["after_data"]["cloned_from"] == "p1"
    assert audit["after_data"]["modules"] == 2
    assert "a partir de 2026.1" in audit["summary"]


def test_periodo_de_origem_inexistente_404(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch, source=None)

    assert client.post("/api/periods/p1/clone", json=BODY).status_code == 404
    assert not db.writes


def test_nome_repetido_409_sem_criar(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch, duplicate=True)

    assert client.post("/api/periods/p1/clone", json=BODY).status_code == 409
    assert not db.writes


@pytest.mark.parametrize("role", ["coordinator", "professor"])
def test_so_admin_clona(as_user, monkeypatch, role):
    as_user(role)
    db = _setup(monkeypatch)

    assert client.post("/api/periods/p1/clone", json=BODY).status_code == 403
    assert not db.writes


def test_origem_sem_modulos_cria_so_o_periodo(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch, modules=[])

    assert client.post("/api/periods/p1/clone", json=BODY).status_code == 201
    assert not _writes(db, "modules", "insert")


def test_falha_na_copia_desfaz_o_periodo(as_user, monkeypatch):
    as_user("admin")

    def boom(_query):
        raise RuntimeError("modules fora do ar")

    db = _setup(monkeypatch, modules_insert=boom)

    with pytest.raises(RuntimeError):
        client.post("/api/periods/p1/clone", json=BODY)
    assert ("academic_periods", "delete", None) in db.writes
    assert ("eq", ("id", "p2")) in db.calls("academic_periods")
    assert not _writes(db, "audit_log", "insert")
