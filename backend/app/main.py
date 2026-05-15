import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import _get_jwks
from .config import settings
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
)

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


# ---------------------------------------------------------------
# Health check
# ---------------------------------------------------------------

@app.get("/api/healthz", tags=["health"])
def healthz() -> dict[str, str]:
    """Health check básico."""
    return {"status": "ok"}
