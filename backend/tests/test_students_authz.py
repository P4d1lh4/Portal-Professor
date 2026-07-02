"""Isolamento por período nas rotas item-level de /professor/students/{id}.

Trava o fix do IDOR: um coordenador só pode acessar/editar/desativar alunos
de períodos que ele coordena (a API usa service role, então o escopo é
garantido na camada de app).
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.routers.students as students_router
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
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Q:
    def __init__(self, table, resp, rec):
        self._t = table
        self._r = resp
        self._rec = rec

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def single(self):
        return self

    def update(self, payload):
        self._rec.append((self._t, "update", payload))
        return self

    def execute(self):
        return self._r


class _FakeDb:
    def __init__(self, responses):
        self._responses = responses
        self.recorder: list = []

    def table(self, name):
        return _Q(name, self._responses.get(name, _Resp(data=[])), self.recorder)


@pytest.fixture
def as_coord_outro():
    """Coordenador que NÃO coordena o período do aluno."""
    app.dependency_overrides[get_current_user] = lambda: _profile("coordinator", "coord-OUTRO")
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _db_aluno_de_outro_periodo():
    # students devolve o período do aluno; academic_periods não encontra
    # (coord-OUTRO não é dono) -> assert_coordinator_owns_period levanta 403.
    return _FakeDb({
        "students": _Resp({"academic_period_id": "p1"}),
        "academic_periods": _Resp(None),
    })


def test_coordenador_nao_dono_get_403(as_coord_outro, monkeypatch):
    db = _db_aluno_de_outro_periodo()
    monkeypatch.setattr(students_router, "get_admin_db", lambda: db)
    resp = client.get("/api/professor/students/s1")
    assert resp.status_code == 403


def test_coordenador_nao_dono_put_403_sem_escrita(as_coord_outro, monkeypatch):
    db = _db_aluno_de_outro_periodo()
    monkeypatch.setattr(students_router, "get_admin_db", lambda: db)
    resp = client.put("/api/professor/students/s1", json={"full_name": "Hack"})
    assert resp.status_code == 403
    assert not [r for r in db.recorder if r[1] == "update"]


def test_coordenador_nao_dono_delete_403_sem_escrita(as_coord_outro, monkeypatch):
    db = _db_aluno_de_outro_periodo()
    monkeypatch.setattr(students_router, "get_admin_db", lambda: db)
    resp = client.delete("/api/professor/students/s1")
    assert resp.status_code == 403
    assert not [r for r in db.recorder if r[1] == "update"]


def test_coordenador_nao_dono_absences_put_403_sem_escrita(as_coord_outro, monkeypatch):
    db = _db_aluno_de_outro_periodo()
    monkeypatch.setattr(students_router, "get_admin_db", lambda: db)
    resp = client.put("/api/professor/students/s1/absences", json={"medical_certificates": 5})
    assert resp.status_code == 403
    assert not [r for r in db.recorder if r[1] == "update"]
