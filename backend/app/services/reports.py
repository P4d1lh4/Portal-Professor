"""Geração de PDFs: boletim individual do aluno e relatório consolidado do período."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from io import BytesIO
from typing import Iterable

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


# ---------------------------------------------------------------
# Dataclasses de entrada — desacoplam o renderer dos schemas/banco
# ---------------------------------------------------------------

@dataclass
class StudentModuleLine:
    module_code: str
    module_name: str
    tutor_grade: float
    regular_exam_grade: float
    makeup_exam_grade: float
    final_grade: float
    absences: int
    max_absences: int

    @property
    def status(self) -> str:
        if self.absences > self.max_absences:
            return "Rep. faltas"
        if self.final_grade >= 7:
            return "Aprovado"
        if self.final_grade >= 5:
            return "Recuperação"
        return "Reprovado"


@dataclass
class StudentReportData:
    student_number: str
    full_name: str
    email: str | None
    period_name: str
    medical_certificates: int
    modules: list[StudentModuleLine]

    @property
    def avg_final_grade(self) -> float:
        if not self.modules:
            return 0.0
        return sum(m.final_grade for m in self.modules) / len(self.modules)

    @property
    def total_absences(self) -> int:
        return sum(m.absences for m in self.modules)


@dataclass
class PeriodReportRow:
    student_number: str
    full_name: str
    avg_final_grade: float
    total_absences: int
    modules_approved: int
    modules_failed: int
    modules_recovery: int

    @property
    def overall_status(self) -> str:
        if self.modules_failed > 0:
            return "Reprovado"
        if self.modules_recovery > 0:
            return "Recuperação"
        return "Aprovado"


@dataclass
class PeriodReportData:
    period_name: str
    coordinator_name: str | None
    rows: list[PeriodReportRow]

    @property
    def total_students(self) -> int:
        return len(self.rows)

    @property
    def total_approved(self) -> int:
        return sum(1 for r in self.rows if r.overall_status == "Aprovado")

    @property
    def total_recovery(self) -> int:
        return sum(1 for r in self.rows if r.overall_status == "Recuperação")

    @property
    def total_failed(self) -> int:
        return sum(1 for r in self.rows if r.overall_status == "Reprovado")


# ---------------------------------------------------------------
# Estilos compartilhados
# ---------------------------------------------------------------

_BASE_STYLES = getSampleStyleSheet()

_TITLE_STYLE = ParagraphStyle(
    "ReportTitle",
    parent=_BASE_STYLES["Heading1"],
    fontSize=18,
    leading=22,
    alignment=1,  # center
    spaceAfter=4,
)

_SUBTITLE_STYLE = ParagraphStyle(
    "ReportSubtitle",
    parent=_BASE_STYLES["Heading3"],
    fontSize=11,
    leading=14,
    alignment=1,
    spaceAfter=12,
    textColor=colors.HexColor("#525252"),
)

_LABEL_STYLE = ParagraphStyle(
    "Label",
    parent=_BASE_STYLES["Normal"],
    fontSize=9,
    textColor=colors.HexColor("#737373"),
)

_VALUE_STYLE = ParagraphStyle(
    "Value",
    parent=_BASE_STYLES["Normal"],
    fontSize=11,
    leading=14,
)

_FOOTER_STYLE = ParagraphStyle(
    "Footer",
    parent=_BASE_STYLES["Normal"],
    fontSize=8,
    textColor=colors.HexColor("#a3a3a3"),
    alignment=1,
)

_SECTION_STYLE = ParagraphStyle(
    "Section",
    parent=_BASE_STYLES["Heading4"],
    fontSize=11,
    textColor=colors.HexColor("#262626"),
    spaceBefore=10,
    spaceAfter=6,
)


def _fmt_grade(v: float) -> str:
    return f"{v:.1f}".replace(".", ",")


def _emitted_at() -> str:
    return datetime.now().strftime("%d/%m/%Y %H:%M")


# ---------------------------------------------------------------
# Boletim do aluno
# ---------------------------------------------------------------

def build_student_report_pdf(data: StudentReportData) -> bytes:
    """Gera um PDF em A4 com o boletim individual do aluno."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title=f"Boletim - {data.full_name}",
    )

    story: list = []
    story.append(Paragraph("Boletim Escolar", _TITLE_STYLE))
    story.append(Paragraph(data.period_name, _SUBTITLE_STYLE))

    # Cabeçalho do aluno
    header_data = [
        [Paragraph("Aluno", _LABEL_STYLE), Paragraph(data.full_name, _VALUE_STYLE)],
        [
            Paragraph("Matrícula", _LABEL_STYLE),
            Paragraph(data.student_number, _VALUE_STYLE),
        ],
    ]
    if data.email:
        header_data.append(
            [Paragraph("Email", _LABEL_STYLE), Paragraph(data.email, _VALUE_STYLE)]
        )
    header_data.append(
        [
            Paragraph("Atestados médicos", _LABEL_STYLE),
            Paragraph(str(data.medical_certificates), _VALUE_STYLE),
        ]
    )

    header_table = Table(header_data, colWidths=[40 * mm, 130 * mm])
    header_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    story.append(header_table)
    story.append(Spacer(1, 8 * mm))

    # Tabela de módulos
    story.append(Paragraph("Desempenho por módulo", _SECTION_STYLE))

    grades_header = ["Código", "Módulo", "Tut.", "Prova", "Recup.", "Final", "Faltas", "Status"]
    grades_rows = [grades_header]
    for m in data.modules:
        grades_rows.append(
            [
                m.module_code,
                m.module_name,
                _fmt_grade(m.tutor_grade),
                _fmt_grade(m.regular_exam_grade),
                _fmt_grade(m.makeup_exam_grade) if m.makeup_exam_grade > 0 else "—",
                _fmt_grade(m.final_grade),
                f"{m.absences}/{m.max_absences}",
                m.status,
            ]
        )

    grades_table = Table(
        grades_rows,
        colWidths=[20 * mm, 50 * mm, 14 * mm, 16 * mm, 18 * mm, 14 * mm, 16 * mm, 22 * mm],
        repeatRows=1,
    )
    grades_table.setStyle(_grades_table_style(len(grades_rows), data.modules))
    story.append(grades_table)

    # Resumo
    story.append(Spacer(1, 6 * mm))
    summary_data = [
        [
            Paragraph("Média geral", _LABEL_STYLE),
            Paragraph(_fmt_grade(data.avg_final_grade), _VALUE_STYLE),
            Paragraph("Total de faltas", _LABEL_STYLE),
            Paragraph(str(data.total_absences), _VALUE_STYLE),
        ],
    ]
    summary_table = Table(
        summary_data, colWidths=[35 * mm, 50 * mm, 35 * mm, 50 * mm]
    )
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f5f5f5")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e5e5")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e5e5")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(summary_table)

    # Rodapé
    story.append(Spacer(1, 14 * mm))
    story.append(
        Paragraph(
            f"Emitido em {_emitted_at()} · Documento gerado eletronicamente.",
            _FOOTER_STYLE,
        )
    )

    doc.build(story)
    return buf.getvalue()


def _grades_table_style(n_rows: int, modules: Iterable[StudentModuleLine]) -> TableStyle:
    style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#262626")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
            ("ALIGN", (0, 0), (1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e5e5")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d4d4d4")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    # Tinge as linhas de status: vermelho claro p/ reprovados, verde p/ aprovados
    for idx, m in enumerate(modules, start=1):
        if m.status.startswith("Rep") or m.status == "Reprovado":
            style.add("BACKGROUND", (7, idx), (7, idx), colors.HexColor("#fee2e2"))
            style.add("TEXTCOLOR", (7, idx), (7, idx), colors.HexColor("#991b1b"))
        elif m.status == "Recuperação":
            style.add("BACKGROUND", (7, idx), (7, idx), colors.HexColor("#fef3c7"))
            style.add("TEXTCOLOR", (7, idx), (7, idx), colors.HexColor("#92400e"))
        elif m.status == "Aprovado":
            style.add("BACKGROUND", (7, idx), (7, idx), colors.HexColor("#dcfce7"))
            style.add("TEXTCOLOR", (7, idx), (7, idx), colors.HexColor("#166534"))
    return style


# ---------------------------------------------------------------
# Relatório do período
# ---------------------------------------------------------------

def build_period_report_pdf(data: PeriodReportData) -> bytes:
    """Gera um PDF em A4 com o relatório consolidado do período."""
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=16 * mm,
        bottomMargin=14 * mm,
        title=f"Relatório - {data.period_name}",
    )

    story: list = []
    story.append(Paragraph("Relatório do Período", _TITLE_STYLE))
    subtitle = data.period_name
    if data.coordinator_name:
        subtitle += f" · Coordenador: {data.coordinator_name}"
    story.append(Paragraph(subtitle, _SUBTITLE_STYLE))

    # Resumo estatístico
    summary_rows = [
        ["Total de alunos", "Aprovados", "Em recuperação", "Reprovados"],
        [
            str(data.total_students),
            _pct(data.total_approved, data.total_students),
            _pct(data.total_recovery, data.total_students),
            _pct(data.total_failed, data.total_students),
        ],
    ]
    summary = Table(summary_rows, colWidths=[45 * mm] * 4)
    summary.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("FONTSIZE", (0, 1), (-1, 1), 14),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f5f5f5")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#525252")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e5e5e5")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e5e5")),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(summary)
    story.append(Spacer(1, 8 * mm))

    # Tabela de alunos
    story.append(Paragraph("Alunos", _SECTION_STYLE))

    header = ["Matrícula", "Aluno", "Média", "Faltas", "Aprov.", "Rec.", "Rep.", "Status"]
    rows = [header]
    for r in data.rows:
        rows.append(
            [
                r.student_number,
                r.full_name,
                _fmt_grade(r.avg_final_grade),
                str(r.total_absences),
                str(r.modules_approved),
                str(r.modules_recovery),
                str(r.modules_failed),
                r.overall_status,
            ]
        )

    if not data.rows:
        rows.append(["—", "Nenhum aluno cadastrado", "", "", "", "", "", ""])

    table = Table(
        rows,
        colWidths=[22 * mm, 60 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 14 * mm, 28 * mm],
        repeatRows=1,
    )
    table.setStyle(_period_table_style(data.rows))
    story.append(table)

    # Rodapé
    story.append(Spacer(1, 12 * mm))
    story.append(
        Paragraph(
            f"Emitido em {_emitted_at()} · Documento gerado eletronicamente.",
            _FOOTER_STYLE,
        )
    )

    doc.build(story)
    return buf.getvalue()


def _period_table_style(rows: list[PeriodReportRow]) -> TableStyle:
    style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#262626")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("ALIGN", (2, 0), (-1, -1), "CENTER"),
            ("ALIGN", (0, 0), (1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e5e5")),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#d4d4d4")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]
    )
    for idx, r in enumerate(rows, start=1):
        if r.overall_status == "Reprovado":
            style.add("BACKGROUND", (7, idx), (7, idx), colors.HexColor("#fee2e2"))
            style.add("TEXTCOLOR", (7, idx), (7, idx), colors.HexColor("#991b1b"))
        elif r.overall_status == "Recuperação":
            style.add("BACKGROUND", (7, idx), (7, idx), colors.HexColor("#fef3c7"))
            style.add("TEXTCOLOR", (7, idx), (7, idx), colors.HexColor("#92400e"))
        else:
            style.add("BACKGROUND", (7, idx), (7, idx), colors.HexColor("#dcfce7"))
            style.add("TEXTCOLOR", (7, idx), (7, idx), colors.HexColor("#166534"))
    return style


def _pct(numerator: int, denominator: int) -> str:
    if denominator <= 0:
        return f"{numerator} (0%)"
    pct = round(100 * numerator / denominator)
    return f"{numerator} ({pct}%)"
