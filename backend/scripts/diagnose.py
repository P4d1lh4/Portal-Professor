"""
Diagnostico fim-a-fim:
  1. Inspeciona o estado do banco (profiles, modules, periods, enrollments)
  2. Testa o ciclo de auth como prof1@escola.com
  3. Chama GET /api/modules com o JWT e mostra o que volta

Uso:
    cd backend
    python scripts/diagnose.py
"""

import os
import sys
import json
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from supabase import create_client, Client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
ANON_KEY     = os.environ["SUPABASE_ANON_KEY"]
DEFAULT_PASS = os.environ.get("SEED_DEFAULT_PASSWORD", "Escola@2024!")
BACKEND_URL  = "http://localhost:8000"
TEST_EMAIL   = "prof1@escola.com"

supabase: Client = create_client(SUPABASE_URL, SERVICE_KEY)


def section(title: str) -> None:
    print()
    print("=" * 70)
    print(f"  {title}")
    print("=" * 70)


def inspect_db() -> None:
    section("1. Estado do banco (via service_role)")

    profiles = supabase.table("profiles").select("id,email,role,username").execute()
    print(f"\nprofiles: {len(profiles.data)} registros")
    for p in profiles.data:
        print(f"  {p['role']:12s} {p['email']:28s} id={p['id']}")

    periods = supabase.table("academic_periods").select("*").execute()
    print(f"\nacademic_periods: {len(periods.data)} registros")
    for p in periods.data:
        active = "ATIVO" if p.get("is_active") else "inativo"
        print(f"  [{active:6s}] {p['name']:8s} id={p['id']}")

    modules = supabase.table("modules").select("*").execute()
    print(f"\nmodules: {len(modules.data)} registros")
    for m in modules.data:
        active = "ativo" if m.get("is_active") else "INATIVO"
        print(f"  [{active}] {m['code']:8s} {m['name']:30s} "
              f"prof={m['professor_id']} period={m['academic_period_id']}")

    students = supabase.table("students").select("id,full_name,academic_period_id,is_active").execute()
    print(f"\nstudents: {len(students.data)} registros (mostrando 5)")
    for s in students.data[:5]:
        print(f"  {s['full_name']:30s} period={s['academic_period_id']}")

    enrollments = supabase.table("enrollments").select("id", count="exact").execute()
    print(f"\nenrollments: {enrollments.count} registros")

    grades = supabase.table("grades").select("id", count="exact").execute()
    print(f"\ngrades: {grades.count} registros")


def test_auth_and_api() -> None:
    section(f"2. Ciclo de auth como {TEST_EMAIL}")

    auth_url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {"apikey": ANON_KEY, "Content-Type": "application/json"}
    body = {"email": TEST_EMAIL, "password": DEFAULT_PASS}

    print(f"\nPOST {auth_url}")
    print(f"  body: {{ email: {TEST_EMAIL}, password: ***}}")

    try:
        r = httpx.post(auth_url, headers=headers, json=body, timeout=10.0)
    except Exception as e:
        print(f"  [ERRO] Nao conseguiu falar com o Supabase Auth: {e}")
        return

    if r.status_code != 200:
        print(f"  [FALHOU] HTTP {r.status_code}: {r.text}")
        print("\n  >> O login do prof1 nao funciona.")
        print("     Causa provavel: senha incorreta ou usuario nao confirmado.")
        return

    data = r.json()
    token = data["access_token"]
    user = data.get("user", {})
    print(f"  [OK] login bem-sucedido")
    print(f"  user.id  = {user.get('id')}")
    print(f"  user.email = {user.get('email')}")

    sub = user.get("id")
    section(f"3. Query direta no DB: modules WHERE professor_id = {sub}")
    direct = supabase.table("modules").select("*").eq("professor_id", sub).execute()
    print(f"\nresultado: {len(direct.data)} modulos")
    for m in direct.data:
        print(f"  {m['code']} - {m['name']} (period={m['academic_period_id']})")

    section("4. GET /api/modules via backend FastAPI")
    api_url = f"{BACKEND_URL}/api/modules"
    api_headers = {"Authorization": f"Bearer {token}"}

    print(f"\nGET {api_url}")
    print(f"  Authorization: Bearer {token[:25]}...")

    try:
        r = httpx.get(api_url, headers=api_headers, timeout=10.0)
    except httpx.ConnectError as e:
        print(f"  [ERRO] backend nao respondeu: {e}")
        print("\n  >> O backend FastAPI nao esta rodando em localhost:8000.")
        return
    except Exception as e:
        print(f"  [ERRO] {e}")
        return

    print(f"  status: {r.status_code}")
    try:
        payload = r.json()
        print(f"  body: {json.dumps(payload, indent=2, ensure_ascii=False)[:2000]}")
    except Exception:
        print(f"  body (texto): {r.text[:500]}")

    section("5. Diagnostico")
    if r.status_code == 200:
        body = r.json()
        if len(body) == 0:
            print("\n  Backend OK mas retornou lista vazia.")
            print(f"  Query direta encontrou {len(direct.data)} modulos para esse UUID.")
            if len(direct.data) > 0:
                print("  >> Bug no router. O endpoint nao retornou o que a query direta retorna.")
            else:
                print("  >> Nao ha modulos com professor_id =", sub)
                print("     O seed precisa ser re-rodado, ou prof1 nunca teve modulos atribuidos.")
        else:
            print(f"\n  [TUDO OK] Backend retornou {len(body)} modulos.")
            print("  Se o browser ainda mostra vazio, o problema esta no frontend:")
            print("   - vite proxy nao esta ativo (reiniciar npm run dev)")
            print("   - cache do browser (Ctrl+Shift+R)")
    elif r.status_code == 401:
        print("\n  >> JWT rejeitado pelo backend.")
        print("     Verificar SUPABASE_JWT_SECRET no backend/.env vs config do Supabase.")
    elif r.status_code == 404:
        print("\n  >> Profile do prof1 nao encontrado no DB do backend.")
    else:
        print(f"\n  >> HTTP {r.status_code} inesperado.")


if __name__ == "__main__":
    inspect_db()
    test_auth_and_api()
    print("\n" + "=" * 70)
    print("  Diagnostico concluido.")
    print("=" * 70)
