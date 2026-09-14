"""Matricular aluno existente e desmatricular (P-Q1 / B-S2).

Fecha o P-01: aluno criado pelo coordenador sem matrícula ficava fora de
Notas e Chamada, e não havia como matriculá-lo depois.
"""
import pytest
from fastapi.testclient import TestClient

import app.routers.modules as modules_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

MODULE = {
    "id": "m1", "name": "Anatomia", "professor_id": "prof-1",
    "academic_period_id": "p1", "academic_period": {"is_active": True},
}
STUDENT = {"id": "s1", "full_name": "Ana Souza", "academic_period_id": "p1", "is_active": True}
CREATED = {
    "id": "e1", "student_id": "s1", "module_id": "m1",
    "status": "active", "enrollment_date": "2026-09-14",
}
ENROLLMENT = {
    "id": "e1", "student_id": "s1", "module_id": "m1", "status": "active",
    "module": {"name": "Anatomia", "academic_period_id": "p1"},
    "student": {"full_name": "Ana Souza"},
    "grade": {"regular_exam_grade": 8.5, "final_grade": 8.5, "absences": 2},
}


def _setup(monkeypatch, *, module=MODULE, student=STUDENT, existing=None, owner=True, **extra):
    db = FakeDb({
        "modules": Resp(module),
        "academic_periods": Resp({"id": "p1"} if owner else None),
        "students": Resp(student),
        "enrollments": Resp(existing),
        "enrollments.insert": Resp([CREATED]),
        **extra,
    })
    monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)
    return db


def _writes(db, table, op):
    return [w[2] for w in db.writes if w[0] == table and w[1] == op]


def _post():
    return client.post("/api/modules/m1/enrollments", json={"student_id": "s1"})


# ─── POST /modules/{id}/enrollments ──────────────────────────────────────────


def test_coordenador_dono_matricula_com_linha_de_nota_e_auditoria(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _setup(monkeypatch)

    resp = _post()

    assert resp.status_code == 201
    assert resp.json()["id"] == "e1"
    assert _writes(db, "enrollments", "insert") == [
        {"student_id": "s1", "module_id": "m1", "status": "active"}
    ]
    assert _writes(db, "grades", "insert") == [{"enrollment_id": "e1"}]
    [audit] = _writes(db, "audit_log", "insert")
    assert audit["action"] == "insert"
    assert audit["entity"] == "enrollments"


def test_coordenador_de_outro_periodo_403(as_user, monkeypatch):
    as_user("coordinator", "coord-2")
    db = _setup(monkeypatch, owner=False)

    assert _post().status_code == 403
    assert not _writes(db, "enrollments", "insert")


def test_professor_nao_matricula(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup(monkeypatch)

    assert _post().status_code == 403
    assert not db.writes


def test_aluno_inexistente_404(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch, student=None)

    assert _post().status_code == 404
    assert not _writes(db, "enrollments", "insert")


def test_aluno_de_outro_periodo_422(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch, student={**STUDENT, "academic_period_id": "p2"})

    resp = _post()
    assert resp.status_code == 422
    assert "outro período" in resp.json()["detail"]
    assert not _writes(db, "enrollments", "insert")


def test_aluno_desativado_409(as_user, monkeypatch):
    as_user("admin")
    _setup(monkeypatch, student={**STUDENT, "is_active": False})

    assert _post().status_code == 409


def test_ja_matriculado_409(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _setup(monkeypatch, existing={"id": "e0"})

    resp = _post()
    assert resp.status_code == 409
    assert "já está matriculado" in resp.json()["detail"]
    assert not _writes(db, "enrollments", "insert")


@pytest.mark.parametrize("role, esperado", [("coordinator", 409), ("admin", 201)])
def test_periodo_fechado_so_admin_matricula(as_user, monkeypatch, role, esperado):
    as_user(role, "coord-1")
    _setup(monkeypatch, module={**MODULE, "academic_period": {"is_active": False}})

    assert _post().status_code == esperado


def test_falha_ao_criar_a_nota_desfaz_a_matricula(as_user, monkeypatch):
    as_user("admin")

    def boom(_query):
        raise RuntimeError("grades fora do ar")

    db = _setup(monkeypatch, **{"grades.insert": boom})

    with pytest.raises(RuntimeError):
        _post()
    assert ("enrollments", "delete", None) in db.writes
    assert ("eq", ("id", "e1")) in db.calls("enrollments")
    assert not _writes(db, "audit_log", "insert")


# ─── DELETE /enrollments/{id} ────────────────────────────────────────────────


def _setup_delete(monkeypatch, *, enrollment=ENROLLMENT, owner=True, period_active=True):
    db = FakeDb({
        "enrollments": Resp(enrollment),
        "academic_periods": Resp({"id": "p1"} if owner else None),
        "modules": Resp({"academic_period": {"is_active": period_active}}),
    })
    monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)
    return db


def test_desmatricula_guarda_a_nota_na_auditoria(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _setup_delete(monkeypatch)

    resp = client.delete("/api/enrollments/e1")

    assert resp.status_code == 204
    assert ("eq", ("id", "e1")) in db.calls("enrollments")
    assert _writes(db, "enrollments", "delete") == [None]
    [audit] = _writes(db, "audit_log", "insert")
    assert audit["action"] == "delete"
    assert audit["before_data"]["grade"]["final_grade"] == 8.5


def test_desmatricula_coordenador_de_outro_periodo_403(as_user, monkeypatch):
    as_user("coordinator", "coord-2")
    db = _setup_delete(monkeypatch, owner=False)

    assert client.delete("/api/enrollments/e1").status_code == 403
    assert not _writes(db, "enrollments", "delete")


def test_desmatricula_professor_403(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup_delete(monkeypatch)

    assert client.delete("/api/enrollments/e1").status_code == 403
    assert not db.writes


def test_desmatricula_inexistente_404(as_user, monkeypatch):
    as_user("admin")
    _setup_delete(monkeypatch, enrollment=None)

    assert client.delete("/api/enrollments/e1").status_code == 404


def test_desmatricula_periodo_fechado_409(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _setup_delete(monkeypatch, period_active=False)

    assert client.delete("/api/enrollments/e1").status_code == 409
    assert not _writes(db, "enrollments", "delete")
