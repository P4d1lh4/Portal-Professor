from functools import lru_cache

from supabase import Client, create_client
from postgrest._sync.request_builder import SyncMaybeSingleRequestBuilder
from .config import settings


# ---------------------------------------------------------------
# Defensive patch para maybe_single().execute()
#
# Em supabase-py 2.x, quando uma query .maybe_single() não encontra
# nenhuma linha, o PostgREST retorna "0 rows" e o cliente devolve
# `None` em vez de um APIResponse com data=None. Isso quebra todo o
# código que faz `resp.data` logo após .execute().
#
# Aqui interceptamos o retorno para sempre devolver um objeto com
# `.data = None` quando não houve resultado — mantendo a interface
# consistente para os routers.
# ---------------------------------------------------------------

class _EmptySingleResponse:
    """Substituto para APIResponse quando maybe_single() retorna 0 rows."""

    data: None = None
    count: None = None


_orig_maybe_single_execute = SyncMaybeSingleRequestBuilder.execute


def _patched_maybe_single_execute(self):  # type: ignore[no-untyped-def]
    resp = _orig_maybe_single_execute(self)
    if resp is None:
        return _EmptySingleResponse()
    return resp


SyncMaybeSingleRequestBuilder.execute = _patched_maybe_single_execute  # type: ignore[assignment]


def get_db() -> Client:
    """Cliente com anon key — respeita RLS (usado para leituras não-admin)."""
    return create_client(settings.supabase_url, settings.supabase_anon_key)


@lru_cache(maxsize=1)
def get_admin_db() -> Client:
    """Cliente com service role key — bypassa RLS.

    Usado exclusivamente em operações server-side onde o FastAPI
    já validou as permissões via deps (require_role, etc.).
    Nunca expor para o frontend.

    Memoizado: o SyncClient do supabase-py é reutilizável entre requests, então
    reaproveitamos o mesmo cliente (e suas conexões HTTP) em vez de pagar a
    construção + handshake TLS a cada chamada. Os testes fazem monkeypatch do
    nome `get_admin_db` no módulo do router, então o cache não os afeta.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def fetch_all(build, *, page_size: int = 1000) -> list:
    """Itera páginas via `.range()` até esgotar, contornando o teto de 1000
    linhas do PostgREST (que trunca queries sem paginação silenciosamente).

    `build(lo, hi)` deve devolver um query builder já com `.range(lo, hi)`
    aplicado, pronto para `.execute()`. Ex.:

        fetch_all(lambda lo, hi: db.table("enrollments")
                  .select("*").in_("module_id", ids).range(lo, hi))

    Os bounds do PostgREST são inclusivos, então `range(0, 999)` traz até 1000
    linhas; uma página menor que `page_size` significa fim dos dados.
    """
    rows: list = []
    start = 0
    while True:
        resp = build(start, start + page_size - 1).execute()
        page = resp.data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        start += page_size
