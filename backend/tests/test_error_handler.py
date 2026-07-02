"""Handler global de exceções: shape consistente e sem vazamento de detalhe."""
import asyncio
import json

from starlette.requests import Request

from app.main import unhandled_exception_handler


def _req():
    return Request({"type": "http", "method": "GET", "path": "/x", "headers": []})


def test_handler_retorna_json_500_padronizado():
    resp = asyncio.run(unhandled_exception_handler(_req(), ValueError("segredo-interno")))
    assert resp.status_code == 500
    body = json.loads(resp.body)
    assert body == {"detail": "Erro interno no servidor."}


def test_handler_nao_vaza_detalhe_da_excecao():
    resp = asyncio.run(unhandled_exception_handler(_req(), RuntimeError("stacktrace-secreto")))
    assert b"stacktrace-secreto" not in resp.body


def test_handler_inclui_security_headers():
    # O 500 não passa pelo middleware de headers; o handler os aplica direto.
    resp = asyncio.run(unhandled_exception_handler(_req(), ValueError("x")))
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert resp.headers["X-Frame-Options"] == "DENY"
    assert "Strict-Transport-Security" in resp.headers
