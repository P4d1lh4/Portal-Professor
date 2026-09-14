"""Cobertura da auditoria (P-Q3 / B-05): cada mutação relevante deixa rastro.

Antes só notas, módulos (update/delete), alunos (update/delete) e exclusão de
período eram auditados, e nenhuma criação gravava `insert`.
"""
from types import SimpleNamespace

from fastapi.testclient import TestClient

import app.routers.attendance as attendance_router
import app.routers.import_csv as import_router
import app.routers.medical_certificates as mc_router
import app.routers.modules as modules_router
import app.routers.periods as periods_router
import app.routers.sheets as sheets_router
import app.routers.students as students_router
import app.routers.users as users_router
from app.main import app
from tests.fakes import FakeDb, Resp

client = TestClient(app)

TS = "2026-01-01T00:00:00+00:00"
USER = {
    "id": "u1", "username": "prof", "full_name": "Prof", "email": "p@x.com",
    "role": "professor", "avatar_url": None, "is_active": True,
    "created_at": TS, "updated_at": TS,
}
PERIOD = {
    "id": "per1", "name": "2026.2", "coordinator_id": "coord-1", "start_date": None,
    "end_date": None, "is_active": True, "csv_sync_url": None, "csv_last_sync": None,
    "created_at": TS,
}
MODULE = {
    "id": "m1", "name": "Anatomia", "code": "ANA1", "professor_id": "prof-1",
    "academic_period_id": "per1", "credits": 4, "max_absences": 10,
    "is_active": True, "created_at": TS,
}
STUDENT = {
    "id": "s1", "student_number": "2026001", "full_name": "Ana", "email": None,
    "academic_period_id": "per1", "enrollment_date": "2026-02-01",
    "medical_certificates": 0, "referral_info": None, "observations": None,
    "is_active": True, "created_at": TS,
}
CERT = {
    "id": "c1", "student_id": "s1", "reason": "Gripe forte", "start_date": "2026-03-01",
    "end_date": "2026-03-03", "notes": "sigiloso", "created_by": "x",
    "created_at": TS, "updated_at": TS,
}
ATTACHMENT = {
    "id": "a1", "certificate_id": "c1", "file_name": "a.pdf", "file_size": 10,
    "mime_type": "application/pdf", "storage_path": "c1/x_a.pdf",
    "uploaded_at": TS, "uploaded_by": "x",
}
SHEET_URL = "https://docs.google.com/spreadsheets/d/abc/export?format=csv"


def _use(monkeypatch, router, db):
    monkeypatch.setattr(router, "get_admin_db", lambda: db)
    return db


def _audit(db):
    return [w[2] for w in db.writes if w[0] == "audit_log"]


def _selects(*rows):
    """Resposta para tabela lida antes e depois da escrita (antes, depois...)."""
    it = iter(rows)
    return lambda q: Resp(next(it)) if q.op == "select" else Resp([])


# ─── Usuários ────────────────────────────────────────────────────────────────


def test_criar_usuario_registra_insert(as_user, monkeypatch):
    as_user("admin", "admin-1")
    db = _use(monkeypatch, users_router, FakeDb({
        "profiles": lambda q: Resp(None) if ("eq", ("username", "prof")) in q.calls else Resp(USER),
    }))
    novo = SimpleNamespace(user=SimpleNamespace(id="u1"))
    auth = SimpleNamespace(admin=SimpleNamespace(create_user=lambda _payload: novo))
    monkeypatch.setattr(users_router, "create_client", lambda *a, **k: SimpleNamespace(auth=auth))

    resp = client.post("/api/users", json={
        "email": "p@x.com", "password": "senha-forte-1",
        "username": "prof", "full_name": "Prof", "role": "professor",
    })

    assert resp.status_code == 201
    [entry] = _audit(db)
    assert (entry["action"], entry["entity"], entry["entity_id"]) == ("insert", "users", "u1")
    assert entry["after_data"]["role"] == "professor"


def test_mudar_papel_registra_antes_e_depois(as_user, monkeypatch):
    as_user("admin", "admin-1")
    db = _use(monkeypatch, users_router, FakeDb({
        "profiles": _selects(USER, {**USER, "role": "coordinator"}),
    }))

    assert client.put("/api/users/u1", json={"role": "coordinator"}).status_code == 200

    [entry] = _audit(db)
    assert entry["summary"] == "Papel alterado: Prof (professor → coordinator)"
    assert (entry["before_data"], entry["after_data"]) == (
        {"role": "professor"}, {"role": "coordinator"},
    )


def test_desativar_e_reativar_registram_is_active(as_user, monkeypatch):
    as_user("admin", "admin-1")
    off_db = _use(monkeypatch, users_router, FakeDb({"profiles": Resp(USER)}))
    assert client.delete("/api/users/u1").status_code == 204

    on_db = _use(monkeypatch, users_router, FakeDb({"profiles": Resp({**USER, "is_active": False})}))
    assert client.post("/api/users/u1/reactivate").status_code == 200

    [off] = _audit(off_db)
    [on] = _audit(on_db)
    assert (off["before_data"], off["after_data"]) == ({"is_active": True}, {"is_active": False})
    assert (on["before_data"], on["after_data"]) == ({"is_active": False}, {"is_active": True})


# ─── Atestados (dado de saúde) ───────────────────────────────────────────────


def _storage():
    bucket = SimpleNamespace(
        upload=lambda **_k: None,
        remove=lambda _paths: None,
        create_signed_url=lambda _path, _ttl: {"signedURL": ""},
    )
    return SimpleNamespace(from_=lambda _bucket: bucket)


def test_atestado_criado_editado_e_excluido_sem_motivo_no_log(as_user, monkeypatch):
    as_user("admin")
    db = FakeDb({
        "medical_certificates": Resp(CERT),
        "medical_certificates.insert": Resp([CERT]),
        "medical_certificate_attachments": Resp([]),
    })
    db.storage = _storage()
    _use(monkeypatch, mc_router, db)

    body = {"reason": "Gripe forte", "start_date": "2026-03-01", "end_date": "2026-03-03"}
    assert client.post("/api/students/s1/medical-certificates", json=body).status_code == 201
    assert client.put("/api/medical-certificates/c1", json={"reason": "Outra"}).status_code == 200
    assert client.delete("/api/medical-certificates/c1").status_code == 204

    entries = _audit(db)
    assert [(e["action"], e["entity"]) for e in entries] == [
        ("insert", "medical_certificates"),
        ("update", "medical_certificates"),
        ("delete", "medical_certificates"),
    ]
    assert entries[1]["summary"] == "Atestado alterado (motivo/observação)"
    for texto in ("Gripe", "Outra", "sigiloso"):
        assert texto not in str(entries)


def test_anexo_enviado_e_removido(as_user, monkeypatch):
    as_user("admin")
    db = FakeDb({
        "medical_certificates": Resp(CERT),
        "medical_certificate_attachments": Resp(ATTACHMENT),
        "medical_certificate_attachments.insert": Resp([ATTACHMENT]),
    })
    db.storage = _storage()
    _use(monkeypatch, mc_router, db)

    pdf = {"file": ("a.pdf", b"%PDF-1.4 x", "application/pdf")}
    assert client.post("/api/medical-certificates/c1/attachments", files=pdf).status_code == 201
    assert client.delete("/api/medical-certificates/c1/attachments/a1").status_code == 204

    assert [(e["action"], e["entity"], e["entity_id"]) for e in _audit(db)] == [
        ("insert", "medical_certificate_attachments", "a1"),
        ("delete", "medical_certificate_attachments", "a1"),
    ]


# ─── Chamada, planilha e import ──────────────────────────────────────────────


def test_excluir_chamada_guarda_as_marcacoes(as_user, monkeypatch):
    as_user("admin")
    db = _use(monkeypatch, attendance_router, FakeDb({
        "modules": Resp({"id": "m1", "professor_id": "p1", "academic_period_id": "per1"}),
        "attendance_records": Resp({"id": "r1", "notes": "Aula 3"}),
        "attendance_entries": Resp([
            {"enrollment_id": "e1", "status": "absent"},
            {"enrollment_id": "e2", "status": "present"},
        ]),
    }))

    assert client.delete("/api/modules/m1/attendance/2026-09-14").status_code == 204

    [entry] = _audit(db)
    assert (entry["action"], entry["entity"], entry["entity_id"]) == ("delete", "attendance", "r1")
    assert entry["summary"] == "Chamada excluída (14/09/2026)"
    assert entry["before_data"]["entries"] == {"e1": "absent", "e2": "present"}


def test_sync_de_planilha_registra_um_resumo(as_user, monkeypatch):
    as_user("admin", "admin-1")
    db = _use(monkeypatch, sheets_router, FakeDb({
        "academic_periods": Resp({**PERIOD, "csv_sync_url": SHEET_URL}),
    }))

    async def _csv(_url):
        return b"student_number,regular_exam_grade\n123,8\n"

    monkeypatch.setattr(sheets_router, "_fetch_csv", _csv)

    assert client.post("/api/periods/per1/sync-sheets").status_code == 200
    [entry] = _audit(db)
    assert (entry["entity"], entry["entity_id"]) == ("sheets", "per1")
    assert entry["after_data"] == {"updated": 0, "not_found_count": 1}


def test_trocar_url_da_planilha_registra_e_repetir_nao(as_user, monkeypatch):
    as_user("admin", "admin-1")
    novo = "https://docs.google.com/spreadsheets/d/xyz/export?format=csv"
    db = _use(monkeypatch, sheets_router, FakeDb({
        "academic_periods": Resp({**PERIOD, "csv_sync_url": SHEET_URL}),
    }))

    assert client.put("/api/periods/per1/sync-url", json={"csv_sync_url": novo}).status_code == 200
    assert client.put("/api/periods/per1/sync-url", json={"csv_sync_url": SHEET_URL}).status_code == 200

    [entry] = _audit(db)
    assert (entry["before_data"], entry["after_data"]) == (
        {"csv_sync_url": SHEET_URL}, {"csv_sync_url": novo},
    )


def test_import_registra_resumo_e_preview_nao(as_user, monkeypatch):
    as_user("coordinator", "coord-1")
    db = _use(monkeypatch, import_router, FakeDb(
        {
            "academic_periods": Resp({"id": "per1", "coordinator_id": "coord-1"}),
            "students": Resp([]),
            "modules": Resp([]),
        },
        rpc={"create_student_with_enrollments": Resp("s-novo")},
    ))
    csv_file = {"file": ("a.csv", b"student_number,full_name,enrollment_date\n1,Ana,2024-02-01\n", "text/csv")}

    assert client.post("/api/periods/per1/students/import?dry_run=true", files=csv_file).status_code == 200
    assert not _audit(db)

    assert client.post("/api/periods/per1/students/import?dry_run=false", files=csv_file).status_code == 200
    [entry] = _audit(db)
    assert (entry["action"], entry["entity"], entry["entity_id"]) == ("insert", "students", "per1")
    assert entry["after_data"] == {"imported": 1, "invalid_count": 0}


# ─── Criações e encerramento de período ──────────────────────────────────────


def test_criar_periodo_registra_insert(as_user, monkeypatch):
    as_user("admin", "admin-1")

    def periods(q):
        if q.op == "insert":
            return Resp([PERIOD])
        return Resp(None) if ("eq", ("name", "2026.2")) in q.calls else Resp(PERIOD)

    db = _use(monkeypatch, periods_router, FakeDb({"academic_periods": periods}))

    resp = client.post("/api/periods", json={"name": "2026.2", "coordinator_id": "coord-1"})

    assert resp.status_code == 201
    [entry] = _audit(db)
    assert (entry["action"], entry["entity"], entry["entity_id"]) == ("insert", "periods", "per1")


def test_encerrar_periodo_registra(as_user, monkeypatch):
    as_user("admin", "admin-1")
    db = _use(monkeypatch, periods_router, FakeDb({
        "academic_periods": _selects(PERIOD, {**PERIOD, "is_active": False}),
    }))

    assert client.put("/api/periods/per1", json={"is_active": False}).status_code == 200

    [entry] = _audit(db)
    assert entry["summary"] == "Período encerrado: 2026.2"
    assert (entry["before_data"], entry["after_data"]) == ({"is_active": True}, {"is_active": False})


def test_criar_modulo_registra_insert(as_user, monkeypatch):
    as_user("admin", "admin-1")

    def modules(q):
        if q.op == "insert":
            return Resp([MODULE])
        return Resp(None) if ("eq", ("code", "ANA1")) in q.calls else Resp(MODULE)

    db = _use(monkeypatch, modules_router, FakeDb({
        "modules": modules,
        "profiles": Resp({"id": "prof-1", "role": "professor"}),
    }))

    resp = client.post("/api/modules", json={
        "name": "Anatomia", "code": "ANA1",
        "professor_id": "prof-1", "academic_period_id": "per1",
    })

    assert resp.status_code == 201
    [entry] = _audit(db)
    assert (entry["action"], entry["entity"], entry["entity_id"]) == ("insert", "modules", "m1")


def test_criar_aluno_registra_insert_nas_duas_rotas(as_user, monkeypatch):
    novo = {"student_number": "2026001", "full_name": "Ana", "enrollment_date": "2026-02-01"}

    as_user("coordinator", "coord-1")
    coord_db = _use(monkeypatch, students_router, FakeDb({
        "academic_periods": Resp({"id": "per1"}),
        "students": lambda q: Resp([STUDENT]) if q.op == "insert" else Resp(None),
    }))
    assert client.post("/api/periods/per1/students", json=novo).status_code == 201

    as_user("professor", "prof-1")
    prof_db = _use(monkeypatch, students_router, FakeDb(
        {
            "modules": Resp([{"id": "m1", "academic_period_id": "per1"}]),
            "students": lambda q: (
                Resp(None) if ("eq", ("student_number", "2026001")) in q.calls else Resp(STUDENT)
            ),
        },
        rpc={"create_student_with_enrollments": Resp("s1")},
    ))
    assert client.post("/api/professor/students", json=novo).status_code == 201

    for db in (coord_db, prof_db):
        [entry] = _audit(db)
        assert (entry["action"], entry["entity"], entry["entity_id"]) == ("insert", "students", "s1")
