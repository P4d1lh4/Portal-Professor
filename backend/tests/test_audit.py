"""Testes do helper de auditoria."""
from datetime import datetime, timezone
from typing import Any

from app.schemas.users import Profile
from app.services.audit import _diff_payload, write_audit_log


def _profile() -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        id="user-1",
        username="admin",
        full_name="Maria Admin",
        email="maria@x.com",
        role="admin",
        is_active=True,
        created_at=now,
        updated_at=now,
    )


class TestDiffPayload:
    def test_apenas_campos_alterados(self):
        before = {"a": 1, "b": 2, "c": 3}
        after = {"a": 1, "b": 20, "c": 3}
        b, a = _diff_payload(before, after)
        assert b == {"b": 2}
        assert a == {"b": 20}

    def test_sem_diferenca_retorna_none(self):
        before = {"a": 1, "b": 2}
        after = {"a": 1, "b": 2}
        b, a = _diff_payload(before, after)
        assert b is None
        assert a is None

    def test_chave_nova_aparece(self):
        before = {"a": 1}
        after = {"a": 1, "b": 2}
        b, a = _diff_payload(before, after)
        assert b == {"b": None}
        assert a == {"b": 2}

    def test_chave_removida_aparece(self):
        before = {"a": 1, "b": 2}
        after = {"a": 1}
        b, a = _diff_payload(before, after)
        assert b == {"b": 2}
        assert a == {"b": None}

    def test_none_em_um_dos_lados(self):
        # Caso de "delete" — before existe, after é None
        b, a = _diff_payload({"x": 1}, None)
        assert b == {"x": 1}
        assert a is None


class _FakeChain:
    """Mock encadeável que captura o payload do .insert()."""

    def __init__(self, captured: list[dict[str, Any]]) -> None:
        self._captured = captured

    def insert(self, payload: dict[str, Any]) -> "_FakeChain":
        self._captured.append(payload)
        return self

    def execute(self) -> None:
        return None


class _FakeDb:
    def __init__(self) -> None:
        self.captured: list[dict[str, Any]] = []

    def table(self, name: str) -> _FakeChain:
        assert name == "audit_log"
        return _FakeChain(self.captured)


class TestWriteAuditLog:
    def test_grava_payload_completo(self):
        db = _FakeDb()
        write_audit_log(
            db,
            actor=_profile(),
            action="update",
            entity="grades",
            entity_id="enr-123",
            summary="Nota alterada",
            before={"final_grade": 5.0},
            after={"final_grade": 7.0},
        )
        assert len(db.captured) == 1
        row = db.captured[0]
        assert row["actor_id"] == "user-1"
        assert row["actor_role"] == "admin"
        assert row["action"] == "update"
        assert row["entity"] == "grades"
        assert row["entity_id"] == "enr-123"
        assert row["before_data"] == {"final_grade": 5.0}
        assert row["after_data"] == {"final_grade": 7.0}

    def test_diff_reduz_payload_para_apenas_o_que_mudou(self):
        db = _FakeDb()
        write_audit_log(
            db,
            actor=_profile(),
            action="update",
            entity="students",
            entity_id="s-1",
            summary="Aluno atualizado",
            before={"full_name": "João", "email": "a@x.com"},
            after={"full_name": "João", "email": "b@x.com"},
        )
        row = db.captured[0]
        assert row["before_data"] == {"email": "a@x.com"}
        assert row["after_data"] == {"email": "b@x.com"}

    def test_falha_no_db_nao_propaga(self):
        class _ExplodingDb:
            def table(self, _name):
                raise RuntimeError("DB indisponível")

        # Não deve levantar exceção
        write_audit_log(
            _ExplodingDb(),
            actor=_profile(),
            action="delete",
            entity="modules",
            entity_id="m-1",
            summary="Excluído",
        )
