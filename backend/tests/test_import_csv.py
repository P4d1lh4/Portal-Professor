"""Testes do parser e validador de CSV para importação de alunos."""
import pytest
from app.routers.import_csv import _parse_csv, _validate_row


class TestParseCsv:
    def test_csv_basico(self):
        content = b"student_number,full_name,enrollment_date\n2024001,Ana Silva,2024-02-01\n"
        rows, err = _parse_csv(content)
        assert err is None
        assert len(rows) == 1
        assert rows[0]["student_number"] == "2024001"
        assert rows[0]["full_name"] == "Ana Silva"

    def test_csv_com_bom(self):
        content = "student_number,full_name,enrollment_date\n2024001,Ana,2024-02-01\n".encode("utf-8-sig")
        rows, err = _parse_csv(content)
        assert err is None
        assert len(rows) == 1
        assert rows[0]["student_number"] == "2024001"

    def test_csv_semicolon_delimiter(self):
        content = b"student_number;full_name;enrollment_date\n2024001;Bruno;2024-02-01\n"
        rows, err = _parse_csv(content)
        assert err is None
        assert rows[0]["student_number"] == "2024001"

    def test_csv_sem_coluna_obrigatoria(self):
        content = b"full_name,enrollment_date\nAna,2024-02-01\n"
        rows, err = _parse_csv(content)
        assert err is not None
        assert "student_number" in err

    def test_csv_vazio(self):
        content = b""
        rows, err = _parse_csv(content)
        assert err is not None

    def test_csv_latin1(self):
        content = "student_number,full_name,enrollment_date\n2024001,José,2024-02-01\n".encode("latin-1")
        rows, err = _parse_csv(content)
        assert err is None
        assert "Jos" in rows[0]["full_name"]


class TestValidateRow:
    def test_linha_valida(self):
        raw = {"student_number": "2024001", "full_name": "Ana Silva", "enrollment_date": "2024-02-01"}
        data, err = _validate_row(raw, idx=2)
        assert err is None
        assert data["student_number"] == "2024001"

    def test_matricula_vazia(self):
        raw = {"student_number": "", "full_name": "Ana", "enrollment_date": "2024-02-01"}
        data, err = _validate_row(raw, idx=2)
        assert err is not None
        assert data is None

    def test_nome_vazio(self):
        raw = {"student_number": "2024001", "full_name": "", "enrollment_date": "2024-02-01"}
        data, err = _validate_row(raw, idx=3)
        assert err is not None

    def test_data_vazia(self):
        raw = {"student_number": "2024001", "full_name": "Ana", "enrollment_date": ""}
        data, err = _validate_row(raw, idx=4)
        assert err is not None

    def test_inclui_email_opcional(self):
        raw = {
            "student_number": "2024001",
            "full_name": "Ana",
            "enrollment_date": "2024-02-01",
            "email": "ana@example.com",
        }
        data, err = _validate_row(raw, idx=2)
        assert err is None
        assert data["email"] == "ana@example.com"

    def test_medical_certificates_inteiro(self):
        raw = {
            "student_number": "2024001",
            "full_name": "Ana",
            "enrollment_date": "2024-02-01",
            "medical_certificates": "3",
        }
        data, err = _validate_row(raw, idx=2)
        assert err is None
        assert data["medical_certificates"] == 3

    def test_medical_certificates_invalido_ignorado(self):
        raw = {
            "student_number": "2024001",
            "full_name": "Ana",
            "enrollment_date": "2024-02-01",
            "medical_certificates": "abc",
        }
        data, err = _validate_row(raw, idx=2)
        assert err is None
        assert "medical_certificates" not in data
