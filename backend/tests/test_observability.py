"""Request-id, readyz profundo e filtro de log."""
import logging

from fastapi.testclient import TestClient

import app.db as db_module
from app.main import app
from app.observability import RequestIdFilter, set_request_id

client = TestClient(app)


def test_healthz_gera_request_id():
    resp = client.get("/api/healthz")
    assert resp.status_code == 200
    rid = resp.headers.get("X-Request-ID")
    assert rid and rid != "-"


def test_request_id_do_cliente_e_ecoado():
    resp = client.get("/api/healthz", headers={"X-Request-ID": "abc-123"})
    assert resp.headers.get("X-Request-ID") == "abc-123"


class _OkChain:
    def select(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def execute(self):
        return type("R", (), {"data": [{"id": "1"}]})()


class _OkDb:
    def table(self, _n):
        return _OkChain()


def test_readyz_ok_quando_supabase_responde(monkeypatch):
    monkeypatch.setattr(db_module, "get_admin_db", lambda: _OkDb())
    resp = client.get("/api/readyz")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ready"


def test_readyz_503_quando_supabase_falha(monkeypatch):
    def _boom():
        raise RuntimeError("sem conexão")

    monkeypatch.setattr(db_module, "get_admin_db", _boom)
    resp = client.get("/api/readyz")
    assert resp.status_code == 503
    assert resp.json()["status"] == "unavailable"


def test_filtro_injeta_request_id_no_log():
    set_request_id("rid-xyz")
    record = logging.LogRecord("x", logging.INFO, __file__, 1, "msg", None, None)
    assert RequestIdFilter().filter(record) is True
    assert record.request_id == "rid-xyz"
