"""Regra de situação única (P-06).

Todas as implementações do backend e o espelho do frontend
(`frontend/src/lib/classification.ts`) conferem a mesma tabela de casos,
`frontend/src/lib/classification.cases.json`. Mudar a regra num lado só quebra
o teste do outro.
"""
import json
from pathlib import Path

import pytest

from app.routers.reports import _classify
from app.services.classification import STATUS_LABELS_PT, Status, classify_status
from app.services.exports import classify
from app.services.reports import StudentModuleLine

CASES = json.loads(
    (Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "classification.cases.json")
    .read_text(encoding="utf-8")
)

# Código interno do relatório do período: as duas reprovações contam como "failed".
PERIOD_REPORT_CODE = {
    "aprovado": "approved",
    "recuperacao": "recovery",
    "reprovado": "failed",
    "rep_faltas": "failed",
}


@pytest.mark.parametrize(
    "case", CASES, ids=lambda c: f"final{c['final']}-faltas{c['absences']}de{c['max']}"
)
def test_todas_as_implementacoes_batem_na_tabela(case):
    final, absences, max_absences = case["final"], case["absences"], case["max"]
    label = STATUS_LABELS_PT[Status(case["status"])]

    assert classify_status(final, absences, max_absences).value == case["status"]
    assert classify(final, absences, max_absences) == label  # CSV de notas
    line = StudentModuleLine("C", "Módulo", 0, 0, 0, final, absences, max_absences)
    assert line.status == label  # boletim em PDF
    assert _classify(final, absences, max_absences) == PERIOD_REPORT_CODE[case["status"]]


def test_tabela_cobre_as_quatro_situacoes():
    assert {c["status"] for c in CASES} == {s.value for s in Status}
