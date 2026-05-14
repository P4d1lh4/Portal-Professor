from supabase import Client, create_client
from .config import settings


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
