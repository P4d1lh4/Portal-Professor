"""Testes dos schemas e estruturas de attendance (chamada)."""
from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas.attendance import (
    AttendanceDayDraft,
    AttendanceEntryInput,
    AttendanceEntryWithStudent,
    AttendanceRecordSave,
    AttendanceSummary,
)


class TestAttendanceEntryInput:
    def test_status_default_present(self):
        e = AttendanceEntryInput(enrollment_id="enr-1")
        assert e.status == "present"
        assert e.notes is None

    def test_aceita_status_validos(self):
        for s in ("present", "absent", "justified"):
            e = AttendanceEntryInput(enrollment_id="x", status=s)
            assert e.status == s

    def test_rejeita_status_invalido(self):
        with pytest.raises(ValidationError):
            AttendanceEntryInput(enrollment_id="x", status="late")


class TestAttendanceRecordSave:
    def test_entries_default_lista_vazia(self):
        body = AttendanceRecordSave()
        assert body.entries == []
        assert body.notes is None

    def test_aceita_lista_de_entries(self):
        body = AttendanceRecordSave(
            notes="aula prática",
            entries=[
                {"enrollment_id": "a", "status": "present"},
                {"enrollment_id": "b", "status": "absent"},
                {"enrollment_id": "c", "status": "justified", "notes": "atestado"},
            ],
        )
        assert len(body.entries) == 3
        assert body.entries[2].notes == "atestado"


class TestAttendanceDayDraft:
    def test_draft_sem_record_id(self):
        d = AttendanceDayDraft(
            module_id="m1",
            attendance_date=date(2026, 5, 18),
            entries=[
                AttendanceEntryWithStudent(
                    enrollment_id="e1",
                    student_id="s1",
                    student_number="2024001",
                    full_name="Aluno Teste",
                ),
            ],
        )
        assert d.record_id is None
        assert d.entries[0].status == "present"


class TestAttendanceSummary:
    def test_contagens_obrigatorias(self):
        now = datetime.now(timezone.utc)
        s = AttendanceSummary(
            id="a",
            module_id="m",
            attendance_date=date(2026, 5, 18),
            total_present=10,
            total_absent=2,
            total_justified=1,
            created_at=now,
            updated_at=now,
        )
        assert s.total_present == 10
        assert s.total_absent == 2
        assert s.total_justified == 1
