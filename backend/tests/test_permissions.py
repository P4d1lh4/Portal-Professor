"""Helper canônico de autorização de coordenador↔período."""
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.schemas.users import Profile
from app.services.permissions import assert_coordinator_owns_period


def _profile(role: str, uid: str = "u1") -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        id=uid, username=role, full_name=role, email=f"{role}@x.com",
        role=role, is_active=True, created_at=now, updated_at=now,
    )


class _Chain:
    def __init__(self, data):
        self._data = data

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def maybe_single(self):
        return self

    def execute(self):
        return type("R", (), {"data": self._data})()


class _FakeDb:
    def __init__(self, data):
        self._data = data

    def table(self, _name):
        return _Chain(self._data)


def test_coordenador_dono_do_periodo_passa():
    db = _FakeDb({"id": "p1"})  # query retorna o período
    assert_coordinator_owns_period(db, "p1", _profile("coordinator"))  # não levanta


def test_coordenador_de_outro_periodo_403():
    db = _FakeDb(None)  # query não encontra
    with pytest.raises(HTTPException) as exc:
        assert_coordinator_owns_period(db, "p1", _profile("coordinator"))
    assert exc.value.status_code == 403


def test_admin_e_noop_sem_tocar_o_banco():
    # db=None provaria que nem chega a consultar para admin.
    assert_coordinator_owns_period(None, "p1", _profile("admin"))
