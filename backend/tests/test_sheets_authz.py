"""B-13: sync de planilha — coordenador dono do período ou admin."""
import pytest
from fastapi.testclient import TestClient

import app.routers.sheets as sheets_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

SHEET_URL = "https://docs.google.com/spreadsheets/d/abc/export?format=csv"
ROTAS = [
    ("put", "/api/periods/p1/sync-url", {"csv_sync_url": SHEET_URL}),
    ("post", "/api/periods/p1/sync-sheets", None),
]


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb({"academic_periods": Resp({
        "id": "p1", "coordinator_id": "coord-1",
        "csv_sync_url": SHEET_URL, "is_active": True,
    })})
    monkeypatch.setattr(sheets_router, "get_admin_db", lambda: fake)

    async def _nao_baixa(_url):
        raise AssertionError("não deveria baixar a planilha")

    monkeypatch.setattr(sheets_router, "_fetch_csv", _nao_baixa)
    return fake


@pytest.mark.parametrize("method,path,body", ROTAS)
def test_professor_403(as_user, db, method, path, body):
    as_user("professor")
    assert client.request(method, path, json=body).status_code == 403
    assert not db.writes


@pytest.mark.parametrize("method,path,body", ROTAS)
def test_coordenador_de_outro_periodo_403_sem_escrita(as_user, db, method, path, body):
    as_user("coordinator", "coord-2")
    assert client.request(method, path, json=body).status_code == 403
    assert not db.writes


def test_coordenador_dono_salva_a_url(as_user, db):
    as_user("coordinator", "coord-1")
    resp = client.put("/api/periods/p1/sync-url", json={"csv_sync_url": SHEET_URL})
    assert resp.status_code == 200
    assert db.writes == [("academic_periods", "update", {"csv_sync_url": SHEET_URL})]


def test_url_fora_do_google_422_sem_escrita(as_user, db):
    # SSRF: a URL gravada é baixada pelo servidor com o service role.
    as_user("coordinator", "coord-1")
    resp = client.put("/api/periods/p1/sync-url", json={"csv_sync_url": "https://169.254.169.254/x"})
    assert resp.status_code == 422
    assert not db.writes
