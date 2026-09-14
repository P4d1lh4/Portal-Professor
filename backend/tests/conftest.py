"""Configuração compartilhada de testes.

Fornece a fixture `integration_db` para testes de integração contra um Supabase
de teste real. Se as variáveis de ambiente não estiverem definidas, esses testes
são automaticamente pulados — a suíte unitária roda sem nenhum banco.

Para rodar a integração (ex.: em CI/staging contra um projeto Supabase dedicado):

    export SUPABASE_TEST_URL=https://<projeto>.supabase.co
    export SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role_key_do_projeto_de_teste>
    pytest -m integration

⚠️ Use SEMPRE um projeto Supabase separado para testes — nunca o de produção.
"""
import os

import pytest

INTEGRATION_ENV = ("SUPABASE_TEST_URL", "SUPABASE_TEST_SERVICE_ROLE_KEY")


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: exige um Supabase de teste real "
        "(SUPABASE_TEST_URL e SUPABASE_TEST_SERVICE_ROLE_KEY).",
    )


@pytest.fixture
def as_user():
    """Loga nas rotas como `role` (override de get_current_user, que também
    alimenta require_role). Devolve o Profile; o override sai no teardown."""
    from app.deps import get_current_user
    from app.main import app
    from tests.fakes import profile

    def _set(role: str, uid: str | None = None):
        user = profile(role, uid)
        app.dependency_overrides[get_current_user] = lambda: user
        return user

    yield _set
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(scope="session")
def integration_db():
    """Cliente supabase-py com service role para o banco de teste.

    Pula a sessão de teste se as variáveis de ambiente não estiverem definidas.
    """
    missing = [v for v in INTEGRATION_ENV if not os.environ.get(v)]
    if missing:
        pytest.skip(
            "Integração desabilitada: defina " + " e ".join(INTEGRATION_ENV)
        )
    from supabase import create_client

    return create_client(
        os.environ["SUPABASE_TEST_URL"],
        os.environ["SUPABASE_TEST_SERVICE_ROLE_KEY"],
    )
