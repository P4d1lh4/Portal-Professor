"""Alunos em risco (P-N1): regra única, Notas do módulo e dashboard do professor."""
import pytest
from fastapi.testclient import TestClient

import app.routers.dashboard as dashboard_router
import app.routers.modules as modules_router
from app.main import app
from app.services.classification import risk_reasons
from tests.fakes import FakeDb, Resp

client = TestClient(app)


@pytest.mark.parametrize("absences, max_absences, esperado", [
    (7, 10, []),            # 70%
    (8, 10, ["faltas"]),    # 80%: limiar
    (12, 10, ["faltas"]),   # passou do limite
    (2, 3, []),             # 67%
    (3, 3, ["faltas"]),
    (28, 35, ["faltas"]),   # 80% exato, onde o float erraria (35 * 0.8 = 28.000000000000004)
    (1, 0, ["faltas"]),     # limite zero: qualquer falta
    (0, 0, []),
])
def test_limiar_de_faltas_e_80_por_cento(absences, max_absences, esperado):
    assert risk_reasons(8.0, absences, max_absences, graded=True) == esperado


def test_nota_so_conta_depois_de_prova_lancada():
    assert risk_reasons(0, 0, 10, graded=False) == []
    assert risk_reasons(4.9, 0, 10, graded=True) == ["nota"]
    assert risk_reasons(5, 0, 10, graded=True) == []
    assert risk_reasons(3, 9, 10, graded=True) == ["faltas", "nota"]


def _grade(absences, regular, final):
    return {
        "tutor_grade": 0, "regular_exam_grade": regular, "makeup_exam_grade": 0,
        "final_grade": final, "absences": absences,
    }


def test_notas_do_modulo_trazem_o_risco(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = FakeDb({
        "modules": Resp({
            "id": "m1", "professor_id": "prof-1", "academic_period_id": "p1", "max_absences": 10,
        }),
        "enrollments": Resp([
            {"id": "e1", "status": "active", "grade": _grade(8, 6, 6),
             "student": {"id": "s1", "student_number": "1", "full_name": "Ana"}},
            {"id": "e2", "status": "active", "grade": _grade(0, 3, 3),
             "student": {"id": "s2", "student_number": "2", "full_name": "Bia"}},
            {"id": "e3", "status": "active", "grade": _grade(0, 0, 0),
             "student": {"id": "s3", "student_number": "3", "full_name": "Caio"}},
        ]),
    })
    monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

    rows = client.get("/api/modules/m1/students").json()

    assert [(r["full_name"], r["risk"]) for r in rows] == [
        ("Ana", ["faltas"]), ("Bia", ["nota"]), ("Caio", []),
    ]


def test_dashboard_do_professor_lista_em_risco_do_mais_urgente(as_user, monkeypatch):
    as_user("professor", "prof-1")

    def enr(eid, nome, absences, regular, final, ativo=True):
        return {
            "id": eid, "module_id": "m1",
            "student": {"full_name": nome, "student_number": eid, "is_active": ativo},
            "grade": {"final_grade": final, "absences": absences,
                      "regular_exam_grade": regular, "makeup_exam_grade": 0},
        }

    db = FakeDb({
        "modules": Resp([{"id": "m1", "name": "Anatomia", "code": "ANA1", "max_absences": 10, "is_active": True}]),
        "enrollments": Resp([
            enr("e1", "Bia", 0, 4, 4),                   # nota
            enr("e2", "Ana", 8, 7, 7),                   # faltas (80%)
            enr("e3", "Caio", 0, 0, 0),                  # sem prova lançada: fora
            enr("e4", "Duda", 10, 8, 8, ativo=False),    # inativo: fora
            enr("e5", "Edu", 9, 3, 3),                   # faltas e nota, mais faltas
        ]),
    })
    monkeypatch.setattr(dashboard_router, "get_admin_db", lambda: db)

    at_risk = client.get("/api/dashboard").json()["at_risk"]

    assert [(r["full_name"], r["reasons"]) for r in at_risk] == [
        ("Edu", ["faltas", "nota"]), ("Ana", ["faltas"]), ("Bia", ["nota"]),
    ]
    assert at_risk[0]["module_code"] == "ANA1"
    assert at_risk[0]["max_absences"] == 10
