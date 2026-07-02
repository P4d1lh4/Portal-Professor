import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import _get_jwks
from .config import settings
from .observability import (
    REQUEST_ID_HEADER,
    get_request_id,
    new_request_id,
    set_request_id,
    setup_logging,
)
from .schemas.common import ErrorResponse
from .routers import (
    users,
    periods,
    modules,
    students,
    grades,
    import_csv,
    sheets,
    dashboard,
    medical_certificates,
    attendance,
    reports,
    audit,
    exports,
)

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Pré-aquece o JWKS do Supabase para que a primeira request autenticada
    # não pague o custo de fazer o fetch HTTPS (~500ms-1s).
    try:
        await asyncio.to_thread(_get_jwks)
        logger.info("JWKS do Supabase pré-aquecido com sucesso.")
    except Exception as exc:  # pragma: no cover
        logger.warning("Falha ao pré-aquecer JWKS: %s", exc)
    yield


app = FastAPI(
    title="Aplicação Professor — API",
    description="Backend FastAPI para a Aplicação Professor.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------
# CORS
# ---------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "Accept"],
    max_age=600,
)


# ---------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------
# Hardening básico das respostas da API. CSP fica no frontend (vercel.json),
# onde há HTML a proteger — aqui a API só serve JSON.

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    for header, value in _SECURITY_HEADERS.items():
        response.headers.setdefault(header, value)
    return response


# ---------------------------------------------------------------
# Request-ID (correlação de logs)
# ---------------------------------------------------------------
# Reaproveita X-Request-ID do cliente/proxy se vier; senão gera um. Fica
# disponível nos logs (via RequestIdFilter) e volta no header da resposta.


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    rid = request.headers.get(REQUEST_ID_HEADER) or new_request_id()
    set_request_id(rid)
    response = await call_next(request)
    response.headers[REQUEST_ID_HEADER] = rid
    return response


# ---------------------------------------------------------------
# Tratamento global de erros
# ---------------------------------------------------------------
# Sem este handler, uma exceção não tratada (ex.: erro do supabase-py/rede)
# vira o 500 do Starlette com corpo em texto plano — inconsistente com o
# resto da API (que usa {detail}). Aqui logamos e devolvemos ErrorResponse.
# ponytail: ponto único para plugar request-id/telemetria quando existirem.


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Erro não tratado em %s %s", request.method, request.url.path)
    # O middleware de security headers NÃO roda para respostas geradas aqui (o
    # handler de 500 fica ACIMA do user-middleware no stack do Starlette), então
    # aplicamos os headers diretamente — como já é feito com o X-Request-ID.
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(detail="Erro interno no servidor.").model_dump(),
        headers={**_SECURITY_HEADERS, REQUEST_ID_HEADER: get_request_id()},
    )


app.add_exception_handler(Exception, unhandled_exception_handler)


# ---------------------------------------------------------------
# Routers
# ---------------------------------------------------------------

app.include_router(users.router)
app.include_router(periods.router)
app.include_router(modules.router)
app.include_router(students.router)
app.include_router(grades.router)
app.include_router(import_csv.router)
app.include_router(sheets.router)
app.include_router(dashboard.router)
app.include_router(medical_certificates.router)
app.include_router(attendance.router)
app.include_router(reports.router)
app.include_router(audit.router)
app.include_router(exports.router)


# ---------------------------------------------------------------
# Health check
# ---------------------------------------------------------------

@app.get("/api/healthz", tags=["health"])
def healthz() -> dict[str, str]:
    """Liveness: o processo está de pé (barato, usado pelo Render)."""
    return {"status": "ok"}


@app.get("/api/readyz", tags=["health"])
async def readyz():
    """Readiness: valida conectividade com o Supabase (503 se indisponível).

    Separado do /healthz de propósito: uma indisponibilidade transitória do
    Supabase não deve derrubar a liveness e provocar restart do processo.
    """
    from .db import get_admin_db

    try:
        await asyncio.to_thread(
            lambda: get_admin_db().table("profiles").select("id").limit(1).execute()
        )
    except Exception:
        logger.warning("readyz: Supabase indisponível")
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}
