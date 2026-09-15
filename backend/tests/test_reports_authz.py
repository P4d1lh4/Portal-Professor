"""B-13: relatórios em PDF — boletim do aluno e relatório do período."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

import app.routers.reports as reports_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

STUDENT = {
    "id": "s1", "student_number": "2026001", "full_name": "Ana", "email": None,
    "academic_period_id": "p1",
    "academic_period": {"id": "p1", "name": "2026.1"},
}
PERIOD = {"id": "p1", "name": "2026.1", "coordinator": {"id": "coord-1", "full_name": "Coord"}}


def _periodos(dono: bool):
    """academic_periods é lido duas vezes no relatório do período: o período
    sempre existe; a checagem de dono (filtro por coordinator_id) só acha se `dono`."""
    def resp(query):
        checa_dono = any(m == "eq" and a[0] == "coordinator_id" for m, a in query.calls)
        return Resp(None if checa_dono and not dono else PERIOD)
    return resp


def _use(monkeypatch, responses) -> FakeDb:
    db = FakeDb(responses)
    monkeypatch.setattr(reports_router, "get_admin_db", lambda: db)
    return db


@pytest.mark.parametrize("role,uid,extra,esperado", [
    ("admin", None, {}, 200),
    ("coordinator", "coord-1", {"academic_periods": _periodos(dono=True)}, 200),
    ("coordinator", "coord-2", {"academic_periods": _periodos(dono=False)}, 403),
    ("professor", "prof-1", {"modules": Resp([{"id": "m1"}]), "enrollments": Resp([], count=1)}, 200),
    ("professor", "prof-2", {"modules": Resp([{"id": "m1"}]), "enrollments": Resp([], count=0)}, 403),
    ("professor", "prof-3", {"modules": Resp([])}, 403),
])
def test_boletim_do_aluno(as_user, monkeypatch, role, uid, extra, esperado):
    as_user(role, uid)
    _use(monkeypatch, {"students": Resp(STUDENT), **extra})

    resp = client.get("/api/students/s1/report")
    assert resp.status_code == esperado
    if esperado == 200:
        assert resp.headers["content-type"] == "application/pdf"


def test_boletim_de_aluno_inexistente_404(as_user, monkeypatch):
    as_user("admin")
    _use(monkeypatch, {"students": Resp(None)})
    assert client.get("/api/students/s1/report").status_code == 404


def test_boletim_lista_os_atestados_do_aluno(as_user, monkeypatch):
    """B-S6: o boletim lista os atestados de medical_certificates, não o contador."""
    as_user("admin")
    db = _use(monkeypatch, {
        "students": Resp(STUDENT),
        "medical_certificates": Resp([
            {"start_date": "2026-03-02", "end_date": "2026-03-04", "reason": "Gripe"},
        ]),
    })
    gerados = []

    def fake_pdf(data):
        gerados.append(data)
        return b"%PDF-"

    monkeypatch.setattr(reports_router, "build_student_report_pdf", fake_pdf)

    assert client.get("/api/students/s1/report").status_code == 200
    [data] = gerados
    assert [(c.start_date, c.end_date, c.days, c.reason) for c in data.certificates] == [
        (date(2026, 3, 2), date(2026, 3, 4), 3, "Gripe"),
    ]
    assert ("eq", ("student_id", "s1")) in db.calls("medical_certificates")


@pytest.mark.parametrize("role,uid,dono,esperado", [
    ("admin", None, False, 200),  # admin não é escopado por período
    ("coordinator", "coord-1", True, 200),
    ("coordinator", "coord-2", False, 403),
    ("professor", "prof-1", True, 403),  # rota só de coordenador/admin
])
def test_relatorio_do_periodo(as_user, monkeypatch, role, uid, dono, esperado):
    as_user(role, uid)
    _use(monkeypatch, {"academic_periods": _periodos(dono), "students": Resp([])})

    resp = client.get("/api/periods/p1/report")
    assert resp.status_code == esperado
    if esperado == 200:
        assert resp.headers["content-type"] == "application/pdf"
