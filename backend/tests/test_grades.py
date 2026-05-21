"""Testes unitários das funções de cálculo de notas."""
from app.services.grades import recalc_final


class TestRecalcFinal:
    def test_sem_recuperacao_usa_prova_regular(self):
        assert recalc_final(regular=6.0, makeup=0.0) == 6.0

    def test_recuperacao_maior_usa_recuperacao(self):
        assert recalc_final(regular=5.0, makeup=7.5) == 7.5

    def test_recuperacao_menor_usa_regular(self):
        # se fez recuperação mas tirou menos, prevalece a regular
        assert recalc_final(regular=8.0, makeup=6.0) == 8.0

    def test_recuperacao_igual_usa_regular(self):
        assert recalc_final(regular=7.0, makeup=7.0) == 7.0

    def test_arredonda_duas_casas(self):
        assert recalc_final(regular=6.666, makeup=0.0) == 6.67

    def test_zero_makeup_zero_regular(self):
        assert recalc_final(regular=0.0, makeup=0.0) == 0.0

    def test_nota_maxima(self):
        assert recalc_final(regular=10.0, makeup=0.0) == 10.0
