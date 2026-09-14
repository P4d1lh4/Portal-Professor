"""Testes de autorização por papel (isolamento de dados).

Como o backend usa o service role do Supabase (que faz bypass de RLS), a
autorização é garantida na camada de aplicação. Estes testes travam
regressões nesse isolamento para os endpoints mais sensíveis.

Estratégia: o fixture `as_user` (conftest) sobrescreve `get_current_user`
(que também alimenta `require_role`) e o monkeypatch de `get_admin_db` no
módulo do router injeta o FakeDb (tests/fakes.py).
"""
from fastapi.testclient import TestClient

import app.routers.dashboard as dashboard_router
import app.routers.modules as modules_router
import app.routers.periods as periods_router
import app.routers.students as students_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def _period_row(pid: str, coordinator_id: str) -> dict:
    return {
        "id": pid,
        "name": "2025.1",
        "coordinator_id": coordinator_id,
        "coordinator": {"id": coordinator_id, "full_name": "Coord"},
        "is_active": True,
        "created_at": "2025-01-01T00:00:00+00:00",
    }


def _module_row(mid: str, professor_id: str, period_id: str = "per1") -> dict:
    return {
        "id": mid,
        "name": "Matemática",
        "code": "MAT101",
        "professor_id": professor_id,
        "academic_period_id": period_id,
        "credits": 4,
        "max_absences": 10,
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


# ---------------------------------------------------------------
# S1 — GET /periods/{id} isolado por papel
# ---------------------------------------------------------------

class TestGetPeriodAuthz:
    def test_admin_acessa_qualquer_periodo(self, as_user, monkeypatch):
        as_user("admin")
        db = FakeDb({"academic_periods": Resp(_period_row("p1", "coord-x"))})
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 200
        assert resp.json()["id"] == "p1"

    def test_coordenador_acessa_proprio_periodo(self, as_user, monkeypatch):
        as_user("coordinator", "coord-1")
        db = FakeDb({"academic_periods": Resp(_period_row("p1", "coord-1"))})
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 200

    def test_coordenador_nao_acessa_periodo_de_outro(self, as_user, monkeypatch):
        as_user("coordinator", "coord-1")
        db = FakeDb({"academic_periods": Resp(_period_row("p1", "coord-OUTRO"))})
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 404

    def test_professor_acessa_periodo_com_seu_modulo(self, as_user, monkeypatch):
        as_user("professor", "prof-1")
        db = FakeDb({
            "academic_periods": Resp(_period_row("p1", "coord-x")),
            "modules": Resp([{"id": "m1"}]),
        })
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 200

    def test_professor_sem_modulo_nao_acessa(self, as_user, monkeypatch):
        as_user("professor", "prof-1")
        db = FakeDb({
            "academic_periods": Resp(_period_row("p1", "coord-x")),
            "modules": Resp([]),
        })
        monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)

        resp = client.get("/api/periods/p1")
        assert resp.status_code == 404


# ---------------------------------------------------------------
# S3 — PUT /professor/students/{id}: whitelist de campos do professor
# ---------------------------------------------------------------

class TestUpdateProfessorStudentWhitelist:
    def test_professor_nao_altera_is_active(self, as_user, monkeypatch):
        as_user("professor", "prof-1")
        db = FakeDb({
            "modules": Resp([{"id": "m1"}]),       # _assert_prof_has_student
            "enrollments": Resp([], count=1),      # aluno matriculado
            "students": Resp(_student_row("s1", full_name="Novo Nome")),
        })
        monkeypatch.setattr(students_router, "get_admin_db", lambda: db)

        resp = client.put(
            "/api/professor/students/s1",
            json={"full_name": "Novo Nome", "is_active": False},
        )
        assert resp.status_code == 200

        updates = [w for w in db.writes if w[0] == "students" and w[1] == "update"]
        assert len(updates) == 1
        payload = updates[0][2]
        assert "is_active" not in payload  # campo proibido foi removido
        assert payload.get("full_name") == "Novo Nome"  # campo permitido mantido

    def test_admin_pode_alterar_is_active(self, as_user, monkeypatch):
        # Controle: para admin a allowlist do professor não se aplica.
        as_user("admin")
        db = FakeDb({"students": Resp(_student_row("s1", is_active=False))})
        monkeypatch.setattr(students_router, "get_admin_db", lambda: db)

        resp = client.put(
            "/api/professor/students/s1",
            json={"is_active": False},
        )
        assert resp.status_code == 200

        updates = [w for w in db.writes if w[0] == "students" and w[1] == "update"]
        assert len(updates) == 1
        assert updates[0][2].get("is_active") is False


# ---------------------------------------------------------------
# S2 — GET /modules/{id}: leitura isolada por papel
# ---------------------------------------------------------------

class TestGetModuleAuthz:
    def test_admin_acessa_qualquer_modulo(self, as_user, monkeypatch):
        as_user("admin")
        db = FakeDb({"modules": Resp(_module_row("m1", "prof-x"))})
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.get("/api/modules/m1")
        assert resp.status_code == 200

    def test_professor_acessa_proprio_modulo(self, as_user, monkeypatch):
        as_user("professor", "prof-1")
        db = FakeDb({"modules": Resp(_module_row("m1", "prof-1"))})
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.get("/api/modules/m1")
        assert resp.status_code == 200

    def test_professor_nao_acessa_modulo_de_outro(self, as_user, monkeypatch):
        as_user("professor", "prof-1")
        db = FakeDb({"modules": Resp(_module_row("m1", "prof-OUTRO"))})
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.get("/api/modules/m1")
        assert resp.status_code == 404

    def test_coordenador_acessa_modulo_do_seu_periodo(self, as_user, monkeypatch):
        as_user("coordinator", "coord-1")
        db = FakeDb({
            "modules": Resp(_module_row("m1", "prof-x", period_id="per1")),
            "academic_periods": Resp({"id": "per1"}),  # período é do coordenador
        })
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.get("/api/modules/m1")
        assert resp.status_code == 200

    def test_coordenador_nao_acessa_modulo_de_outro_periodo(self, as_user, monkeypatch):
        as_user("coordinator", "coord-1")
        db = FakeDb({
            "modules": Resp(_module_row("m1", "prof-x", period_id="per1")),
            "academic_periods": Resp(None),  # período não é do coordenador
        })
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.get("/api/modules/m1")
        assert resp.status_code == 404


# ---------------------------------------------------------------
# Dashboard — coordenador não vê agregados de período alheio (IDOR — C2)
# ---------------------------------------------------------------

class TestDashboardAuthz:
    def test_coordenador_nao_ve_dashboard_de_periodo_alheio(self, as_user, monkeypatch):
        as_user("coordinator", "coord-1")
        # academic_periods sem match para (id, coordinator_id) → maybe_single vazio
        # → assert_coordinator_owns_period levanta 403 antes de montar a resposta.
        db = FakeDb({"academic_periods": Resp(None)})
        monkeypatch.setattr(dashboard_router, "get_admin_db", lambda: db)

        resp = client.get("/api/dashboard?period_id=periodo-de-outro-coordenador")
        assert resp.status_code == 403
        assert db.writes == []  # nenhuma escrita
