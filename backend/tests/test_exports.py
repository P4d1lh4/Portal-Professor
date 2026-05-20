"""Testes do serviço de exportação CSV."""
from app.services.exports import (
    GradeExportRow,
    StudentExportRow,
    build_grades_csv,
    build_students_csv,
    classify,
)


def _decode(content: bytes) -> str:
    """Remove o BOM UTF-8 e devolve string para inspeção."""
    assert content[:3] == b"\xef\xbb\xbf"
    return content[3:].decode("utf-8")


class TestClassify:
    def test_aprovado(self):
        assert classify(7.5, 2, 10) == "Aprovado"

    def test_recuperacao(self):
        assert classify(5.5, 2, 10) == "Recuperação"

    def test_reprovado_por_nota(self):
        assert classify(3.0, 2, 10) == "Reprovado"

    def test_reprovado_por_faltas(self):
        # Mesmo com nota alta, excesso de faltas reprova
        assert classify(9.0, 11, 10) == "Rep. faltas"


class TestBuildStudentsCsv:
    def test_csv_com_cabecalho_e_linha(self):
        rows = [
            StudentExportRow(
                student_number="2024001",
                full_name="João Silva",
                email="joao@x.com",
                enrollment_date="2026-02-01",
                is_active=True,
                medical_certificates=2,
                referral_info=None,
                observations="aluno bolsista",
            ),
        ]
        out = _decode(build_students_csv(rows))
        lines = out.splitlines()
        assert "Matrícula" in lines[0]
        assert "2024001" in lines[1]
        assert "João Silva" in lines[1]
        assert "sim" in lines[1]
        assert "aluno bolsista" in lines[1]

    def test_separador_brasileiro(self):
        rows = [
            StudentExportRow(
                student_number="A",
                full_name="B",
                email=None,
                enrollment_date="2026-01-01",
                is_active=False,
                medical_certificates=0,
                referral_info=None,
                observations=None,
            ),
        ]
        out = _decode(build_students_csv(rows))
        # Separador é ; (padrão Excel BR)
        assert ";" in out.splitlines()[1]
        # Booleano vira "não" quando is_active=False
        assert "não" in out.splitlines()[1]


class TestBuildGradesCsv:
    def test_virgula_decimal_e_status(self):
        rows = [
            GradeExportRow(
                student_number="2024001",
                full_name="João",
                tutor_grade=8.5,
                regular_exam_grade=7.0,
                makeup_exam_grade=0.0,
                final_grade=7.0,
                absences=2,
                max_absences=10,
                status="Aprovado",
            ),
        ]
        out = _decode(build_grades_csv(rows))
        line = out.splitlines()[1]
        # Vírgula como separador decimal (pt-BR)
        assert "8,50" in line
        assert "7,00" in line
        assert "Aprovado" in line

    def test_lista_vazia_so_cabecalho(self):
        out = _decode(build_grades_csv([]))
        lines = out.splitlines()
        assert len(lines) == 1
        assert "Matrícula" in lines[0]
        assert "Status" in lines[0]
