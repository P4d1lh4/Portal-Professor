"""Isolamento por período nas rotas item-level de /professor/students/{id}.

Trava o fix do IDOR: um coordenador só pode acessar/editar/desativar alunos
de períodos que ele coordena (a API usa service role, então o escopo é
garantido na camada de app).
"""
import pytest
from fastapi.testclient import TestClient

import app.routers.students as students_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


@pytest.fixture
def db(as_user, monkeypatch):
    """Coordenador que NÃO coordena o período do aluno.

    students devolve o período do aluno; academic_periods não encontra
    (coord-OUTRO não é dono) -> assert_coordinator_owns_period levanta 403.
    """
    as_user("coordinator", "coord-OUTRO")
    fake = FakeDb({
        "students": Resp({"academic_period_id": "p1"}),
        "academic_periods": Resp(None),
    })
    monkeypatch.setattr(students_router, "get_admin_db", lambda: fake)
    return fake


def test_coordenador_nao_dono_get_403(db):
    resp = client.get("/api/professor/students/s1")
    assert resp.status_code == 403
    # A checagem de dono filtra pelo período do aluno E pelo coordenador logado.
    assert ("eq", ("id", "p1")) in db.calls("academic_periods")
    assert ("eq", ("coordinator_id", "coord-OUTRO")) in db.calls("academic_periods")


def test_coordenador_nao_dono_put_403_sem_escrita(db):
    resp = client.put("/api/professor/students/s1", json={"full_name": "Hack"})
    assert resp.status_code == 403
    assert not db.writes


def test_coordenador_nao_dono_delete_403_sem_escrita(db):
    resp = client.delete("/api/professor/students/s1")
    assert resp.status_code == 403
    assert not db.writes


def test_coordenador_nao_dono_absences_put_403_sem_escrita(db):
    resp = client.put("/api/professor/students/s1/absences", json={"medical_certificates": 5})
    assert resp.status_code == 403
    assert not db.writes
