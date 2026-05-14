"""
Seed de dados para a Aplicação Professor.

Popula:
  - 1 admin, 2 coordenadores, 4 professores
  - 2 períodos acadêmicos
  - 20 alunos (10 por período)
  - 8 módulos (4 por período, 1 professor por módulo)
  - Matrículas e notas de exemplo

Uso:
    cd backend
    python scripts/seed.py

Variáveis de ambiente necessárias (arquivo .env ou exportadas):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    SEED_ADMIN_PASSWORD
    SEED_DEFAULT_PASSWORD
"""

import os
import sys
import uuid
import random
from datetime import date, timedelta
from pathlib import Path

# Garante que o diretório pai (backend/) esteja no path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ADMIN_PASS   = os.environ.get("SEED_ADMIN_PASSWORD", "Admin@1234!")
DEFAULT_PASS = os.environ.get("SEED_DEFAULT_PASSWORD", "Escola@2024!")

supabase: Client = create_client(SUPABASE_URL, SERVICE_KEY)


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def create_auth_user(email: str, password: str, role: str, username: str, full_name: str) -> str:
    """Cria usuário no Supabase Auth e retorna o UUID gerado."""
    resp = supabase.auth.admin.create_user({
        "email": email,
        "password": password,
        "email_confirm": True,
        "user_metadata": {
            "role": role,
            "username": username,
            "full_name": full_name,
        },
    })
    return resp.user.id


def upsert_profile(user_id: str, username: str, full_name: str, email: str, role: str) -> None:
    """Garante que o profile existe (o trigger já cria, mas fazemos upsert para segurança)."""
    supabase.table("profiles").upsert({
        "id": user_id,
        "username": username,
        "full_name": full_name,
        "email": email,
        "role": role,
    }).execute()


# ---------------------------------------------------------------
# Dados fixos
# ---------------------------------------------------------------

USERS = [
    # (email, username, full_name, role)
    ("admin@escola.com",   "admin",   "Administrador",           "admin"),
    ("coord1@escola.com",  "coord1",  "Coordenadora Ana Lima",   "coordinator"),
    ("coord2@escola.com",  "coord2",  "Coordenador Bruno Mota",  "coordinator"),
    ("prof1@escola.com",   "prof1",   "Professora Carla Souza",  "professor"),
    ("prof2@escola.com",   "prof2",   "Professor Diego Alves",   "professor"),
    ("prof3@escola.com",   "prof3",   "Professora Elena Rocha",  "professor"),
    ("prof4@escola.com",   "prof4",   "Professor Fábio Nunes",   "professor"),
]

STUDENT_NAMES = [
    "Alice Ferreira",   "Bruno Costa",      "Camila Dias",     "Daniel Vieira",
    "Eduarda Martins",  "Felipe Carvalho",  "Gabriela Lima",   "Henrique Souza",
    "Isabela Rocha",    "João Pedro Alves", "Larissa Nunes",   "Marcos Oliveira",
    "Natália Santos",   "Otávio Ribeiro",   "Paula Mendes",    "Rafael Torres",
    "Sabrina Gomes",    "Thiago Barbosa",   "Valentina Cruz",  "William Pinto",
]

MODULE_NAMES = [
    ("Matemática Aplicada",     "MAT101"),
    ("Português e Redação",     "POR102"),
    ("Ciências da Natureza",    "CNA103"),
    ("História e Cultura",      "HIS104"),
    ("Programação Básica",      "PRG201"),
    ("Inglês Instrumental",     "ING202"),
    ("Educação Física",         "EDF203"),
    ("Artes e Expressão",       "ART204"),
]


def main() -> None:
    print("=== Seed: Aplicação Professor ===\n")

    # ---- Criar usuários ----
    print("Criando usuários...")
    user_ids: dict[str, str] = {}

    for email, username, full_name, role in USERS:
        password = ADMIN_PASS if role == "admin" else DEFAULT_PASS
        try:
            uid = create_auth_user(email, password, role, username, full_name)
            user_ids[username] = uid
            upsert_profile(uid, username, full_name, email, role)
            print(f"  ✓ {role:12s} {email}")
        except Exception as exc:
            if "already registered" in str(exc).lower() or "already been registered" in str(exc).lower():
                # Busca o ID existente
                existing = supabase.table("profiles").select("id").eq("email", email).single().execute()
                user_ids[username] = existing.data["id"]
                print(f"  ~ {role:12s} {email}  (já existia)")
            else:
                print(f"  ✗ {email}: {exc}")
                raise

    coord1_id = user_ids["coord1"]
    coord2_id = user_ids["coord2"]
    prof_ids  = [user_ids[f"prof{i}"] for i in range(1, 5)]

    # ---- Criar períodos acadêmicos ----
    print("\nCriando períodos acadêmicos...")
    today = date.today()

    period_data = [
        {
            "name":           "2024/1",
            "coordinator_id": coord1_id,
            "start_date":     str(date(today.year, 2, 1)),
            "end_date":       str(date(today.year, 6, 30)),
            "is_active":      False,
        },
        {
            "name":           "2024/2",
            "coordinator_id": coord2_id,
            "start_date":     str(date(today.year, 7, 1)),
            "end_date":       str(date(today.year, 12, 15)),
            "is_active":      True,
        },
    ]

    period_ids: list[str] = []
    for pd in period_data:
        try:
            resp = supabase.table("academic_periods").upsert(pd, on_conflict="name").execute()
            period_ids.append(resp.data[0]["id"])
            print(f"  ✓ Período '{pd['name']}'")
        except Exception as exc:
            existing = supabase.table("academic_periods").select("id").eq("name", pd["name"]).single().execute()
            period_ids.append(existing.data["id"])
            print(f"  ~ Período '{pd['name']}' (já existia)")

    # ---- Criar módulos (4 por período) ----
    print("\nCriando módulos...")
    module_ids: list[str] = []

    for p_idx, period_id in enumerate(period_ids):
        for m_idx in range(4):
            mod_name, mod_code = MODULE_NAMES[p_idx * 4 + m_idx]
            professor_id = prof_ids[m_idx]  # cada prof pega um módulo por período

            module_payload = {
                "name":               mod_name,
                "code":               mod_code,
                "professor_id":       professor_id,
                "academic_period_id": period_id,
                "credits":            random.choice([2, 4]),
                "max_absences":       10,
                "is_active":          True,
            }
            try:
                resp = supabase.table("modules").upsert(
                    module_payload, on_conflict="code,academic_period_id"
                ).execute()
                module_ids.append(resp.data[0]["id"])
                print(f"  ✓ {mod_code} — {mod_name}")
            except Exception:
                existing = (
                    supabase.table("modules")
                    .select("id")
                    .eq("code", mod_code)
                    .eq("academic_period_id", period_id)
                    .single()
                    .execute()
                )
                module_ids.append(existing.data["id"])
                print(f"  ~ {mod_code} — {mod_name} (já existia)")

    # ---- Criar alunos (10 por período) ----
    print("\nCriando alunos...")
    student_ids: list[str] = []

    for p_idx, period_id in enumerate(period_ids):
        for s_idx in range(10):
            global_idx  = p_idx * 10 + s_idx
            name        = STUDENT_NAMES[global_idx]
            student_num = f"2024{str(global_idx + 1).zfill(4)}"
            email       = f"aluno{global_idx + 1}@escola.com"

            student_payload = {
                "student_number":       student_num,
                "full_name":            name,
                "email":                email,
                "academic_period_id":   period_id,
                "enrollment_date":      str(date(today.year, 2 if p_idx == 0 else 7, 1)),
                "medical_certificates": random.randint(0, 3),
                "is_active":            True,
            }
            try:
                resp = supabase.table("students").upsert(
                    student_payload, on_conflict="student_number"
                ).execute()
                student_ids.append(resp.data[0]["id"])
                print(f"  ✓ {student_num} — {name}")
            except Exception:
                existing = (
                    supabase.table("students")
                    .select("id")
                    .eq("student_number", student_num)
                    .single()
                    .execute()
                )
                student_ids.append(existing.data["id"])
                print(f"  ~ {student_num} — {name} (já existia)")

    # ---- Criar matrículas e notas ----
    print("\nCriando matrículas e notas...")

    for p_idx, period_id in enumerate(period_ids):
        period_module_ids  = module_ids[p_idx * 4 : p_idx * 4 + 4]
        period_student_ids = student_ids[p_idx * 10 : p_idx * 10 + 10]

        for module_id in period_module_ids:
            for student_id in period_student_ids:
                # Matricula
                enrollment_payload = {
                    "student_id": student_id,
                    "module_id":  module_id,
                    "status":     "active",
                }
                try:
                    enroll_resp = supabase.table("enrollments").upsert(
                        enrollment_payload, on_conflict="student_id,module_id"
                    ).execute()
                    enrollment_id = enroll_resp.data[0]["id"]
                except Exception:
                    existing = (
                        supabase.table("enrollments")
                        .select("id")
                        .eq("student_id", student_id)
                        .eq("module_id", module_id)
                        .single()
                        .execute()
                    )
                    enrollment_id = existing.data["id"]

                # Gera notas aleatórias realistas
                tutor  = round(random.uniform(4.0, 10.0), 2)
                reg    = round(random.uniform(3.0, 10.0), 2)
                makeup = round(random.uniform(5.0, 9.0), 2) if random.random() < 0.2 else 0.0
                absences = random.randint(0, 12)

                if makeup > 0:
                    final = round(max(reg, makeup), 2)
                else:
                    final = round(reg, 2)

                grades_payload = {
                    "enrollment_id":      enrollment_id,
                    "tutor_grade":        tutor,
                    "regular_exam_grade": reg,
                    "makeup_exam_grade":  makeup,
                    "final_grade":        final,
                    "absences":           absences,
                }
                supabase.table("grades").upsert(
                    grades_payload, on_conflict="enrollment_id"
                ).execute()

    print("\n✅ Seed concluído com sucesso!")
    print(f"\nCredenciais de acesso:")
    print(f"  admin@escola.com       — senha: {ADMIN_PASS}")
    print(f"  coord1@escola.com      — senha: {DEFAULT_PASS}")
    print(f"  coord2@escola.com      — senha: {DEFAULT_PASS}")
    print(f"  prof1@escola.com       — senha: {DEFAULT_PASS}")
    print(f"  prof2@escola.com       — senha: {DEFAULT_PASS}")
    print(f"  prof3@escola.com       — senha: {DEFAULT_PASS}")
    print(f"  prof4@escola.com       — senha: {DEFAULT_PASS}")


if __name__ == "__main__":
    main()
