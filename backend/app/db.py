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


def get_admin_db() -> Client:
    """Cliente com service role key — bypassa RLS.

    Usado exclusivamente em operações server-side onde o FastAPI
    já validou as permissões via deps (require_role, etc.).
    Nunca expor para o frontend.
    """
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
