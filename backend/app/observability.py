"""Observabilidade mínima: request-id por request + log correlacionável.

ponytail: sem dependência externa (Sentry/structlog). O request-id é o
primitivo que torna os logs correlacionáveis entre si e com o cliente
(header X-Request-ID). Um formatter JSON pode ser plugado depois sem
mudar este contrato.
"""
import logging
import uuid
from contextvars import ContextVar

REQUEST_ID_HEADER = "X-Request-ID"

_request_id: ContextVar[str] = ContextVar("request_id", default="-")


def set_request_id(value: str) -> None:
    _request_id.set(value)


def get_request_id() -> str:
    return _request_id.get()


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]


class RequestIdFilter(logging.Filter):
    """Injeta o request_id corrente em cada LogRecord (para o formatter usar)."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


def setup_logging(level: int = logging.INFO) -> None:
    """Configura o logger 'app' com request-id no formato. Idempotente."""
    app_logger = logging.getLogger("app")
    if any(getattr(h, "_portal_obs", False) for h in app_logger.handlers):
        return
    handler = logging.StreamHandler()
    handler._portal_obs = True  # type: ignore[attr-defined]
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s")
    )
    app_logger.addHandler(handler)
    app_logger.setLevel(level)
    app_logger.propagate = False
