"""Trava o contrato HTTP do save de chamada (PUT .../attendance/{date}).

Escritos ANTES da migração do save para RPC transacional (M4): os asserts
cobrem o contrato observável (status, response, rejeição de matrícula de
outro módulo), não o mecanismo interno de escrita.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.routers.attendance as attendance_router
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
        "id": "m1", "professor_id": "prof-1", "academic_period_id": "p1",
        # embed usado por assert_module_period_active
        "academic_period": {"is_active": True},
    }


def _record_row() -> dict:
    return {
        "id": "rec-1", "module_id": "m1", "attendance_date": "2025-03-10",
        "notes": "aula 1", "created_by": "prof-1",
        "created_at": "2025-03-10T00:00:00+00:00",
        "updated_at": "2025-03-10T00:00:00+00:00",
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

    def in_(self, *a, **k):
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
    def __init__(self, responses, rpc_resp=None):
        self._responses = responses
        self._rpc_resp = rpc_resp or _Resp(None)
        self.recorder = []

    def table(self, name):
        return _Query(name, self._responses.get(name, _Resp(data=[])), self.recorder)

    def rpc(self, name, params):
        self.recorder.append(("rpc", name, params))
        return _Query(f"rpc:{name}", self._rpc_resp, self.recorder)


@pytest.fixture
def as_user():
    def _set(profile):
        app.dependency_overrides[get_current_user] = lambda: profile
    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def _use_db(monkeypatch, db):
    monkeypatch.setattr(attendance_router, "get_admin_db", lambda: db)
    # assert_module_period_active também consulta via o mesmo db (passado por arg)


def test_professor_salva_chamada_200(as_user, monkeypatch):
    as_user(_profile("professor", "prof-1"))
    db = _FakeDb(
        {
            "modules": _Resp(_module_row()),
            "attendance_records": _Resp(_record_row()),
            "enrollments": _Resp([{"id": "e1"}]),
        },
        rpc_resp=_Resp("rec-1"),
    )
    _use_db(monkeypatch, db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"notes": "aula 1", "entries": [{"enrollment_id": "e1", "status": "absent"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "rec-1"
    assert body["module_id"] == "m1"


def test_matricula_de_outro_modulo_400_sem_gravar_entries(as_user, monkeypatch):
    as_user(_profile("professor", "prof-1"))
    db = _FakeDb({
        "modules": _Resp(_module_row()),
        "attendance_records": _Resp(_record_row()),
        "enrollments": _Resp([]),  # nenhuma matrícula válida no módulo
    })
    _use_db(monkeypatch, db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"entries": [{"enrollment_id": "intrusa", "status": "absent"}]},
    )
    assert resp.status_code == 400
    # Nada pode ter sido escrito nas entries.
    writes = [r for r in db.recorder if r[0] == "attendance_entries"]
    assert not writes


def test_professor_de_outro_modulo_403(as_user, monkeypatch):
    as_user(_profile("professor", "prof-INTRUSO"))
    db = _FakeDb({"modules": _Resp(_module_row())})
    _use_db(monkeypatch, db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"entries": []},
    )
    assert resp.status_code == 403
    assert not [r for r in db.recorder if r[1] in ("update", "insert", "delete")]


def test_coordenador_de_outro_periodo_403(as_user, monkeypatch):
    # Trava a checagem de coordenador↔período ANTES de migrá-la ao helper canônico.
    as_user(_profile("coordinator", "coord-INTRUSO"))
    db = _FakeDb({
        "modules": _Resp(_module_row()),
        "academic_periods": _Resp([]),  # coordenador não é dono do período
    })
    _use_db(monkeypatch, db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"entries": []},
    )
    assert resp.status_code == 403
    assert not [r for r in db.recorder if r[1] in ("update", "insert", "delete")]
