"""Trava o contrato HTTP do save de chamada (PUT .../attendance/{date}).

Escritos ANTES da migração do save para RPC transacional (M4): os asserts
cobrem o contrato observável (status, response, rejeição de matrícula de
outro módulo), não o mecanismo interno de escrita.
"""
from fastapi.testclient import TestClient

import app.routers.attendance as attendance_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


def _module_row() -> dict:
    return {
        "id": "m1", "professor_id": "prof-1", "academic_period_id": "p1",
        # embed usado por assert_module_period_active
        "academic_period": {"is_active": True},
    }


def _record_row() -> dict:
    return {
        "id": "rec-1", "module_id": "m1", "attendance_date": "2025-03-10",
        "notes": "aula 1", "created_by": "prof-1",
        "created_at": "2025-03-10T00:00:00+00:00",
        "updated_at": "2025-03-10T00:00:00+00:00",
    }


def test_professor_salva_chamada_200(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = FakeDb(
        {
            "modules": Resp(_module_row()),
            "attendance_records": Resp(_record_row()),
            "enrollments": Resp([{"id": "e1"}]),
        },
        rpc={"save_attendance_day": Resp("rec-1")},
    )
    monkeypatch.setattr(attendance_router, "get_admin_db", lambda: db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"notes": "aula 1", "entries": [{"enrollment_id": "e1", "status": "absent"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "rec-1"
    assert body["module_id"] == "m1"


def test_matricula_de_outro_modulo_400_sem_gravar_entries(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = FakeDb({
        "modules": Resp(_module_row()),
        "attendance_records": Resp(_record_row()),
        "enrollments": Resp([]),  # nenhuma matrícula válida no módulo
    })
    monkeypatch.setattr(attendance_router, "get_admin_db", lambda: db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"entries": [{"enrollment_id": "intrusa", "status": "absent"}]},
    )
    assert resp.status_code == 400
    # Nada pode ter sido gravado: nem entries direto, nem a RPC transacional.
    assert not [w for w in db.writes if w[0] == "attendance_entries"]
    assert not db.rpc_calls


def test_professor_de_outro_modulo_403(as_user, monkeypatch):
    as_user("professor", "prof-INTRUSO")
    db = FakeDb({"modules": Resp(_module_row())})
    monkeypatch.setattr(attendance_router, "get_admin_db", lambda: db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"entries": []},
    )
    assert resp.status_code == 403
    assert not db.writes


def test_coordenador_de_outro_periodo_403(as_user, monkeypatch):
    # Trava a checagem de coordenador↔período ANTES de migrá-la ao helper canônico.
    as_user("coordinator", "coord-INTRUSO")
    db = FakeDb({
        "modules": Resp(_module_row()),
        "academic_periods": Resp([]),  # coordenador não é dono do período
    })
    monkeypatch.setattr(attendance_router, "get_admin_db", lambda: db)

    resp = client.put(
        "/api/modules/m1/attendance/2025-03-10",
        json={"entries": []},
    )
    assert resp.status_code == 403
    assert not db.writes
