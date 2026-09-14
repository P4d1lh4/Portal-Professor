"""Helper canônico de autorização de coordenador↔período."""
import pytest
from fastapi import HTTPException

from app.services.permissions import assert_coordinator_owns_period
from tests.fakes import FakeDb, Resp, profile


def test_coordenador_dono_do_periodo_passa():
    db = FakeDb({"academic_periods": Resp({"id": "p1"})})  # query retorna o período
    assert_coordinator_owns_period(db, "p1", profile("coordinator", "coord-1"))  # não levanta
    # O escopo vem dos dois filtros: sem o de coordinator_id, qualquer
    # coordenador passaria (o fake não filtra; por isso o registro).
    assert ("eq", ("id", "p1")) in db.calls("academic_periods")
    assert ("eq", ("coordinator_id", "coord-1")) in db.calls("academic_periods")


def test_coordenador_de_outro_periodo_403():
    db = FakeDb({"academic_periods": Resp(None)})  # query não encontra
    with pytest.raises(HTTPException) as exc:
        assert_coordinator_owns_period(db, "p1", profile("coordinator"))
    assert exc.value.status_code == 403


def test_admin_e_noop_sem_tocar_o_banco():
    # db=None provaria que nem chega a consultar para admin.
    assert_coordinator_owns_period(None, "p1", profile("admin"))
