"""Regras de cálculo de notas, centralizadas para evitar divergência.

A nota final usa a regra: se houve prova de recuperação (makeup > 0), vale o
maior valor entre regular e recuperação; caso contrário, vale a regular.
"""


def recalc_final(regular: float, makeup: float) -> float:
    """Calcula a nota final a partir da regular e da recuperação."""
    if makeup > 0:
        return round(max(regular, makeup), 2)
    return round(regular, 2)
