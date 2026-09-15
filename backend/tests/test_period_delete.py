"""Excluir período com tudo o que é dele: resumo antes, cascade explícito (registro 68)."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.routers.periods as periods_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

PERIOD = {"name": "2026.1", "is_active": False, "coordinator": {"id": "c1", "full_name": "Carla"}}
COUNTS = {"students": 2, "enrollments": 5, "attendance_records": 7, "medical_certificates": 1}
MODULES = [
    {"professor": {"full_name": "Bruno"}},
    {"professor": {"full_name": "Ana"}},
    {"professor": {"full_name": "Ana"}},
]
ATTACHMENTS = [{"storage_path": "cert-1/a.pdf"}]


def _setup(monkeypatch, *, period=PERIOD, counts=COUNTS, modules=MODULES, attachments=ATTACHMENTS):
    db = FakeDb({
        "academic_periods": Resp(period),
        "modules": Resp(modules),
        "medical_certificate_attachments": Resp(attachments),
        **{table: Resp([], count=n) for table, n in counts.items()},
    })
    db.removed = []
    db.storage = SimpleNamespace(
        from_=lambda bucket: SimpleNamespace(remove=lambda paths: db.removed.append((bucket, paths)))
    )
    monkeypatch.setattr(periods_router, "get_admin_db", lambda: db)
    return db


def _delete_filters(db, table):
    [query] = [q for q in db.queries if q.table == table and q.op == "delete"]
    return query.calls


def test_resumo_mostra_o_que_a_exclusao_leva(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch)

    resp = client.get("/api/periods/p1/deletion-summary")

    assert resp.status_code == 200
    assert resp.json() == {
        "name": "2026.1", "coordinator": "Carla", "professors": ["Ana", "Bruno"],
        "students": 2, "modules": 3, "enrollments": 5, "attendance_records": 7,
        "medical_certificates": 1, "attachments": 1,
    }
    # Sem `!inner`, o filtro no recurso embutido não tira linhas (sheets.py).
    scoped = {
        "enrollments": ("id, modules!inner(academic_period_id)", "modules.academic_period_id"),
        "attendance_records": ("id, modules!inner(academic_period_id)", "modules.academic_period_id"),
        "medical_certificates": ("id, students!inner(academic_period_id)", "students.academic_period_id"),
        "medical_certificate_attachments": (
            "storage_path, medical_certificates!inner(students!inner(academic_period_id))",
            "medical_certificates.students.academic_period_id",
        ),
    }
    for table, (select, column) in scoped.items():
        assert ("select", (select,)) in db.calls(table)
        assert ("eq", (column, "p1")) in db.calls(table)
    assert not db.writes


def test_com_vinculos_sem_cascade_recusa_sem_apagar(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch)

    resp = client.delete("/api/periods/p1")

    assert resp.status_code == 400
    assert not db.writes
    assert not db.removed


def test_cascade_apaga_pdfs_alunos_modulos_e_o_periodo(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch)

    assert client.delete("/api/periods/p1?cascade=true").status_code == 204

    assert db.removed == [("medical-certificates", ["cert-1/a.pdf"])]
    assert [(table, op) for table, op, _ in db.writes] == [
        ("students", "delete"),
        ("modules", "delete"),
        ("academic_periods", "delete"),
        ("audit_log", "insert"),
    ]
    assert ("eq", ("academic_period_id", "p1")) in _delete_filters(db, "students")
    assert ("eq", ("academic_period_id", "p1")) in _delete_filters(db, "modules")
    assert ("eq", ("id", "p1")) in _delete_filters(db, "academic_periods")
    [audit] = [payload for table, _, payload in db.writes if table == "audit_log"]
    assert audit["summary"] == "Período excluído: 2026.1"
    assert audit["before_data"]["students"] == 2
    assert audit["before_data"]["professors"] == ["Ana", "Bruno"]


def test_sem_vinculos_apaga_so_o_periodo(as_user, monkeypatch):
    as_user("admin")
    db = _setup(monkeypatch, counts={}, modules=[], attachments=[])

    assert client.delete("/api/periods/p1").status_code == 204

    assert [(table, op) for table, op, _ in db.writes] == [
        ("academic_periods", "delete"),
        ("audit_log", "insert"),
    ]
    assert not db.removed


@pytest.mark.parametrize("method, url", [
    ("get", "/api/periods/p1/deletion-summary"),
    ("delete", "/api/periods/p1?cascade=true"),
])
def test_periodo_inexistente_404(as_user, monkeypatch, method, url):
    as_user("admin")
    db = _setup(monkeypatch, period=None)

    assert getattr(client, method)(url).status_code == 404
    assert not db.writes


@pytest.mark.parametrize("role", ["coordinator", "professor"])
@pytest.mark.parametrize("method, url", [
    ("get", "/api/periods/p1/deletion-summary"),
    ("delete", "/api/periods/p1?cascade=true"),
])
def test_so_admin_ve_o_resumo_e_exclui(as_user, monkeypatch, role, method, url):
    as_user(role)
    db = _setup(monkeypatch)

    assert getattr(client, method)(url).status_code == 403
    assert not db.writes
    assert not db.removed
