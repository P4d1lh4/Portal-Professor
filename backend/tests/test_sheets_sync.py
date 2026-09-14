"""B-02: sync de planilha respeita período encerrado (mesma trava do PUT /grades)."""
import pytest
from fastapi.testclient import TestClient

import app.routers.sheets as sheets_router
from app.deps import get_current_user
from app.main import app
from tests.fakes import FakeDb, Resp, profile

client = TestClient(app)

SHEET_URL = "https://docs.google.com/spreadsheets/d/abc/export?format=csv"


def _db(is_active: bool) -> FakeDb:
    return FakeDb({
        "academic_periods": Resp({
            "id": "p1", "coordinator_id": "coord-1",
            "csv_sync_url": SHEET_URL, "is_active": is_active,
        }),
    })


@pytest.fixture
def as_user():
    def _set(role: str, uid: str):
        app.dependency_overrides[get_current_user] = lambda: profile(role, uid)
    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def test_coordenador_periodo_encerrado_409_sem_baixar_nem_gravar(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _db(is_active=False)
    monkeypatch.setattr(sheets_router, "get_admin_db", lambda: db)

    async def _nao_baixa(_url):
        raise AssertionError("não deveria baixar a planilha")

    monkeypatch.setattr(sheets_router, "_fetch_csv", _nao_baixa)

    resp = client.post("/api/periods/p1/sync-sheets")
    assert resp.status_code == 409
    assert not db.writes


def test_admin_sincroniza_periodo_encerrado(as_user, monkeypatch):
    as_user("admin", "admin-1")
    db = _db(is_active=False)
    monkeypatch.setattr(sheets_router, "get_admin_db", lambda: db)

    async def _csv(_url):
        return b"student_number,regular_exam_grade\n123,8\n456,7\n"

    monkeypatch.setattr(sheets_router, "_fetch_csv", _csv)

    resp = client.post("/api/periods/p1/sync-sheets")
    assert resp.status_code == 200
    assert resp.json()["not_found"] == ["123", "456"]
