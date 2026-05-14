from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import users, periods, modules, students, grades, import_csv, sheets, dashboard

app = FastAPI(
    title="Aplicação Professor — API",
    description="Backend FastAPI para a Aplicação Professor.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ---------------------------------------------------------------
# CORS
# ---------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


# ---------------------------------------------------------------
# Health check
# ---------------------------------------------------------------

@app.get("/api/healthz", tags=["health"])
def healthz() -> dict[str, str]:
    """Health check básico."""
    return {"status": "ok"}
