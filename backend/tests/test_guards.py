"""Testes do guard de período ativo."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.schemas.users import Profile
from app.services.guards import (
    assert_module_period_active,
    is_period_active_for_module,
)


def _profile(role: str) -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        id=f"user-{role}",
        username=role,
        full_name=f"Usuário {role}",
        email=f"{role}@x.com",
        role=role,
        is_active=True,
        created_at=now,
        updated_at=now,
    )


class _Resp:
    def __init__(self, data):
        self.data = data


class _Chain:
    def __init__(self, data):
        self._data = data

    def select(self, _sel):
        return self

    def eq(self, _col, _val):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return _Resp(self._data)


class _FakeDb:
    def __init__(self, data):
        self._data = data

    def table(self, _name):
        return _Chain(self._data)


class TestIsPeriodActiveForModule:
    def test_periodo_ativo(self):
        db = _FakeDb({"academic_period": {"is_active": True}})
        assert is_period_active_for_module(db, "m1") is True

    def test_periodo_inativo(self):
        db = _FakeDb({"academic_period": {"is_active": False}})
        assert is_period_active_for_module(db, "m1") is False

    def test_modulo_inexistente_falsa(self):
        db = _FakeDb(None)
        assert is_period_active_for_module(db, "m1") is False

    def test_periodo_ausente_falsa(self):
        db = _FakeDb({"academic_period": None})
        assert is_period_active_for_module(db, "m1") is False


class TestAssertModulePeriodActive:
    def test_admin_passa_mesmo_com_periodo_fechado(self):
        db = _FakeDb({"academic_period": {"is_active": False}})
        # Não deve levantar
        assert_module_period_active(db, "m1", _profile("admin"))

    def test_professor_bloqueado_periodo_fechado(self):
        db = _FakeDb({"academic_period": {"is_active": False}})
        with pytest.raises(HTTPException) as exc:
            assert_module_period_active(db, "m1", _profile("professor"))
        assert exc.value.status_code == 409

    def test_coordenador_bloqueado_periodo_fechado(self):
        db = _FakeDb({"academic_period": {"is_active": False}})
        with pytest.raises(HTTPException) as exc:
            assert_module_period_active(db, "m1", _profile("coordinator"))
        assert exc.value.status_code == 409

    def test_professor_passa_periodo_ativo(self):
        db = _FakeDb({"academic_period": {"is_active": True}})
        # Não deve levantar
        assert_module_period_active(db, "m1", _profile("professor"))
