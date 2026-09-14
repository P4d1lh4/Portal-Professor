"""Alunos do professor paginados no servidor (P-Q8), no formato da rota do coordenador."""
from fastapi.testclient import TestClient

import app.routers.students as students_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

TS = "2026-02-01T00:00:00+00:00"


def _student(sid, name):
    return {
        "id": sid, "student_number": sid, "full_name": name, "email": None,
        "academic_period_id": "p1", "enrollment_date": "2026-02-01",
        "medical_certificates": 0, "referral_info": None, "observations": None,
        "is_active": True, "created_at": TS,
    }


def _enrollments(query):
    # A mesma tabela é lida duas vezes: ids dos alunos do professor e, depois,
    # o detalhe (módulo + nota) só dos alunos da página.
    if any(m == "select" and "module:" in a[0] for m, a in query.calls):
        return Resp([{
            "id": "e1", "status": "active", "student_id": "s1",
            "module": {"id": "m1", "name": "Anatomia", "code": "ANA1", "max_absences": 10},
            "grade": {"final_grade": 7, "absences": 2},
        }])
    return Resp([{"student_id": "s1"}, {"student_id": "s2"}, {"student_id": "s1"}])


def _setup(monkeypatch, *, modules=({"id": "m1"},)):
    # O fake aplica o range como fatia: a Ana é a 41ª, então a página
    # offset=40 traz só ela, e a página errada viria com outro aluno.
    alunos = [_student(f"x{i}", f"Outro {i}") for i in range(40)] + [_student("s1", "Ana")]
    db = FakeDb({
        "modules": Resp(list(modules)),
        "enrollments": _enrollments,
        "students": Resp(alunos, count=42),
    })
    monkeypatch.setattr(students_router, "get_admin_db", lambda: db)
    return db


def test_devolve_pagina_com_total_e_detalhe(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup(monkeypatch)

    resp = client.get("/api/professor/students?limit=20&offset=40")

    assert resp.status_code == 200
    body = resp.json()
    assert (body["total"], body["limit"], body["offset"]) == (42, 20, 40)
    [ana] = body["items"]
    assert ana["enrolled_modules"][0]["module_code"] == "ANA1"
    assert ana["total_absences"] == 2
    # Página no servidor, só alunos ativos e dos módulos do professor.
    students_calls = db.calls("students")
    assert ("range", (40, 59)) in students_calls
    assert ("in_", ("id", ["s1", "s2"])) in students_calls
    assert ("eq", ("is_active", True)) in students_calls
    assert ("eq", ("professor_id", "prof-1")) in db.calls("modules")


def test_busca_vai_para_o_servidor(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup(monkeypatch)

    client.get("/api/professor/students?search=ana")

    assert any(m == "or_" and "ana" in a[0] for m, a in db.calls("students"))


def test_matriculas_sao_lidas_paginadas(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup(monkeypatch)

    client.get("/api/professor/students")

    assert any(m == "range" for m, _ in db.calls("enrollments"))


def test_professor_sem_modulos_recebe_pagina_vazia(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup(monkeypatch, modules=())

    resp = client.get("/api/professor/students")

    assert resp.json() == {"items": [], "total": 0, "limit": 50, "offset": 0}
    assert "students" not in db.tables
