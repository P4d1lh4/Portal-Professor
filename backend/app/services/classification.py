"""Classificação de situação do aluno num módulo (regra única de limiares).

Regra: reprovado por faltas tem prioridade; depois, final >= 7 aprova,
5 <= final < 7 é recuperação, e abaixo disso é reprovado por nota.

Os limiares ficam aqui em um só lugar; cada consumidor (exportação, relatório,
dashboard, frontend) mapeia o código canônico para a representação que precisa.
"""
from enum import Enum


class Status(str, Enum):
    REP_FALTAS = "rep_faltas"
    APROVADO = "aprovado"
    RECUPERACAO = "recuperacao"
    REPROVADO = "reprovado"


def classify_status(final_grade: float, absences: int, max_absences: int) -> Status:
    if absences > max_absences:
        return Status.REP_FALTAS
    if final_grade >= 7:
        return Status.APROVADO
    if final_grade >= 5:
        return Status.RECUPERACAO
    return Status.REPROVADO


STATUS_LABELS_PT: dict[Status, str] = {
    Status.REP_FALTAS: "Rep. faltas",
    Status.APROVADO: "Aprovado",
    Status.RECUPERACAO: "Recuperação",
    Status.REPROVADO: "Reprovado",
}


def classify_label(final_grade: float, absences: int, max_absences: int) -> str:
    """Rótulo em português (usado em exportações e telas)."""
    return STATUS_LABELS_PT[classify_status(final_grade, absences, max_absences)]
