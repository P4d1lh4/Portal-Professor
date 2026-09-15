"""Registro 69: convite de uso único e cadastro público com o código."""
import hashlib
import re
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

import app.routers.users as users_router
import app.services.ratelimit as ratelimit
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

TS = "2026-01-01T00:00:00+00:00"
NO_PRAZO = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
VENCIDO = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
INVITE = {
    "id": "inv1", "role": "professor", "created_by": "autor-1",
    "expires_at": NO_PRAZO, "used_at": None,
}
AUTHOR = {"full_name": "Coord", "role": "coordinator", "is_active": True}
NOVO = {
    "id": "novo-1", "username": "bia", "full_name": "Bia Souza", "email": "bia@x.com",
    "role": "professor", "is_active": True, "created_at": TS, "updated_at": TS,
}
BODY = {
    "code": "abcd-efgh-jkmn", "email": "bia@x.com", "password": "senha-forte-123",
    "username": "bia", "full_name": "Bia Souza",
}
BLOCO = r"[A-HJKMNP-Z2-9]{4}"  # o alfabeto sem 0/O e 1/I/L


@pytest.fixture(autouse=True)
def _limite_zerado(monkeypatch):
    # O limite do cadastro é global no processo: cada teste começa do zero.
    monkeypatch.setattr(ratelimit, "_hits", {})


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _db(monkeypatch, *, invite=INVITE, author=AUTHOR, username_taken=False,
        claimed=True, novo=NOVO):
    def profiles(q):
        if ("eq", ("username", "bia")) in q.calls:
            return Resp({"id": "outro"} if username_taken else None)
        if ("eq", ("id", "autor-1")) in q.calls:
            return Resp(author)
        return Resp(novo)

    db = FakeDb({
        "invite_codes": Resp(invite),
        "invite_codes.insert": Resp([{"id": "inv1"}]),
        "invite_codes.update": Resp([invite] if claimed else []),
        "profiles": profiles,
    })
    monkeypatch.setattr(users_router, "get_admin_db", lambda: db)
    monkeypatch.setattr(
        users_router, "create_client",
        lambda *a, **k: pytest.fail("não deveria chegar ao Supabase Auth"),
    )
    return db


def _auth(monkeypatch, falha: str | None = None) -> list:
    """Admin API do Auth falsa; devolve os payloads que recebeu."""
    payloads: list = []

    def create_user(payload):
        payloads.append(payload)
        if falha:
            raise RuntimeError(falha)
        return SimpleNamespace(user=SimpleNamespace(id="novo-1"))

    auth = SimpleNamespace(admin=SimpleNamespace(create_user=create_user))
    monkeypatch.setattr(users_router, "create_client", lambda *a, **k: SimpleNamespace(auth=auth))
    return payloads


def _updates(db) -> list:
    return [w[2] for w in db.writes if w[:2] == ("invite_codes", "update")]


def _audit(db) -> list:
    return [w[2] for w in db.writes if w[0] == "audit_log"]


# ─── Gerar convite ───────────────────────────────────────────────────────────


@pytest.mark.parametrize("autor,papel", [
    ("admin", "coordinator"), ("admin", "professor"), ("coordinator", "professor"),
])
def test_gera_codigo_e_grava_so_o_hash(as_user, monkeypatch, autor, papel):
    as_user(autor, "autor-1")
    db = _db(monkeypatch)

    resp = client.post("/api/invites", json={"role": papel})

    assert resp.status_code == 201
    code = resp.json()["code"]
    assert re.fullmatch(f"{BLOCO}-{BLOCO}-{BLOCO}", code)
    [(_, _, row)] = [w for w in db.writes if w[0] == "invite_codes"]
    assert row["code_hash"] == _hash(code.replace("-", ""))
    assert (row["role"], row["created_by"]) == (papel, "autor-1")
    # O código em claro não vai para o banco nem para a auditoria.
    assert code.replace("-", "") not in str(db.writes)
    [entry] = _audit(db)
    assert (entry["action"], entry["entity"], entry["entity_id"]) == ("insert", "invites", "inv1")


@pytest.mark.parametrize("autor,papel,status", [
    ("coordinator", "coordinator", 403),  # coordenador só convida professor
    ("professor", "professor", 403),      # professor não convida
    ("admin", "admin", 422),              # ninguém convida admin
])
def test_quem_nao_pode_convidar_nao_grava(as_user, monkeypatch, autor, papel, status):
    as_user(autor)
    db = _db(monkeypatch)

    resp = client.post("/api/invites", json={"role": papel})

    assert resp.status_code == status
    assert not db.writes


# ─── Conferir e usar o código (rotas públicas) ───────────────────────────────


def test_check_normaliza_o_codigo_e_nao_consome(monkeypatch):
    db = _db(monkeypatch)

    resp = client.post("/api/signup/check", json={"code": " abcd-EFGH-jkmn "})

    assert resp.status_code == 200
    assert resp.json() == {"role": "professor"}
    assert ("eq", ("code_hash", _hash("ABCDEFGHJKMN"))) in db.calls("invite_codes")
    assert not db.writes


@pytest.mark.parametrize("estado", [
    {"invite": None},
    {"invite": {**INVITE, "used_at": TS}},
    {"invite": {**INVITE, "expires_at": VENCIDO}},
    {"author": {**AUTHOR, "is_active": False}},
    {"author": {**AUTHOR, "role": "professor"}},
    {"invite": {**INVITE, "role": "coordinator"}},
], ids=["inexistente", "usado", "vencido", "autor-desativado", "autor-rebaixado",
        "papel-acima-do-autor"])
@pytest.mark.parametrize("path,body", [
    ("/api/signup/check", {"code": "X"}), ("/api/signup", BODY),
], ids=["check", "signup"])
def test_codigo_que_nao_vale_400_com_a_mesma_mensagem(monkeypatch, estado, path, body):
    db = _db(monkeypatch, **estado)

    resp = client.post(path, json=body)

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Código inválido ou expirado."
    assert not db.writes


def test_cadastro_cria_a_conta_com_o_papel_do_convite(monkeypatch):
    db = _db(
        monkeypatch,
        invite={**INVITE, "role": "coordinator"},
        author={**AUTHOR, "role": "admin"},
        novo={**NOVO, "role": "coordinator"},
    )
    payloads = _auth(monkeypatch)

    # Um "role" no corpo é ignorado: o papel vem do convite.
    resp = client.post("/api/signup", json={**BODY, "role": "admin"})

    assert resp.status_code == 201
    [payload] = payloads
    assert payload["email_confirm"] is True
    assert payload["user_metadata"] == {"username": "bia", "full_name": "Bia Souza"}
    assert ("profiles", "update", {
        "username": "bia", "full_name": "Bia Souza", "role": "coordinator",
    }) in db.writes
    # Consumo atômico: só pega a linha ainda pendente.
    [claim, used_by] = [q for q in db.queries if q.table == "invite_codes" and q.op == "update"]
    assert ("eq", ("id", "inv1")) in claim.calls
    assert ("is_", ("used_at", "null")) in claim.calls
    assert list(_updates(db)[0]) == ["used_at"]
    assert _updates(db)[1] == {"used_by": "novo-1"}
    [entry] = _audit(db)
    assert (entry["actor_id"], entry["entity"], entry["entity_id"]) == ("novo-1", "users", "novo-1")
    assert "senha-forte-123" not in str(db.writes)


def test_corrida_quem_chega_depois_leva_400_sem_criar_conta(monkeypatch):
    # O UPDATE atômico não achou a linha pendente: outra pessoa usou antes.
    # O _db faz o teste falhar se o Auth for chamado.
    _db(monkeypatch, claimed=False)

    resp = client.post("/api/signup", json=BODY)

    assert resp.status_code == 400


def test_usuario_ja_existe_409_sem_tocar_no_codigo(monkeypatch):
    db = _db(monkeypatch, username_taken=True)

    resp = client.post("/api/signup", json=BODY)

    assert resp.status_code == 409
    assert "invite_codes" not in db.tables
    assert not db.writes


@pytest.mark.parametrize("falha,status", [
    ("User already registered", 409),
    ("connection to db.interno:5432 refused", 400),
])
def test_falha_no_auth_devolve_o_codigo(monkeypatch, falha, status):
    db = _db(monkeypatch)
    _auth(monkeypatch, falha)

    resp = client.post("/api/signup", json=BODY)

    assert resp.status_code == status
    assert "interno" not in resp.text
    assert _updates(db)[-1] == {"used_at": None}
    assert not _audit(db)


@pytest.mark.parametrize("campo,valor", [
    ("username", "bia souza"), ("username", "b"), ("full_name", "B"),
    ("email", "nao-e-email"), ("password", "curta12"), ("password", "x" * 73),
    ("code", ""), ("code", "X" * 33),
])
def test_dados_invalidos_422_sem_tocar_no_banco(monkeypatch, campo, valor):
    db = _db(monkeypatch)

    resp = client.post("/api/signup", json={**BODY, campo: valor})

    assert resp.status_code == 422
    assert not db.tables


def test_limite_de_tentativas_429(monkeypatch):
    _db(monkeypatch, invite=None)

    codes = [client.post("/api/signup/check", json={"code": "X"}).status_code for _ in range(21)]

    assert codes == [400] * 20 + [429]
