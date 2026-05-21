"""Testes da regra centralizada de classificação de situação."""
from app.services.classification import (
    Status,
    classify_label,
    classify_status,
)


class TestClassifyStatus:
    def test_reprovado_por_faltas_tem_prioridade(self):
        # mesmo com nota alta, excesso de faltas reprova
        assert classify_status(9.0, 11, 10) == Status.REP_FALTAS

    def test_aprovado(self):
        assert classify_status(7.0, 0, 10) == Status.APROVADO

    def test_recuperacao(self):
        assert classify_status(5.0, 0, 10) == Status.RECUPERACAO
        assert classify_status(6.99, 0, 10) == Status.RECUPERACAO

    def test_reprovado_por_nota(self):
        assert classify_status(4.99, 0, 10) == Status.REPROVADO


class TestClassifyLabel:
    def test_rotulos_pt(self):
        assert classify_label(9.0, 11, 10) == "Rep. faltas"
        assert classify_label(8.0, 0, 10) == "Aprovado"
        assert classify_label(5.5, 0, 10) == "Recuperação"
        assert classify_label(2.0, 0, 10) == "Reprovado"
