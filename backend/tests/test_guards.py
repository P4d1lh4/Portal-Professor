"""Testes do guard de período ativo."""
import pytest
from fastapi import HTTPException

from app.services.guards import (
    assert_module_period_active,
    is_period_active_for_module,
)
from tests.fakes import FakeDb, Resp, profile


def _db(module_row):
    return FakeDb({"modules": Resp(module_row)})


class TestIsPeriodActiveForModule:
    def test_periodo_ativo(self):
        db = _db({"academic_period": {"is_active": True}})
        assert is_period_active_for_module(db, "m1") is True

    def test_periodo_inativo(self):
        db = _db({"academic_period": {"is_active": False}})
        assert is_period_active_for_module(db, "m1") is False

    def test_modulo_inexistente_falsa(self):
        db = _db(None)
        assert is_period_active_for_module(db, "m1") is False

    def test_periodo_ausente_falsa(self):
        db = _db({"academic_period": None})
        assert is_period_active_for_module(db, "m1") is False


class TestAssertModulePeriodActive:
    def test_admin_passa_mesmo_com_periodo_fechado(self):
        db = _db({"academic_period": {"is_active": False}})
        # Não deve levantar
        assert_module_period_active(db, "m1", profile("admin"))

    def test_professor_bloqueado_periodo_fechado(self):
        db = _db({"academic_period": {"is_active": False}})
        with pytest.raises(HTTPException) as exc:
            assert_module_period_active(db, "m1", profile("professor"))
        assert exc.value.status_code == 409

    def test_coordenador_bloqueado_periodo_fechado(self):
        db = _db({"academic_period": {"is_active": False}})
        with pytest.raises(HTTPException) as exc:
            assert_module_period_active(db, "m1", profile("coordinator"))
        assert exc.value.status_code == 409

    def test_professor_passa_periodo_ativo(self):
        db = _db({"academic_period": {"is_active": True}})
        # Não deve levantar
        assert_module_period_active(db, "m1", profile("professor"))
