"""Testes do serviço de geração de PDFs."""
from app.services.reports import (
    PeriodReportData,
    PeriodReportRow,
    StudentModuleLine,
    StudentReportData,
    build_period_report_pdf,
    build_student_report_pdf,
)


def _sample_modules() -> list[StudentModuleLine]:
    return [
        StudentModuleLine(
            module_code="MAT01",
            module_name="Matemática Básica",
            tutor_grade=8.0,
            regular_exam_grade=8.5,
            makeup_exam_grade=0.0,
            final_grade=8.5,
            absences=2,
            max_absences=10,
        ),
        StudentModuleLine(
            module_code="POR01",
            module_name="Português Aplicado",
            tutor_grade=6.0,
            regular_exam_grade=4.0,
            makeup_exam_grade=6.5,
            final_grade=6.5,
            absences=4,
            max_absences=10,
        ),
        StudentModuleLine(
            module_code="HIST01",
            module_name="História do Brasil",
            tutor_grade=3.0,
            regular_exam_grade=3.5,
            makeup_exam_grade=0.0,
            final_grade=3.5,
            absences=12,
            max_absences=10,
        ),
    ]


class TestStudentModuleLine:
    def test_status_aprovado(self):
        m = _sample_modules()[0]
        assert m.status == "Aprovado"

    def test_status_recuperacao(self):
        m = _sample_modules()[1]
        assert m.status == "Recuperação"

    def test_status_reprovado_por_faltas(self):
        m = _sample_modules()[2]
        assert m.status == "Rep. faltas"

    def test_status_reprovado_por_nota(self):
        m = StudentModuleLine(
            module_code="X",
            module_name="X",
            tutor_grade=0,
            regular_exam_grade=2,
            makeup_exam_grade=0,
            final_grade=2,
            absences=0,
            max_absences=10,
        )
        assert m.status == "Reprovado"


class TestStudentReportData:
    def test_media_geral(self):
        d = StudentReportData(
            student_number="2024001",
            full_name="João Silva",
            email="joao@x.com",
            period_name="2026.1",
            medical_certificates=1,
            modules=_sample_modules(),
        )
        # (8.5 + 6.5 + 3.5) / 3 = 6.166...
        assert round(d.avg_final_grade, 2) == 6.17

    def test_total_faltas(self):
        d = StudentReportData(
            student_number="2024001",
            full_name="João Silva",
            email=None,
            period_name="2026.1",
            medical_certificates=0,
            modules=_sample_modules(),
        )
        assert d.total_absences == 18

    def test_sem_modulos_zera_media(self):
        d = StudentReportData(
            student_number="2024001",
            full_name="Aluno Sem Módulos",
            email=None,
            period_name="2026.1",
            medical_certificates=0,
            modules=[],
        )
        assert d.avg_final_grade == 0.0
        assert d.total_absences == 0


class TestBuildStudentReportPdf:
    def test_gera_pdf_bytes_validos(self):
        d = StudentReportData(
            student_number="2024001",
            full_name="João Silva",
            email="joao@x.com",
            period_name="2026.1",
            medical_certificates=1,
            modules=_sample_modules(),
        )
        pdf = build_student_report_pdf(d)
        assert isinstance(pdf, bytes)
        assert pdf.startswith(b"%PDF-")
        assert len(pdf) > 1000  # PDF mínimo razoável

    def test_gera_pdf_sem_modulos(self):
        d = StudentReportData(
            student_number="2024001",
            full_name="Aluno Vazio",
            email=None,
            period_name="2026.1",
            medical_certificates=0,
            modules=[],
        )
        pdf = build_student_report_pdf(d)
        assert pdf.startswith(b"%PDF-")


class TestPeriodReport:
    def _rows(self) -> list[PeriodReportRow]:
        return [
            PeriodReportRow(
                student_number="001",
                full_name="Aluno A",
                avg_final_grade=8.0,
                total_absences=2,
                modules_approved=3,
                modules_recovery=0,
                modules_failed=0,
            ),
            PeriodReportRow(
                student_number="002",
                full_name="Aluno B",
                avg_final_grade=5.5,
                total_absences=5,
                modules_approved=1,
                modules_recovery=2,
                modules_failed=0,
            ),
            PeriodReportRow(
                student_number="003",
                full_name="Aluno C",
                avg_final_grade=3.0,
                total_absences=15,
                modules_approved=0,
                modules_recovery=0,
                modules_failed=3,
            ),
        ]

    def test_status_aluno(self):
        rows = self._rows()
        assert rows[0].overall_status == "Aprovado"
        assert rows[1].overall_status == "Recuperação"
        assert rows[2].overall_status == "Reprovado"

    def test_contagens_agregadas(self):
        d = PeriodReportData(
            period_name="2026.1",
            coordinator_name="Maria",
            rows=self._rows(),
        )
        assert d.total_students == 3
        assert d.total_approved == 1
        assert d.total_recovery == 1
        assert d.total_failed == 1

    def test_gera_pdf_periodo(self):
        d = PeriodReportData(
            period_name="2026.1",
            coordinator_name="Maria",
            rows=self._rows(),
        )
        pdf = build_period_report_pdf(d)
        assert pdf.startswith(b"%PDF-")
        assert len(pdf) > 1000

    def test_gera_pdf_periodo_vazio(self):
        d = PeriodReportData(
            period_name="2026.1",
            coordinator_name=None,
            rows=[],
        )
        pdf = build_period_report_pdf(d)
        assert pdf.startswith(b"%PDF-")
