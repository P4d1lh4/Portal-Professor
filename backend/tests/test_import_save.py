"""Persist do import CSV via RPC transacional por aluno (M4).

Cobre o caminho de persistência (antes sem teste): cada linha válida chama a
RPC create_student_with_enrollments; falha numa linha vira errors_on_save sem
derrubar as demais.
"""
from fastapi.testclient import TestClient

import app.routers.import_csv as import_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


def _db(fail_numbers=()):
    def _rpc(params):
        if params["p_student"]["student_number"] in fail_numbers:
            raise RuntimeError("unique_violation simulada")
        return Resp("new-student-id")

    return FakeDb(
        {
            "academic_periods": Resp({"id": "p1", "coordinator_id": "coord-1"}),
            "students": Resp([]),          # nenhum aluno pré-existente
            "modules": Resp([{"id": "m1"}, {"id": "m2"}]),
        },
        rpc={"create_student_with_enrollments": _rpc},
    )


_CSV = b"student_number,full_name,enrollment_date\n2024001,Ana,2024-02-01\n2024002,Bruno,2024-02-01\n"


def test_importa_todos_via_rpc(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _db()
    monkeypatch.setattr(import_router, "get_admin_db", lambda: db)

    resp = client.post(
        "/api/periods/p1/students/import?dry_run=false",
        files={"file": ("alunos.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 2
    assert body["errors_on_save"] == []
    # Duas chamadas à RPC transacional (uma por aluno), com os módulos do período.
    assert len(db.rpc_calls) == 2
    assert db.rpc_calls[0][0] == "create_student_with_enrollments"
    assert db.rpc_calls[0][1]["p_module_ids"] == ["m1", "m2"]


def test_falha_numa_linha_nao_derruba_as_outras(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _db(fail_numbers={"2024002"})
    monkeypatch.setattr(import_router, "get_admin_db", lambda: db)

    resp = client.post(
        "/api/periods/p1/students/import?dry_run=false",
        files={"file": ("alunos.csv", _CSV, "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["imported"] == 1
    assert len(body["errors_on_save"]) == 1
    assert "2024002" in body["errors_on_save"][0]
