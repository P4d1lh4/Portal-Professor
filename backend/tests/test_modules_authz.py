"""Testes de integração da autorização de coordenador em /modules.

Travam o comportamento atual (403 + mensagem específica) ANTES da
consolidação da checagem no helper canônico de services/permissions.py,
para que a migração não altere o contrato observável.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.routers.modules as modules_router
from app.deps import get_current_user
from app.main import app
from app.schemas.users import Profile

client = TestClient(app)


def _profile(role: str, uid: str) -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        id=uid, username=role, full_name=role, email=f"{role}@x.com",
        role=role, is_active=True, created_at=now, updated_at=now,
    )


def _module_row() -> dict:
    return {
        "id": "m1", "name": "Anatomia", "code": "ANA-01",
        "professor_id": "prof-1", "academic_period_id": "p1",
        "credits": 4, "max_absences": 10, "is_active": True,
        "created_at": "2025-01-01T00:00:00+00:00",
    }


class _Resp:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, table, resp, recorder):
        self._table = table
        self._resp = resp
        self._recorder = recorder

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def single(self):
        return self

    def update(self, payload):
        self._recorder.append((self._table, "update", payload))
        return self

    def insert(self, payload):
        self._recorder.append((self._table, "insert", payload))
        return self

    def delete(self):
        self._recorder.append((self._table, "delete", None))
        return self

    def execute(self):
        return self._resp


class _FakeDb:
    def __init__(self, responses):
        self._responses = responses
        self.recorder = []

    def table(self, name):
        return _Query(name, self._responses.get(name, _Resp(data=[])), self.recorder)


@pytest.fixture
def as_user():
    def _set(profile):
        app.dependency_overrides[get_current_user] = lambda: profile
    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def _use_db(monkeypatch, db):
    monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)


class TestCoordenadorNaoDono403:
    """Coordenador que NÃO coordena o período do módulo: sempre 403."""

    def test_put_modules_403(self, as_user, monkeypatch):
        as_user(_profile("coordinator", "coord-2"))
        db = _FakeDb({
            "modules": _Resp(_module_row()),
            "academic_periods": _Resp(None),  # não é dono
        })
        _use_db(monkeypatch, db)

        resp = client.put("/api/modules/m1", json={"name": "Novo"})
        assert resp.status_code == 403
        assert "módulos neste período" in resp.json()["detail"]
        assert not [r for r in db.recorder if r[1] == "update"]

    def test_delete_modules_403(self, as_user, monkeypatch):
        as_user(_profile("coordinator", "coord-2"))
        db = _FakeDb({
            "modules": _Resp(_module_row()),
            "academic_periods": _Resp(None),
        })
        _use_db(monkeypatch, db)

        resp = client.delete("/api/modules/m1")
        assert resp.status_code == 403
        assert not [r for r in db.recorder if r[1] == "delete"]

    def test_post_modules_403(self, as_user, monkeypatch):
        as_user(_profile("coordinator", "coord-2"))
        db = _FakeDb({"academic_periods": _Resp(None)})
        _use_db(monkeypatch, db)

        resp = client.post("/api/modules", json={
            "name": "Novo", "code": "N-01",
            "professor_id": "prof-1", "academic_period_id": "p1",
        })
        assert resp.status_code == 403
        assert not [r for r in db.recorder if r[1] == "insert"]


def test_put_coordenador_dono_200(as_user, monkeypatch):
    """Controle positivo: dono do período consegue editar o módulo."""
    as_user(_profile("coordinator", "coord-1"))
    db = _FakeDb({
        "modules": _Resp(_module_row()),
        "academic_periods": _Resp({"id": "p1"}),  # é dono
    })
    _use_db(monkeypatch, db)

    resp = client.put("/api/modules/m1", json={"name": "Anatomia II"})
    assert resp.status_code == 200
    updates = [r for r in db.recorder if r[0] == "modules" and r[1] == "update"]
    assert len(updates) == 1
    assert updates[0][2] == {"name": "Anatomia II"}
