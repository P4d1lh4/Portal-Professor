"""Testes de autorização por papel (isolamento de dados).

Como o backend usa o service role do Supabase (que faz bypass de RLS), a
autorização é garantida na camada de aplicação. Estes testes travam
regressões nesse isolamento para os endpoints mais sensíveis.

Estratégia: sobrescreve a dependency `get_current_user` (que também alimenta
`require_role`) para simular um usuário com um papel, e faz monkeypatch de
`get_admin_db` no módulo do router para injetar um banco falso configurável.
"""
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

import app.routers.periods as periods_router
import app.routers.students as students_router
from app.deps import get_current_user
from app.main import app
from app.schemas.users import Profile

client = TestClient(app)


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def _profile(role: str, uid: str | None = None) -> Profile:
    now = datetime.now(timezone.utc)
    uid = uid or f"user-{role}"
    return Profile(
        id=uid,
        username=role,
        full_name=f"Usuário {role}",
        email=f"{role}@x.com",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


def _period_row(pid: str, coordinator_id: str) -> dict:
    return {
        "id": pid,
        "name": "2025.1",
        "coordinator_id": coordinator_id,
        "coordinator": {"id": coordinator_id, "full_name": "Coord"},
        "is_active": True,
        "created_at": "2025-01-01T00:00:00+00:00",
    }


def _student_row(sid: str, *, full_name: str = "Maria", is_active: bool = True) -> dict:
    return {
        "id": sid,
        "student_number": "20240001",
        "full_name": full_name,
        "email": None,
        "academic_period_id": "p1",
        "enrollment_date": "2024-01-01",
        "medical_certificates": 0,
        "referral_info": None,
        "observations": None,
        "is_active": is_active,
        "created_at": "2024-01-01T00:00:00+00:00",
    }


class _Resp:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    """Encadeamento que ignora filtros e devolve a resposta pré-configurada.

    Operações de escrita (update/insert/delete) são registradas no `recorder`
    para permitir asserções sobre o payload efetivamente enviado.
    """

    def __init__(self, table: str, resp: _Resp, recorder: list):
        self._table = table
        self._resp = resp
        self._recorder = recorder

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def in_(self, *a, **k):
        return self

    def or_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def limit(self, *a, **k):
        return self

    def range(self, *a, **k):
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
    def __init__(self, responses: dict[str, _Resp]):
        self._responses = responses
        self.recorder: list = []

    def table(self, name: str):
        resp = self._responses.get(name, _Resp(data=[], count=0))
        return _Query(name, resp, self.recorder)


@pytest.fixture
def as_user():
    """Permite logar como um papel e limpa o override ao final."""

    def _set(profile: Profile):
        app.dependency_overrides[get_current_user] = lambda: profile

    yield _set
    app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------
# S1 — GET /periods/{id} isolado por papel
# ---------------------------------------------------------------

class TestGetPeriodAuthz:
    def test_admin_acessa_qualquer_periodo(self, as_user, monkeypatch):
        as_user(_profile("admin"))
        db = _FakeDb({"academic_periods": _Resp(_period_row("p1", "coord-x"))})
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "p1"

    def test_coordenador_acessa_proprio_periodo(self, as_user, monkeypatch):
        as_user(_profile("coordinator", uid="coord-1"))
        db = _FakeDb({"academic_periods": _Resp(_period_row("p1", "coord-1"))})
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 200

    def test_coordenador_nao_acessa_periodo_de_outro(self, as_user, monkeypatch):
        as_user(_profile("coordinator", uid="coord-1"))
        db = _FakeDb({"academic_periods": _Resp(_period_row("p1", "coord-OUTRO"))})
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 404

    def test_professor_acessa_periodo_com_seu_modulo(self, as_user, monkeypatch):
        as_user(_profile("professor", uid="prof-1"))
        db = _FakeDb({
            "academic_periods": _Resp(_period_row("p1", "coord-x")),
            "modules": _Resp([{"id": "m1"}]),
        })
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 200

    def test_professor_sem_modulo_nao_acessa(self, as_user, monkeypatch):
        as_user(_profile("professor", uid="prof-1"))
        db = _FakeDb({
            "academic_periods": _Resp(_period_row("p1", "coord-x")),
            "modules": _Resp([]),
        })
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 404


# ---------------------------------------------------------------
# S3 — PUT /professor/students/{id}: whitelist de campos do professor
# ---------------------------------------------------------------

class TestUpdateProfessorStudentWhitelist:
    def test_professor_nao_altera_is_active(self, as_user, monkeypatch):
        as_user(_profile("professor", uid="prof-1"))
        db = _FakeDb({
            "modules": _Resp([{"id": "m1"}]),       # _assert_prof_has_student
            "enrollments": _Resp([], count=1),       # aluno matriculado
            "students": _Resp(_student_row("s1", full_name="Novo Nome")),
        })
        monkeypatch.setattr(students_router, "get_admin_db", lambda: db)

        resp = client.put(
            "/api/professor/students/s1",
            json={"full_name": "Novo Nome", "is_active": False},
        )
        assert resp.status_code == 200

        updates = [r for r in db.recorder if r[0] == "students" and r[1] == "update"]
        assert len(updates) == 1
        payload = updates[0][2]
        assert "is_active" not in payload  # campo proibido foi removido
        assert payload.get("full_name") == "Novo Nome"  # campo permitido mantido

    def test_admin_pode_alterar_is_active(self, as_user, monkeypatch):
        # Controle: para admin a allowlist do professor não se aplica.
        as_user(_profile("admin"))
        db = _FakeDb({
            "students": _Resp(_student_row("s1", is_active=False)),
        })
        monkeypatch.setattr(students_router, "get_admin_db", lambda: db)

        resp = client.put(
            "/api/professor/students/s1",
            json={"is_active": False},
        )
        assert resp.status_code == 200

        updates = [r for r in db.recorder if r[0] == "students" and r[1] == "update"]
        assert len(updates) == 1
        assert updates[0][2].get("is_active") is False
