"""Export CSV de frequência do módulo (P-Q4)."""
import pytest
from fastapi.testclient import TestClient

import app.routers.exports as exports_router
from app.main import app
from app.services.exports import AttendanceExportRow, build_attendance_csv
from tests.fakes import FakeDb, Resp

client = TestClient(app)

MODULE = {
    "id": "m1", "name": "Anatomia", "code": "ANA1", "professor_id": "prof-1",
    "max_absences": 10, "academic_period_id": "p1",
}


def _decode(content: bytes) -> list[str]:
    assert content[:3] == b"\xef\xbb\xbf"  # BOM: o Excel pt-BR abre sem mojibake
    return content[3:].decode("utf-8").splitlines()


def test_matriz_uma_coluna_por_dia_com_totais():
    lines = _decode(build_attendance_csv(
        ["2026-03-02", "2026-03-04"],
        [
            AttendanceExportRow("1", "Ana", ["present", "absent"]),
            AttendanceExportRow("2", "=HYPERLINK(x)", ["justified", None]),
        ],
    ))

    assert lines == [
        "Matrícula;Nome;02/03/2026;04/03/2026;Faltas na chamada;Justificadas",
        "1;Ana;P;F;1;0",
        "2;'=HYPERLINK(x);J;;0;1",  # sem marcação fica vazio; fórmula neutralizada
    ]


def test_sem_chamadas_sai_so_com_os_alunos():
    lines = _decode(build_attendance_csv([], [AttendanceExportRow("1", "Ana", [])]))
    assert lines == ["Matrícula;Nome;Faltas na chamada;Justificadas", "1;Ana;0;0"]


def _setup(monkeypatch, *, module=MODULE, owner=True):
    db = FakeDb({
        "modules": Resp(module),
        "academic_periods": Resp({"id": "p1"} if owner else None),
        "attendance_records": Resp([
            {"id": "r1", "attendance_date": "2026-03-02"},
            {"id": "r2", "attendance_date": "2026-03-04"},
        ]),
        "attendance_entries": Resp([
            {"attendance_record_id": "r1", "enrollment_id": "e1", "status": "present"},
            {"attendance_record_id": "r2", "enrollment_id": "e1", "status": "absent"},
            {"attendance_record_id": "r1", "enrollment_id": "e2", "status": "absent"},
        ]),
        "enrollments": Resp([
            {"id": "e1", "student": {"student_number": "1", "full_name": "Ana"}},
            {"id": "e2", "student": {"student_number": "2", "full_name": "Bia"}},
        ]),
    })
    monkeypatch.setattr(exports_router, "get_admin_db", lambda: db)
    return db


def test_professor_do_modulo_baixa_a_frequencia(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _setup(monkeypatch)

    resp = client.get("/api/modules/m1/attendance.csv")

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert 'filename="frequencia-ana1.csv"' in resp.headers["content-disposition"]
    assert _decode(resp.content)[1:] == ["1;Ana;P;F;1;0", "2;Bia;F;;1;0"]
    assert ("in_", ("attendance_record_id", ["r1", "r2"])) in db.calls("attendance_entries")


@pytest.mark.parametrize("role, uid, owner, esperado", [
    ("professor", "prof-2", True, 403),       # não leciona o módulo
    ("coordinator", "coord-2", False, 403),   # não coordena o período
    ("coordinator", "coord-1", True, 200),
    ("admin", None, False, 200),
])
def test_permissao_igual_ao_export_de_notas(as_user, monkeypatch, role, uid, owner, esperado):
    as_user(role, uid)
    _setup(monkeypatch, owner=owner)
    assert client.get("/api/modules/m1/attendance.csv").status_code == esperado


def test_modulo_inexistente_404(as_user, monkeypatch):
    as_user("admin")
    _setup(monkeypatch, module=None)
    assert client.get("/api/modules/m1/attendance.csv").status_code == 404
