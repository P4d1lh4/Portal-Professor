"""B-13: atestados médicos — mesmo escopo de aluno de students.py.

Acesso: admin; coordenador do período do aluno; professor com o aluno
matriculado em algum módulo seu. As 8 rotas passam por
_assert_can_access_student antes de qualquer escrita ou acesso ao storage.
"""
import pytest
from fastapi.testclient import TestClient

import app.routers.medical_certificates as mc_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

STUDENT = {"id": "s1", "academic_period_id": "p1"}
CERT = {
    "id": "c1", "student_id": "s1", "reason": "Gripe",
    "start_date": "2026-03-01", "end_date": "2026-03-03", "notes": None,
    "created_by": "x", "created_at": "2026-03-01T00:00:00+00:00",
    "updated_at": "2026-03-01T00:00:00+00:00",
}
PDF = b"%PDF-1.4 teste"

ROTAS = [
    ("get", "/api/students/s1/medical-certificates", {}),
    ("post", "/api/students/s1/medical-certificates",
     {"json": {"reason": "Gripe", "start_date": "2026-03-01", "end_date": "2026-03-03"}}),
    ("get", "/api/medical-certificates/c1", {}),
    ("put", "/api/medical-certificates/c1", {"json": {"reason": "Outra"}}),
    ("delete", "/api/medical-certificates/c1", {}),
    ("get", "/api/medical-certificates/c1/attachments", {}),
    ("post", "/api/medical-certificates/c1/attachments",
     {"files": {"file": ("a.pdf", PDF, "application/pdf")}}),
    ("delete", "/api/medical-certificates/c1/attachments/a1", {}),
]

NAO_DONOS = {
    # coordenador de outro período, que também não leciona para o aluno
    "coordinator": {"academic_periods": Resp(None), "modules": Resp([])},
    # professor cujos módulos não têm o aluno matriculado
    "professor": {"modules": Resp([{"id": "m1"}]), "enrollments": Resp([], count=0)},
}


def _use(monkeypatch, responses) -> FakeDb:
    db = FakeDb(responses)
    monkeypatch.setattr(mc_router, "get_admin_db", lambda: db)
    return db


@pytest.mark.parametrize("role", ["coordinator", "professor"])
@pytest.mark.parametrize("method,path,kwargs", ROTAS)
def test_nao_dono_403_sem_escrita(as_user, monkeypatch, role, method, path, kwargs):
    as_user(role, f"{role}-intruso")
    db = _use(monkeypatch, {
        "students": Resp(STUDENT), "medical_certificates": Resp(CERT), **NAO_DONOS[role],
    })
    resp = client.request(method, path, **kwargs)
    assert resp.status_code == 403
    assert not db.writes


def test_checagem_filtra_pelo_usuario_logado(as_user, monkeypatch):
    as_user("coordinator", "coord-9")
    db = _use(monkeypatch, {"students": Resp(STUDENT), **NAO_DONOS["coordinator"]})

    assert client.get("/api/students/s1/medical-certificates").status_code == 403
    assert ("eq", ("id", "p1")) in db.calls("academic_periods")
    assert ("eq", ("coordinator_id", "coord-9")) in db.calls("academic_periods")
    assert ("eq", ("professor_id", "coord-9")) in db.calls("modules")


@pytest.mark.parametrize("role,extra", [
    ("admin", {}),
    ("coordinator", {"academic_periods": Resp({"id": "p1"})}),
    ("professor", {"modules": Resp([{"id": "m1"}]), "enrollments": Resp([], count=1)}),
])
def test_quem_tem_acesso_lista_200(as_user, monkeypatch, role, extra):
    as_user(role)
    _use(monkeypatch, {"students": Resp(STUDENT), "medical_certificates": Resp([]), **extra})

    resp = client.get("/api/students/s1/medical-certificates")
    assert resp.status_code == 200
    assert resp.json() == []


def test_aluno_inexistente_404(as_user, monkeypatch):
    as_user("coordinator")
    _use(monkeypatch, {"students": Resp(None)})
    assert client.get("/api/students/s1/medical-certificates").status_code == 404


@pytest.mark.parametrize("content_type,content", [
    ("text/plain", PDF),                    # content-type errado
    ("application/pdf", b"MZ nao e pdf"),   # cabeçalho %PDF- ausente
])
def test_upload_recusa_o_que_nao_e_pdf(as_user, monkeypatch, content_type, content):
    as_user("admin")
    db = _use(monkeypatch, {"medical_certificates": Resp(CERT)})

    resp = client.post(
        "/api/medical-certificates/c1/attachments",
        files={"file": ("a.pdf", content, content_type)},
    )
    assert resp.status_code == 415
    assert not db.writes
