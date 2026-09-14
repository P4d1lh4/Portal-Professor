"""B-04: exports paginam além do teto de 1000 linhas do PostgREST."""
import pytest
from fastapi.testclient import TestClient

import app.routers.exports as exports_router
from app.deps import get_current_user
from app.main import app
from tests.fakes import FakeDb, Resp, profile

client = TestClient(app)

N = 1500  # acima do teto de 1000 do PostgREST


@pytest.fixture(autouse=True)
def as_admin():
    app.dependency_overrides[get_current_user] = lambda: profile("admin", "admin-1")
    yield
    app.dependency_overrides.pop(get_current_user, None)


def _linhas(resp) -> int:
    return len(resp.content.decode("utf-8-sig").splitlines())


def test_export_de_alunos_traz_todas_as_linhas(monkeypatch):
    students = [
        {
            "student_number": f"{i:05d}", "full_name": f"Aluno {i:05d}",
            "email": None, "enrollment_date": "2026-02-01", "is_active": True,
            "medical_certificates": 0, "referral_info": None, "observations": None,
        }
        for i in range(N)
    ]
    db = FakeDb({
        "academic_periods": Resp({"id": "p1", "name": "2026.1", "coordinator_id": "c"}),
        "students": Resp(students),
    })
    monkeypatch.setattr(exports_router, "get_admin_db", lambda: db)

    resp = client.get("/api/periods/p1/students/export.csv")
    assert resp.status_code == 200
    assert _linhas(resp) == N + 1  # + cabeçalho


def test_export_de_notas_traz_todas_as_linhas(monkeypatch):
    enrollments = [
        {
            "id": f"e{i}",
            "student": {"student_number": f"{i:05d}", "full_name": f"Aluno {i:05d}"},
            "grade": {
                "tutor_grade": 7, "regular_exam_grade": 7, "makeup_exam_grade": 0,
                "final_grade": 7, "absences": 0,
            },
        }
        for i in range(N)
    ]
    db = FakeDb({
        "modules": Resp({
            "id": "m1", "name": "Módulo", "code": "MOD1", "professor_id": "prof",
            "max_absences": 10, "academic_period_id": "p1",
        }),
        "enrollments": Resp(enrollments),
    })
    monkeypatch.setattr(exports_router, "get_admin_db", lambda: db)

    resp = client.get("/api/modules/m1/grades/export.csv")
    assert resp.status_code == 200
    assert _linhas(resp) == N + 1
