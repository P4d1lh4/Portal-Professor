"""Geração de CSVs para download.

Padrão UTF-8 com BOM (BOM evita "mojibake" no Excel em pt-BR) e
separador `;` (padrão BR — Excel interpreta vírgula como decimal).
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from io import StringIO

from .classification import classify_label


# Excel-BR amigável: separador ; e BOM UTF-8
_DELIM = ";"
_BOM = "﻿"


@dataclass
class StudentExportRow:
    student_number: str
    full_name: str
    email: str | None
    enrollment_date: str
    is_active: bool
    medical_certificates: int
    referral_info: str | None
    observations: str | None


@dataclass
class GradeExportRow:
    student_number: str
    full_name: str
    tutor_grade: float
    regular_exam_grade: float
    makeup_exam_grade: float
    final_grade: float
    absences: int
    max_absences: int
    status: str


def _yes_no(v: bool) -> str:
    return "sim" if v else "não"


def _grade_str(v: float) -> str:
    # Vírgula decimal (pt-BR)
    return f"{v:.2f}".replace(".", ",")


def build_students_csv(rows: list[StudentExportRow]) -> bytes:
    buf = StringIO()
    buf.write(_BOM)
    writer = csv.writer(buf, delimiter=_DELIM, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(
        [
            "Matrícula",
            "Nome",
            "E-mail",
            "Data de matrícula",
            "Ativo",
            "Atestados médicos",
            "Encaminhamento",
            "Observações",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.student_number,
                r.full_name,
                r.email or "",
                r.enrollment_date,
                _yes_no(r.is_active),
                r.medical_certificates,
                r.referral_info or "",
                r.observations or "",
            ]
        )
    return buf.getvalue().encode("utf-8")


def build_grades_csv(rows: list[GradeExportRow]) -> bytes:
    buf = StringIO()
    buf.write(_BOM)
    writer = csv.writer(buf, delimiter=_DELIM, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(
        [
            "Matrícula",
            "Nome",
            "Tutoria",
            "Prova regular",
            "Recuperação",
            "Final",
            "Faltas",
            "Máx. faltas",
            "Status",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r.student_number,
                r.full_name,
                _grade_str(r.tutor_grade),
                _grade_str(r.regular_exam_grade),
                _grade_str(r.makeup_exam_grade),
                _grade_str(r.final_grade),
                r.absences,
                r.max_absences,
                r.status,
            ]
        )
    return buf.getvalue().encode("utf-8")


def classify(final_grade: float, absences: int, max_absences: int) -> str:
    """Rótulo PT da situação. Mantido como wrapper da regra centralizada."""
    return classify_label(final_grade, absences, max_absences)
