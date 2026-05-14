"""Testes dos validators dos schemas Pydantic."""
import pytest
from app.schemas.grades import GradeUpdate


class TestGradeUpdateValidator:
    def test_clamp_nota_acima_de_10(self):
        g = GradeUpdate(tutor_grade=15.0)
        assert g.tutor_grade == 10.0

    def test_clamp_nota_abaixo_de_0(self):
        g = GradeUpdate(regular_exam_grade=-3.0)
        assert g.regular_exam_grade == 0.0

    def test_arredonda_duas_casas(self):
        g = GradeUpdate(makeup_exam_grade=7.546)
        assert g.makeup_exam_grade == 7.55

    def test_nota_none_permanece_none(self):
        g = GradeUpdate(tutor_grade=None)
        assert g.tutor_grade is None

    def test_nota_zero_valida(self):
        g = GradeUpdate(tutor_grade=0.0)
        assert g.tutor_grade == 0.0

    def test_nota_exata_10(self):
        g = GradeUpdate(regular_exam_grade=10.0)
        assert g.regular_exam_grade == 10.0

    def test_clamp_faltas_negativas(self):
        g = GradeUpdate(absences=-5)
        assert g.absences == 0

    def test_faltas_zero(self):
        g = GradeUpdate(absences=0)
        assert g.absences == 0

    def test_faltas_none(self):
        g = GradeUpdate(absences=None)
        assert g.absences is None

    def test_todos_campos_none(self):
        g = GradeUpdate()
        assert g.tutor_grade is None
        assert g.regular_exam_grade is None
        assert g.makeup_exam_grade is None
        assert g.absences is None
