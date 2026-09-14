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


def risk_reasons(
    final_grade: float, absences: int, max_absences: int, *, graded: bool
) -> list[str]:
    """Motivos para agir antes do fechamento do período (P-N1).

    - "faltas": chegou a 80% do limite (ou passou dele) — o mesmo limiar em que
      a barra de faltas da UI fica vermelha;
    - "nota": já tem prova lançada e a final está abaixo de 5.

    `graded` evita o falso alarme do começo do período: sem prova lançada a
    final é 0, e a turma inteira apareceria em risco.
    """
    reasons = []
    # absences / max_absences >= 0.8, em inteiros (sem arredondamento de float)
    if absences > 0 and absences * 5 >= max_absences * 4:
        reasons.append("faltas")
    if graded and final_grade < 5:
        reasons.append("nota")
    return reasons
