"""Teste de regressão do PUT /api/grades/{enrollment_id}.

Cobre o bug em que o endpoint encadeava .update(...).eq(...).select() — método
inexistente no builder do supabase-py — causando 500 ao salvar uma nota.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.routers.grades as grades_router
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


class _Q:
    """Builder fake ciente da operação (select vs update/insert)."""

    def __init__(self, table, select_data, update_data, recorder):
        self._table = table
        self._select_data = select_data
        self._update_data = update_data
        self._recorder = recorder
        self._op = "select"

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def single(self):
        return self

    def update(self, payload):
        self._op = "write"
        self._recorder.append((self._table, "update", payload))
        return self

    def insert(self, payload):
        self._op = "write"
        self._recorder.append((self._table, "insert", payload))
        return self

    def execute(self):
        return _Resp(self._update_data if self._op == "write" else self._select_data)


class _FakeDb:
    def __init__(self, config):
        self._config = config
        self.recorder = []

    def table(self, name):
        sel, upd = self._config.get(name, ([], []))
        return _Q(name, sel, upd, self.recorder)


@pytest.fixture
def as_user():
    def _set(profile):
        app.dependency_overrides[get_current_user] = lambda: profile
    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def test_professor_salva_nota_recalcula_e_retorna_200(as_user, monkeypatch):
    as_user(_profile("professor", "prof-1"))

    grade_select = {
        "id": "g1",
        "enrollment_id": "e1",
        "tutor_grade": 0.0,
        "regular_exam_grade": 5.0,
        "makeup_exam_grade": 0.0,
        "final_grade": 5.0,
        "absences": 0,
        "last_updated": "2025-01-01T00:00:00+00:00",
        "enrollment": {"module_id": "m1", "student_id": "s1"},
    }
    # Linha retornada pelo update (sem a chave de join "enrollment").
    updated_row = {
        "id": "g1",
        "enrollment_id": "e1",
        "tutor_grade": 0.0,
        "regular_exam_grade": 8.0,
        "makeup_exam_grade": 0.0,
        "final_grade": 8.0,
        "absences": 0,
        "last_updated": "2025-01-02T00:00:00+00:00",
    }
    modules = {
        "id": "m1",
        "professor_id": "prof-1",
        "academic_period": {"is_active": True},
    }

    db = _FakeDb({
        "grades": (grade_select, [updated_row]),
        "modules": (modules, None),
        "audit_log": ([], []),
    })
    monkeypatch.setattr(grades_router, "get_admin_db", lambda: db)

    resp = client.put("/api/grades/e1", json={"regular_exam_grade": 8})
    assert resp.status_code == 200
    body = resp.json()
    assert body["regular_exam_grade"] == 8.0
    assert body["final_grade"] == 8.0

    # O update foi registrado e calculou a nota final.
    updates = [r for r in db.recorder if r[0] == "grades" and r[1] == "update"]
    assert len(updates) == 1
    assert updates[0][2]["final_grade"] == 8.0


def _grade_select(module_id="m1"):
    return {
        "id": "g1", "enrollment_id": "e1",
        "tutor_grade": 0.0, "regular_exam_grade": 5.0, "makeup_exam_grade": 0.0,
        "final_grade": 5.0, "absences": 0,
        "last_updated": "2025-01-01T00:00:00+00:00",
        "enrollment": {"module_id": module_id, "student_id": "s1"},
    }


def test_coordenador_do_periodo_salva_nota_200(as_user, monkeypatch):
    as_user(_profile("coordinator", "coord-1"))
    updated_row = {**_grade_select(), "regular_exam_grade": 7.0, "final_grade": 7.0}
    del updated_row["enrollment"]
    modules = {
        "id": "m1", "professor_id": "prof-9",
        "academic_period": {"coordinator_id": "coord-1", "is_active": True},
    }
    db = _FakeDb({
        "grades": (_grade_select(), [updated_row]),
        "modules": (modules, None),
        "audit_log": ([], []),
    })
    monkeypatch.setattr(grades_router, "get_admin_db", lambda: db)

    resp = client.put("/api/grades/e1", json={"regular_exam_grade": 7})
    assert resp.status_code == 200
    assert resp.json()["final_grade"] == 7.0


def test_coordenador_de_outro_periodo_nao_edita_nota_403(as_user, monkeypatch):
    as_user(_profile("coordinator", "coord-2"))  # coordena outro período
    modules = {
        "id": "m1", "professor_id": "prof-9",
        "academic_period": {"coordinator_id": "coord-1", "is_active": True},
    }
    db = _FakeDb({
        "grades": (_grade_select(), [[]]),
        "modules": (modules, None),
        "audit_log": ([], []),
    })
    monkeypatch.setattr(grades_router, "get_admin_db", lambda: db)

    resp = client.put("/api/grades/e1", json={"regular_exam_grade": 7})
    assert resp.status_code == 403
    # Nenhuma nota pode ter sido gravada.
    assert not [r for r in db.recorder if r[1] == "update"]
