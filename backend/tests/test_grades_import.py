"""P-N9: import CSV de notas do módulo."""
import pytest
from fastapi.testclient import TestClient

import app.routers.import_csv as import_router
from app.main import app
from app.services.exports import GradeExportRow, build_grades_csv
from tests.fakes import FakeDb, Resp

client = TestClient(app)
URL = "/api/modules/m1/grades/import"

MODULE = {
    "id": "m1", "name": "Anatomia", "code": "ANA1", "professor_id": "prof-1",
    "max_absences": 10, "academic_period_id": "per1",
}
ENROLLMENTS = [
    {"id": "e1", "student": {"student_number": "2026001"},
     "grade": {"regular_exam_grade": 4.0, "makeup_exam_grade": 0.0}},
    {"id": "e2", "student": {"student_number": "2026002"},
     "grade": {"regular_exam_grade": 9.0, "makeup_exam_grade": 0.0}},
]


def _use(monkeypatch, *, ativo=True, **extra) -> FakeDb:
    # Uma linha de módulo serve às duas leituras: a permissão (professor_id,
    # período) e a trava de período encerrado (academic_period.is_active).
    db = FakeDb({
        "modules": Resp({**MODULE, "academic_period": {"is_active": ativo}}),
        "enrollments": Resp(ENROLLMENTS),
        **extra,
    })
    monkeypatch.setattr(import_router, "get_admin_db", lambda: db)
    return db


def _post(csv: bytes | str):
    body = csv.encode() if isinstance(csv, str) else csv
    return client.post(URL, files={"file": ("notas.csv", body, "text/csv")})


def _grades(db) -> dict:
    """enrollment_id -> patch gravado em grades, sem o last_updated (a hora)."""
    out = {}
    for q in db.queries:
        if q.table != "grades":
            continue
        calls = dict(q.calls)  # cada método aparece uma vez: update e eq
        out[calls["eq"][1]] = {k: v for k, v in calls["update"][0].items() if k != "last_updated"}
    return out


@pytest.mark.parametrize("role,uid,extra,esperado", [
    ("admin", None, {}, 200),
    ("professor", "prof-1", {}, 200),
    ("professor", "prof-2", {}, 403),
    ("coordinator", "coord-1", {"academic_periods": Resp({"id": "per1"})}, 200),
    ("coordinator", "coord-2", {"academic_periods": Resp(None)}, 403),
])
def test_permissao_de_quem_importa(as_user, monkeypatch, role, uid, extra, esperado):
    as_user(role, uid)
    db = _use(monkeypatch, **extra)

    resp = _post("student_number,regular_exam_grade\n2026001,8\n")

    assert resp.status_code == esperado
    assert bool(_grades(db)) == (esperado == 200)


def test_modulo_inexistente_404(as_user, monkeypatch):
    as_user("admin")
    _use(monkeypatch, modules=Resp(None))
    assert _post("student_number,regular_exam_grade\n2026001,8\n").status_code == 404


@pytest.mark.parametrize("role,uid,esperado", [("professor", "prof-1", 409), ("admin", None, 200)])
def test_periodo_encerrado_so_admin_importa(as_user, monkeypatch, role, uid, esperado):
    as_user(role, uid)
    db = _use(monkeypatch, ativo=False)

    assert _post("student_number,regular_exam_grade\n2026001,8\n").status_code == esperado
    assert bool(_grades(db)) == (esperado == 200)


def test_csv_do_export_volta_sem_edicao(as_user, monkeypatch):
    """Ida e volta: o CSV do export de notas (BOM, ';', vírgula decimal, acentos)."""
    as_user("professor", "prof-1")
    db = _use(monkeypatch)
    csv = build_grades_csv([GradeExportRow("2026001", "Ana", 7.0, 8.5, 0.0, 8.5, 2, 10, "Aprovado")])

    resp = _post(csv)

    assert resp.status_code == 200
    assert resp.json() == {"updated": 1, "not_found": [], "invalid": []}
    assert _grades(db) == {"e1": {
        "tutor_grade": 7.0, "regular_exam_grade": 8.5, "makeup_exam_grade": 0.0,
        "absences": 2, "final_grade": 8.5,
    }}
    # Casa só entre as matrículas deste módulo, por filtro direto na coluna.
    assert ("eq", ("module_id", "m1")) in db.calls("enrollments")


def test_celula_vazia_mantem_e_a_final_usa_a_nota_do_banco(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _use(monkeypatch)

    # 2026002 tem prova 9,0 no banco: a recuperação 7 não baixa a final, e a
    # tutoria em branco não entra no update.
    _post("student_number,tutor_grade,makeup_exam_grade\n2026002,,7\n")

    assert _grades(db) == {"e2": {"makeup_exam_grade": 7.0, "final_grade": 9.0}}


@pytest.mark.parametrize("coluna,valor", [
    ("regular_exam_grade", "11"),
    ("regular_exam_grade", "-0,5"),
    ("regular_exam_grade", "abc"),
    ("regular_exam_grade", "nan"),
    ("absences", "-1"),
    ("absences", "2,5"),
])
def test_valor_invalido_vira_erro_da_linha_sem_gravar(as_user, monkeypatch, coluna, valor):
    as_user("professor", "prof-1")
    db = _use(monkeypatch)

    body = _post(f"student_number;{coluna}\n2026001;{valor}\n").json()

    assert body["updated"] == 0
    assert [i["line"] for i in body["invalid"]] == [2]
    assert not _grades(db)


def test_matricula_fora_do_modulo_e_repetida(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _use(monkeypatch)

    body = _post("student_number,regular_exam_grade\n2026001,8\n9999,5\n2026001,3\n").json()

    assert body["updated"] == 1
    assert body["not_found"] == ["9999"]
    assert [i["line"] for i in body["invalid"]] == [4]
    assert _grades(db) == {"e1": {"regular_exam_grade": 8.0, "final_grade": 8.0}}


def test_sem_coluna_de_matricula_422(as_user, monkeypatch):
    as_user("professor", "prof-1")
    _use(monkeypatch)

    resp = _post("Nome;Prova regular\nAna;8\n")

    assert resp.status_code == 422
    assert "Matrícula" in resp.text


def test_registra_um_resumo_na_auditoria(as_user, monkeypatch):
    as_user("professor", "prof-1")
    db = _use(monkeypatch)

    _post("student_number,regular_exam_grade\n2026001,8\n9999,5\n")

    [entry] = [w[2] for w in db.writes if w[0] == "audit_log"]
    assert (entry["entity"], entry["entity_id"]) == ("grades", "m1")
    assert entry["after_data"] == {"updated": 1, "not_found_count": 1, "invalid_count": 0}
