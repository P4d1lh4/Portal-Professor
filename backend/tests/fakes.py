"""Fake mínimo do client supabase-py para testes HTTP de router.

Filtros (`select`, `eq`, `order`, `maybe_single`...) encadeiam sem efeito; cada
tabela devolve a resposta configurada. Imita o teto de 1000 linhas do PostgREST
quando a query não usa `.range()`. Escritas ficam em `FakeDb.writes`.

ponytail: semente do B-12 — os fakes locais dos testes antigos migram para cá
lá, junto com o registro dos filtros aplicados.
"""
from datetime import datetime, timezone

from app.schemas.users import Profile

POSTGREST_MAX_ROWS = 1000


def profile(role: str, uid: str) -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        id=uid, username=role, full_name=role, email=f"{role}@x.com",
        role=role, is_active=True, created_at=now, updated_at=now,
    )


class Resp:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db: "FakeDb", table: str):
        self._db = db
        self._table = table
        self._range: tuple[int, int] | None = None

    def __getattr__(self, _name):
        return lambda *a, **k: self

    def range(self, lo: int, hi: int):
        self._range = (lo, hi)
        return self

    def update(self, payload):
        self._db.writes.append((self._table, "update", payload))
        return self

    def insert(self, payload):
        self._db.writes.append((self._table, "insert", payload))
        return self

    def execute(self):
        resp = self._db.responses.get(self._table, Resp([]))
        if not isinstance(resp.data, list):
            return resp
        lo, hi = self._range or (0, POSTGREST_MAX_ROWS - 1)
        hi = min(hi, lo + POSTGREST_MAX_ROWS - 1)
        return Resp(resp.data[lo:hi + 1], resp.count)


class FakeDb:
    def __init__(self, responses: dict[str, Resp]):
        self.responses = responses
        self.writes: list = []

    def table(self, name: str) -> _Query:
        return _Query(self, name)
