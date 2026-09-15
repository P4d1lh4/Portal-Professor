"""Alteração 64: a API não grava mais o contador de atestados do aluno.

students.medical_certificates é o total da lista de atestados, mantido pelo
trigger da 0003. O formulário, o PUT /absences e o import o editavam à mão, e
o número divergia da lista até o próximo atestado incluído ou removido.
"""
import pytest
from fastapi.testclient import TestClient

import app.routers.students as students_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

ALUNO = {
    "id": "s1", "student_number": "2026001", "full_name": "Ana Souza", "email": None,
    "academic_period_id": "per1", "enrollment_date": "2026-02-01",
    "medical_certificates": 2, "referral_info": None, "observations": None,
    "is_active": True, "created_at": "2026-02-01T00:00:00Z",
}


def _use(monkeypatch, responses: dict) -> FakeDb:
    # academic_periods: a checagem de dono do coordenador encontra o período.
    db = FakeDb({"academic_periods": Resp({"id": "per1"}), **responses})
    monkeypatch.setattr(students_router, "get_admin_db", lambda: db)
    return db


def _students_writes(db) -> list[tuple]:
    return [(op, payload) for table, op, payload in db.writes if table == "students"]


@pytest.mark.parametrize("role", ["admin", "coordinator"])
def test_editar_aluno_ignora_o_contador(as_user, monkeypatch, role):
    as_user(role)
    db = _use(monkeypatch, {"students": Resp(ALUNO)})

    resp = client.put(
        "/api/professor/students/s1", json={"full_name": "Ana S.", "medical_certificates": 9}
    )

    assert resp.status_code == 200
    assert _students_writes(db) == [("update", {"full_name": "Ana S."})]


def test_so_o_contador_nao_tem_o_que_atualizar(as_user, monkeypatch):
    as_user("admin")
    db = _use(monkeypatch, {"students": Resp(ALUNO)})

    resp = client.put("/api/professor/students/s1", json={"medical_certificates": 9})

    assert resp.status_code == 422
    assert not db.writes


def test_criar_aluno_ignora_o_contador(as_user, monkeypatch):
    as_user("admin")
    # students: a checagem de matrícula repetida não acha ninguém.
    db = _use(monkeypatch, {"students": Resp(None), "students.insert": Resp([ALUNO])})

    resp = client.post("/api/periods/per1/students", json={
        "student_number": "2026001", "full_name": "Ana Souza",
        "enrollment_date": "2026-02-01", "medical_certificates": 5,
    })

    assert resp.is_success
    [(op, payload)] = _students_writes(db)
    assert op == "insert"
    assert "medical_certificates" not in payload


@pytest.mark.parametrize("method", ["get", "put"])
def test_rota_absences_saiu(as_user, monkeypatch, method):
    # O PUT só gravava o contador (alteração 64); o GET não tinha chamador (65).
    as_user("admin")
    db = _use(monkeypatch, {"students": Resp(ALUNO)})

    resp = client.request(method, "/api/professor/students/s1/absences", json={"medical_certificates": 5})

    assert resp.status_code == 404
    assert not db.writes
