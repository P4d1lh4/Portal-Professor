"""Testes de integração da autorização de coordenador em /modules.

Travam o comportamento atual (403 + mensagem específica) ANTES da
consolidação da checagem no helper canônico de services/permissions.py,
para que a migração não altere o contrato observável.
"""
from fastapi.testclient import TestClient

import app.routers.modules as modules_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)


def _module_row() -> dict:
    return {
        "id": "m1", "name": "Anatomia", "code": "ANA-01",
        "professor_id": "prof-1", "academic_period_id": "p1",
        "credits": 4, "max_absences": 10, "is_active": True,
        "created_at": "2025-01-01T00:00:00+00:00",
    }


class TestCoordenadorNaoDono403:
    """Coordenador que NÃO coordena o período do módulo: sempre 403."""

    def test_put_modules_403(self, as_user, monkeypatch):
        as_user("coordinator", "coord-2")
        db = FakeDb({
            "modules": Resp(_module_row()),
            "academic_periods": Resp(None),  # não é dono
        })
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.put("/api/modules/m1", json={"name": "Novo"})
        assert resp.status_code == 403
        assert "módulos neste período" in resp.json()["detail"]
        assert not [w for w in db.writes if w[1] == "update"]

    def test_delete_modules_403(self, as_user, monkeypatch):
        as_user("coordinator", "coord-2")
        db = FakeDb({
            "modules": Resp(_module_row()),
            "academic_periods": Resp(None),
        })
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.delete("/api/modules/m1")
        assert resp.status_code == 403
        assert not [w for w in db.writes if w[1] == "delete"]

    def test_post_modules_403(self, as_user, monkeypatch):
        as_user("coordinator", "coord-2")
        db = FakeDb({"academic_periods": Resp(None)})
        monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

        resp = client.post("/api/modules", json={
            "name": "Novo", "code": "N-01",
            "professor_id": "prof-1", "academic_period_id": "p1",
        })
        assert resp.status_code == 403
        assert not [w for w in db.writes if w[1] == "insert"]


def test_put_coordenador_dono_200(as_user, monkeypatch):
    """Controle positivo: dono do período consegue editar o módulo."""
    as_user("coordinator", "coord-1")
    db = FakeDb({
        "modules": Resp(_module_row()),
        "academic_periods": Resp({"id": "p1"}),  # é dono
    })
    monkeypatch.setattr(modules_router, "get_admin_db", lambda: db)

    resp = client.put("/api/modules/m1", json={"name": "Anatomia II"})
    assert resp.status_code == 200
    updates = [w for w in db.writes if w[0] == "modules" and w[1] == "update"]
    assert len(updates) == 1
    assert updates[0][2] == {"name": "Anatomia II"}
