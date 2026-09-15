"""Import de alunos aceita o CSV do próprio export (P-Q2).

O export grava cabeçalhos em pt-BR (Matrícula, Nome, Data de matrícula...) e o
import só aceitava snake_case: o CSV exportado não voltava.
"""
from datetime import date, timedelta

from app.routers.import_csv import _parse_csv, _validate_row
from app.services.exports import StudentExportRow, build_students_csv


def _valid(content: bytes) -> list[dict]:
    rows, fatal = _parse_csv(content)
    assert fatal is None, fatal
    out = []
    for idx, raw in enumerate(rows, start=2):
        data, err = _validate_row(raw, idx)
        assert err is None, err
        out.append(data)
    return out


def test_csv_do_export_volta_no_import():
    exported = build_students_csv([
        StudentExportRow(
            student_number="2026001", full_name="Ana Souza", email="ana@x.com",
            enrollment_date="2026-02-01", is_active=True, medical_certificates=2,
            referral_info="Psicopedagogia", observations="Chega às 8h",
        )
    ])

    [data] = _valid(exported)

    # "Atestados médicos" do export fica de fora (alteração 64), como "Ativo".
    assert data == {
        "student_number": "2026001",
        "full_name": "Ana Souza",
        "enrollment_date": "2026-02-01",
        "email": "ana@x.com",
        "referral_info": "Psicopedagogia",
        "observations": "Chega às 8h",
    }


def test_cabecalho_tecnico_continua_valendo():
    [data] = _valid(b"student_number,full_name,enrollment_date\n2026002,Bruno Lima,2026-02-01\n")
    assert data["student_number"] == "2026002"


def test_cabecalho_sem_acento_e_data_do_excel():
    [data] = _valid("Matricula;NOME;Data de matricula\n2026003;Caio;01/02/2026\n".encode("latin-1"))
    assert data["full_name"] == "Caio"
    assert data["enrollment_date"] == "2026-02-01"


def test_coluna_obrigatoria_ausente_diz_o_nome_em_portugues():
    rows, fatal = _parse_csv("Matrícula;Nome\n1;Ana\n".encode())
    assert rows == []
    assert "Data de matrícula (enrollment_date)" in fatal


def test_data_invalida_ou_futura_vira_erro_da_linha():
    futura = (date.today() + timedelta(days=30)).isoformat()
    rows, _ = _parse_csv(
        f"Matrícula;Nome;Data de matrícula\n1;Ana;31/02/2026\n2;Bia;{futura}\n".encode()
    )

    _, err_invalida = _validate_row(rows[0], 2)
    _, err_futura = _validate_row(rows[1], 3)
    assert "Linha 2: data de matrícula inválida" in err_invalida
    assert "Linha 3" in err_futura and "futura" in err_futura


def test_linha_com_colunas_a_mais_nao_quebra():
    rows, fatal = _parse_csv(b"student_number,full_name,enrollment_date\n1,Ana,2026-02-01,sobra\n")
    assert fatal is None
    assert rows[0]["full_name"] == "Ana"
