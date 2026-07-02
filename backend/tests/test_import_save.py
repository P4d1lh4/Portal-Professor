"""Persist do import CSV via RPC transacional por aluno (M4).

Cobre o caminho de persistência (antes sem teste): cada linha válida chama a
RPC create_student_with_enrollments; falha numa linha vira errors_on_save sem
derrubar as demais.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.routers.import_csv as import_router
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


class _Resp:
    def __init__(self, data=None):
        self.data = data


class _Query:
    def __init__(self, resp):
        self._resp = resp

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return self._resp


class _RpcOk:
    def execute(self):
        return _Resp("new-student-id")


class _RpcFail:
    def execute(self):
        raise RuntimeError("unique_violation simulada")


class _ImpDb:
    def __init__(self, responses, fail_numbers=()):
        self._responses = responses
        self._fail = set(fail_numbers)
        self.rpc_calls: list = []

    def table(self, name):
        return _Query(self._responses.get(name, _Resp(data=[])))

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        num = params["p_student"]["student_number"]
        return _RpcFail() if num in self._fail else _RpcOk()


@pytest.fixture
def as_coord():
    app.dependency_overrides[get_current_user] = lambda: _profile("coordinator", "coord-1")
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _db(fail_numbers=()):
    return _ImpDb(
        {
            "academic_periods": _Resp({"id": "p1", "coordinator_id": "coord-1"}),
            "students": _Resp([]),          # nenhum aluno pré-existente
            "modules": _Resp([{"id": "m1"}, {"id": "m2"}]),
        },
        fail_numbers=fail_numbers,
    )


_CSV = b"student_number,full_name,enrollment_date\n2024001,Ana,2024-02-01\n2024002,Bruno,2024-02-01\n"


def test_importa_todos_via_rpc(as_coord, monkeypatch):
    db = _db()
    monkeypatch.setattr(import_router, "get_admin_db", lambda: db)

    resp = client.post(
        "/api/periods/p1/students/import?dry_run=false",
        files={"file": ("alunos.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 2
    assert body["errors_on_save"] == []
    # Duas chamadas à RPC transacional (uma por aluno), com os módulos do período.
    assert len(db.rpc_calls) == 2
    assert db.rpc_calls[0][0] == "create_student_with_enrollments"
    assert db.rpc_calls[0][1]["p_module_ids"] == ["m1", "m2"]


def test_falha_numa_linha_nao_derruba_as_outras(as_coord, monkeypatch):
    db = _db(fail_numbers={"2024002"})
    monkeypatch.setattr(import_router, "get_admin_db", lambda: db)

    resp = client.post(
        "/api/periods/p1/students/import?dry_run=false",
        files={"file": ("alunos.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1
    assert len(body["errors_on_save"]) == 1
    assert "2024002" in body["errors_on_save"][0]
