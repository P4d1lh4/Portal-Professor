"""Testes do refator em lote (sem N+1) em routers/students.py."""
from datetime import date, datetime, timezone

from app.routers.students import (
    _assemble_detail,
    _build_details_batch,
)


def _student_row(student_id: str, name: str) -> dict:
    return {
        "id": student_id,
        "student_number": f"S-{student_id}",
        "full_name": name,
        "email": None,
        "academic_period_id": "p1",
        "enrollment_date": date(2026, 2, 1).isoformat(),
        "medical_certificates": 0,
        "referral_info": None,
        "observations": None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _enrollment(enr_id: str, student_id: str, *, final: float, absences: int, code: str) -> dict:
    return {
        "id": enr_id,
        "status": "active",
        "student_id": student_id,
        "module": {
            "id": f"m-{code}",
            "name": f"Módulo {code}",
            "code": code,
            "max_absences": 10,
        },
        "grade": {"final_grade": final, "absences": absences},
    }


class TestAssembleDetail:
    def test_agrega_modulos_e_calcula_media(self):
        student = _student_row("s1", "Aluno A")
        enrollments = [
            _enrollment("e1", "s1", final=7.0, absences=1, code="MAT01"),
            _enrollment("e2", "s1", final=9.0, absences=3, code="POR01"),
        ]
        detail = _assemble_detail(student, enrollments)
        assert len(detail.enrolled_modules) == 2
        assert detail.total_absences == 4
        # (7 + 9) / 2 = 8.0
        assert detail.avg_final_grade == 8.0

    def test_sem_enrollments_media_none(self):
        student = _student_row("s1", "Sem matrículas")
        detail = _assemble_detail(student, [])
        assert detail.enrolled_modules == []
        assert detail.total_absences == 0
        assert detail.avg_final_grade is None

    def test_enrollment_sem_grade_default_zero(self):
        student = _student_row("s1", "Aluno A")
        enr = {
            "id": "e1",
            "status": "active",
            "student_id": "s1",
            "module": {
                "id": "m1",
                "name": "M",
                "code": "X",
                "max_absences": 10,
            },
            "grade": None,  # ainda não há nota lançada
        }
        detail = _assemble_detail(student, [enr])
        assert detail.enrolled_modules[0].final_grade == 0.0
        assert detail.enrolled_modules[0].absences == 0


# ─── FakeDb que conta chamadas à tabela enrollments ─────────────────────────

class _Chain:
    def __init__(self, parent: "_FakeDb", payload: list[dict]) -> None:
        self._parent = parent
        self._payload = payload
        self._filter_in: list[str] = []

    def select(self, _sel: str) -> "_Chain":
        return self

    def in_(self, _col: str, values: list[str]) -> "_Chain":
        self._filter_in = list(values)
        return self

    def execute(self):
        # Filtra pelo student_id quando aplicável
        filtered = [
            r for r in self._payload
            if not self._filter_in or r.get("student_id") in self._filter_in
        ]

        class _Resp:
            def __init__(self, data):
                self.data = data

        return _Resp(filtered)


class _FakeDb:
    def __init__(self, enrollments: list[dict]) -> None:
        self._enrollments = enrollments
        self.calls: list[str] = []

    def table(self, name: str) -> _Chain:
        self.calls.append(name)
        if name == "enrollments":
            return _Chain(self, self._enrollments)
        return _Chain(self, [])


class TestBuildDetailsBatch:
    def test_uma_unica_query_para_n_alunos(self):
        students = [_student_row(f"s{i}", f"Aluno {i}") for i in range(5)]
        enrollments = [
            _enrollment(f"e{i}", f"s{i}", final=7.0, absences=1, code="M")
            for i in range(5)
        ]
        db = _FakeDb(enrollments)
        details = _build_details_batch(students, db)

        # CRÍTICO: apenas 1 chamada à tabela enrollments, não N
        assert db.calls == ["enrollments"]
        assert len(details) == 5
        # Cada aluno recebeu o seu enrollment
        for i, d in enumerate(details):
            assert d.id == f"s{i}"
            assert len(d.enrolled_modules) == 1

    def test_agrupa_enrollments_por_aluno(self):
        students = [_student_row("s1", "Um"), _student_row("s2", "Dois")]
        enrollments = [
            _enrollment("e1", "s1", final=8.0, absences=2, code="A"),
            _enrollment("e2", "s1", final=6.0, absences=1, code="B"),
            _enrollment("e3", "s2", final=9.0, absences=0, code="A"),
        ]
        db = _FakeDb(enrollments)
        details = _build_details_batch(students, db)

        d1 = next(d for d in details if d.id == "s1")
        d2 = next(d for d in details if d.id == "s2")

        assert len(d1.enrolled_modules) == 2
        assert d1.total_absences == 3
        assert d1.avg_final_grade == 7.0  # (8+6)/2

        assert len(d2.enrolled_modules) == 1
        assert d2.total_absences == 0
        assert d2.avg_final_grade == 9.0

    def test_lista_vazia_nao_consulta_db(self):
        db = _FakeDb([])
        details = _build_details_batch([], db)
        assert details == []
        # Não faz nenhuma chamada se não há alunos
        assert db.calls == []

    def test_aluno_sem_enrollments_aparece_vazio(self):
        students = [_student_row("s1", "Sem matricula")]
        db = _FakeDb([])  # nenhum enrollment no banco
        details = _build_details_batch(students, db)

        assert len(details) == 1
        assert details[0].enrolled_modules == []
        assert details[0].total_absences == 0
        assert details[0].avg_final_grade is None
