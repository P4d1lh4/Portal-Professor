"""Fake único do client supabase-py para os testes (B-12).

Uso:
    db = FakeDb({"modules": Resp(row), "grades.update": Resp([linha])})
    monkeypatch.setattr(router, "get_admin_db", lambda: db)

- Cada tabela devolve a resposta configurada; sem configuração, Resp([]).
  A chave "tabela.<op>" (update/insert/upsert/delete) responde só às escritas
  nessa tabela; sem ela, a escrita devolve a mesma resposta das leituras.
- Filtros não filtram (a resposta é a configurada), mas ficam registrados:
  db.calls("students") -> [("select", ("*",)), ("eq", ("id", "s1")), ...].
- Escritas: db.writes -> [(tabela, op, payload)]. Tabelas consultadas, em
  ordem: db.tables. RPC: db.rpc_calls -> [(nome, params)].
- rpc: FakeDb(rpc={"nome": Resp(...)}) ou uma função params -> Resp (pode
  levantar, para simular falha).
- Sem .range(), listas são cortadas em 1000 linhas, como no PostgREST.
"""
from datetime import datetime, timezone
from types import SimpleNamespace

from app.schemas.users import Profile

POSTGREST_MAX_ROWS = 1000
_WRITE_OPS = ("update", "insert", "upsert", "delete")


def profile(role: str, uid: str | None = None) -> Profile:
    now = datetime.now(timezone.utc)
    return Profile(
        id=uid or f"user-{role}", username=role, full_name=role,
        email=f"{role}@x.com", role=role, is_active=True,
        created_at=now, updated_at=now,
    )


class Resp:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, db: "FakeDb", table: str):
        self.table = table
        self.op = "select"
        self.calls: list[tuple] = []
        self._db = db
        self._range: tuple | None = None

    def __getattr__(self, method: str):
        # select, eq, in_, or_, order, limit, maybe_single...: registra e encadeia
        if method.startswith("_"):
            raise AttributeError(method)

        def chain(*args, **_kwargs):
            self.calls.append((method, args))
            if method in _WRITE_OPS:
                self.op = method
                self._db.writes.append((self.table, method, args[0] if args else None))
            elif method == "range":
                self._range = args
            return self

        return chain

    def execute(self):
        responses = self._db.responses
        resp = responses.get(f"{self.table}.{self.op}") or responses.get(self.table, Resp([]))
        if not isinstance(resp.data, list):
            return resp
        lo, hi = self._range or (0, POSTGREST_MAX_ROWS - 1)
        hi = min(hi, lo + POSTGREST_MAX_ROWS - 1)
        return Resp(resp.data[lo:hi + 1], resp.count)


class FakeDb:
    def __init__(self, responses: dict[str, Resp] | None = None, *, rpc: dict | None = None):
        self.responses = responses or {}
        self.rpc_responses = rpc or {}
        self.writes: list[tuple] = []
        self.rpc_calls: list[tuple] = []
        self.queries: list[_Query] = []

    def table(self, name: str) -> _Query:
        query = _Query(self, name)
        self.queries.append(query)
        return query

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append((name, params))
        resp = self.rpc_responses.get(name, Resp(None))
        return SimpleNamespace(execute=lambda: resp(params) if callable(resp) else resp)

    @property
    def tables(self) -> list[str]:
        return [q.table for q in self.queries]

    def calls(self, table: str) -> list[tuple]:
        return [c for q in self.queries if q.table == table for c in q.calls]
