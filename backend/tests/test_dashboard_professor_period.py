"""Dashboard do professor respeita o período da barra superior.

O professor com módulos em dois períodos via os dois somados, e trocar o
período não mudava nada.
"""
from fastapi.testclient import TestClient

import app.routers.dashboard as dashboard_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

PERIODS = [
    {"id": "p1", "name": "2026.1", "is_active": False},
    {"id": "p2", "name": "2026.2", "is_active": True},
    {"id": "p3", "name": "2027.1", "is_active": True},
]
MODULES = [
    {"id": "m1", "name": "Anatomia", "code": "ANA1", "max_absences": 10,
     "is_active": True, "professor_id": "prof-1", "academic_period_id": "p1"},
    {"id": "m2", "name": "Fisiologia", "code": "FIS1", "max_absences": 10,
     "is_active": True, "professor_id": "prof-1", "academic_period_id": "p2"},
]


def _enr(eid, module_id, nome, absences, final):
    return {
        "id": eid, "module_id": module_id,
        "student": {"full_name": nome, "student_number": eid, "is_active": True},
        "grade": {"final_grade": final, "absences": absences,
                  "regular_exam_grade": final, "makeup_exam_grade": 0},
    }


ENROLLMENTS = [
    _enr("e1", "m1", "Ana", 9, 3),   # período encerrado, em risco
    _enr("e2", "m2", "Bia", 0, 8),
    _enr("e3", "m2", "Caio", 0, 4),  # em risco por nota
]


def _filtered(rows):
    """Aplica os .eq/.in_ da consulta, como o PostgREST faria."""
    def respond(query):
        out = rows
        for method, args in query.calls:
            if method == "eq":
                col, val = args
                out = [r for r in out if r.get(col) == val]
            elif method == "in_":
                col, vals = args
                out = [r for r in out if r.get(col) in vals]
        return Resp(out)
    return respond


def _dashboard(as_user, monkeypatch, period_id):
    as_user("professor", "prof-1")
    db = FakeDb({
        "academic_periods": _filtered(PERIODS),
        "modules": _filtered(MODULES),
        "enrollments": _filtered(ENROLLMENTS),
    })
    monkeypatch.setattr(dashboard_router, "get_admin_db", lambda: db)
    return client.get("/api/dashboard", params={"period_id": period_id})


def test_professor_com_modulos_em_dois_periodos_ve_so_os_do_periodo_pedido(as_user, monkeypatch):
    resp = _dashboard(as_user, monkeypatch, "p2")

    assert resp.status_code == 200
    data = resp.json()
    assert data["period"] == {"id": "p2", "name": "2026.2", "is_active": True}
    assert data["summary"] == {"modules": 1, "students": 2, "approvals": 1, "approval_rate": 50}
    assert [m["code"] for m in data["modules_detail"]] == ["FIS1"]
    assert [r["full_name"] for r in data["at_risk"]] == ["Caio"]


def test_periodo_sem_modulos_do_professor_devolve_dashboard_vazio(as_user, monkeypatch):
    resp = _dashboard(as_user, monkeypatch, "p3")

    assert resp.status_code == 200
    data = resp.json()
    # O nome de um período que ele não leciona não vaza.
    assert data["period"] is None
    assert data["summary"] == {"modules": 0, "students": 0, "approvals": 0, "approval_rate": 0}
    assert data["modules_detail"] == []


def test_periodo_inexistente_responde_404(as_user, monkeypatch):
    resp = _dashboard(as_user, monkeypatch, "nao-existe")

    assert resp.status_code == 404
