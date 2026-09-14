"""Seção "Atenção" do relatório de período em PDF (P-N2).

Usa a mesma regra do card do professor (P-N1): faltas >= 80% do limite ou nota
< 5 com prova lançada, do mais urgente ao menos.
"""
from fastapi.testclient import TestClient

import app.routers.reports as reports_router
from app.main import app
from app.services.reports import AttentionLine, PeriodReportData, build_period_report_pdf
from tests.fakes import FakeDb, Resp

client = TestClient(app)


def _enr(student_id, code, absences, regular, final):
    return {
        "student_id": student_id,
        "module": {"code": code, "max_absences": 10},
        "grade": {"final_grade": final, "absences": absences,
                  "regular_exam_grade": regular, "makeup_exam_grade": 0},
    }


def test_relatorio_lista_quem_precisa_de_atencao(as_user, monkeypatch):
    as_user("admin")
    db = FakeDb({
        "academic_periods": Resp({"id": "p1", "name": "2026.1", "coordinator": None}),
        "students": Resp([
            {"id": "s1", "student_number": "1", "full_name": "Ana"},
            {"id": "s2", "student_number": "2", "full_name": "Bia"},
        ]),
        "enrollments": Resp([
            _enr("s1", "ANA1", 0, 4, 4),   # nota
            _enr("s1", "FIS1", 2, 8, 8),   # sem risco
            _enr("s2", "ANA1", 9, 7, 7),   # faltas: vem primeiro
            _enr("s2", "FIS1", 0, 0, 0),   # sem prova lançada: fora
        ]),
    })
    monkeypatch.setattr(reports_router, "get_admin_db", lambda: db)
    gerado: list[PeriodReportData] = []
    monkeypatch.setattr(
        reports_router, "build_period_report_pdf", lambda data: gerado.append(data) or b"%PDF-1.4"
    )

    assert client.get("/api/periods/p1/report").status_code == 200

    [data] = gerado
    assert [(a.full_name, a.module_code, a.absences, a.reasons) for a in data.attention] == [
        ("Bia", "ANA1", 9, ["faltas"]),
        ("Ana", "ANA1", 0, ["nota"]),
    ]
    # A seção não mexe no consolidado.
    assert [r.full_name for r in data.rows] == ["Ana", "Bia"]


def test_pdf_sai_com_e_sem_alunos_em_atencao():
    base = {"period_name": "2026.1", "coordinator_name": None, "rows": []}
    linha = AttentionLine("1", "Ana", "ANA1", 9, 10, 4.0, ["faltas", "nota"])

    for data in (PeriodReportData(**base), PeriodReportData(**base, attention=[linha])):
        assert build_period_report_pdf(data).startswith(b"%PDF")
