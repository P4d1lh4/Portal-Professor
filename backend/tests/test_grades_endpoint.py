"""Teste de regressão do PUT /api/grades/{enrollment_id}.

Cobre o bug em que o endpoint encadeava .update(...).eq(...).select() — método
inexistente no builder do supabase-py — causando 500 ao salvar uma nota.
"""
from fastapi.testclient import TestClient

import app.routers.grades as grades_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


def _grade_select(module_id="m1"):
    return {
        "id": "g1", "enrollment_id": "e1",
        "tutor_grade": 0.0, "regular_exam_grade": 5.0, "makeup_exam_grade": 0.0,
        "final_grade": 5.0, "absences": 0,
        "last_updated": "2025-01-01T00:00:00+00:00",
        "enrollment": {"module_id": module_id, "student_id": "s1"},
    }


def _updated_row(nota: float) -> dict:
    # Linha retornada pelo update (sem a chave de join "enrollment").
    row = {**_grade_select(), "regular_exam_grade": nota, "final_grade": nota,
           "last_updated": "2025-01-02T00:00:00+00:00"}
    del row["enrollment"]
    return row


def test_professor_salva_nota_recalcula_e_retorna_200(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = FakeDb({
        "grades": Resp(_grade_select()),
        "grades.update": Resp([_updated_row(8.0)]),
        "modules": Resp({
            "id": "m1", "professor_id": "prof-1",
            "academic_period": {"is_active": True},
        }),
    })
    monkeypatch.setattr(grades_router, "get_admin_db", lambda: db)

    resp = client.put("/api/grades/e1", json={"regular_exam_grade": 8})
    assert resp.status_code == 200
    body = resp.json()
    assert body["regular_exam_grade"] == 8.0
    assert body["final_grade"] == 8.0

    # O update foi registrado e calculou a nota final.
    updates = [w for w in db.writes if w[0] == "grades" and w[1] == "update"]
    assert len(updates) == 1
    assert updates[0][2]["final_grade"] == 8.0


def test_coordenador_do_periodo_salva_nota_200(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = FakeDb({
        "grades": Resp(_grade_select()),
        "grades.update": Resp([_updated_row(7.0)]),
        "modules": Resp({
            "id": "m1", "professor_id": "prof-9",
            "academic_period": {"coordinator_id": "coord-1", "is_active": True},
        }),
    })
    monkeypatch.setattr(grades_router, "get_admin_db", lambda: db)

    resp = client.put("/api/grades/e1", json={"regular_exam_grade": 7})
    assert resp.status_code == 200
    assert resp.json()["final_grade"] == 7.0


def test_coordenador_de_outro_periodo_nao_edita_nota_403(as_user, monkeypatch):
    as_user("coordinator", "coord-2")  # coordena outro período
    db = FakeDb({
        "grades": Resp(_grade_select()),
        "modules": Resp({
            "id": "m1", "professor_id": "prof-9",
            "academic_period": {"coordinator_id": "coord-1", "is_active": True},
        }),
    })
    monkeypatch.setattr(grades_router, "get_admin_db", lambda: db)

    resp = client.put("/api/grades/e1", json={"regular_exam_grade": 7})
    assert resp.status_code == 403
    # Nenhuma nota pode ter sido gravada.
    assert not [w for w in db.writes if w[1] == "update"]
