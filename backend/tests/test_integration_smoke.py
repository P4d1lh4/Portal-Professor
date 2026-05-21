"""Testes de integração (smoke) contra um Supabase de teste real.

Pulados automaticamente quando SUPABASE_TEST_URL / SUPABASE_TEST_SERVICE_ROLE_KEY
não estão definidos (ver conftest.py). São o ponto de partida para cobrir o que
os testes unitários (que usam banco falso) não alcançam: queries/RPC reais.
"""
import uuid

import pytest

pytestmark = pytest.mark.integration


def test_conectividade_e_schema(integration_db):
    """Confirma que o banco responde e a tabela de domínio existe."""
    resp = integration_db.table("academic_periods").select("id").limit(1).execute()
    assert isinstance(resp.data, list)


def test_rpc_create_student_with_enrollments_existe_e_e_atomica(integration_db):
    """A função da migração 0007 deve existir e reverter em erro.

    Chama com um período inexistente: a inserção do aluno viola a FK e a função
    (transacional) deve abortar sem persistir nada. Se a função não existir, o
    erro será de "função inexistente" — o que falha o teste e sinaliza migração
    pendente.
    """
    payload = {
        "student_number": f"itest-{uuid.uuid4().hex[:8]}",
        "full_name": "Teste Integração",
        "academic_period_id": str(uuid.uuid4()),  # inexistente → viola FK
    }
    try:
        integration_db.rpc(
            "create_student_with_enrollments",
            {"p_student": payload, "p_module_ids": []},
        ).execute()
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        assert any(s in msg for s in ("foreign key", "violates", "viola")), (
            f"RPC não se comportou como esperado (migração 0007 ausente?): {exc}"
        )
        return
    pytest.fail("Esperava erro de FK por período inexistente — a função não abortou.")
