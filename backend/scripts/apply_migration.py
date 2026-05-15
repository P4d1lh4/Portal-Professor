"""
Aplica uma migration SQL no banco Supabase remoto.

Uso:
    python backend/scripts/apply_migration.py                 # aplica a migration mais recente que ainda não foi aplicada
    python backend/scripts/apply_migration.py 0003            # aplica 0003_*.sql
    python backend/scripts/apply_migration.py 0003_medical_certificates.sql
    python backend/scripts/apply_migration.py --all           # aplica todas as pendentes em ordem
    python backend/scripts/apply_migration.py --status        # lista o que já foi aplicado

Requisitos:
  - Variável DATABASE_URL no backend/.env (Supabase → Settings → Database →
    "Connection string" → URI → modo "Session" ou "Transaction"; recomendo
    "Session" para suportar DDL com transação).

Cria automaticamente a tabela public.schema_migrations para rastrear o que
já foi aplicado — assim podemos rodar idempotentemente.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent  # backend/
MIGRATIONS_DIR = ROOT.parent / "supabase" / "migrations"
load_dotenv(ROOT / ".env")

DATABASE_URL = os.environ.get("DATABASE_URL")


# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------

def _ensure_tracking_table(conn: psycopg.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version     TEXT PRIMARY KEY,
            file_name   TEXT NOT NULL,
            checksum    TEXT NOT NULL,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )


def _list_migrations() -> list[Path]:
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        sys.exit(f"Nenhuma migration encontrada em {MIGRATIONS_DIR}")
    return files


_VERSION_RE = re.compile(r"^(\d+)")


def _version_of(path: Path) -> str:
    """Usa o stem inteiro do arquivo — assim 0002_rls_granular e
    0002_seed_instructions ficam distintos no tracking table."""
    match = _VERSION_RE.match(path.stem)
    if not match:
        sys.exit(f"Nome de migration sem prefixo numérico: {path.name}")
    return path.stem


def _checksum(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def _applied_versions(conn: psycopg.Connection) -> dict[str, dict]:
    cur = conn.execute(
        "SELECT version, file_name, checksum, applied_at "
        "FROM public.schema_migrations ORDER BY version"
    )
    rows = cur.fetchall()
    cols = [d.name for d in cur.description]
    return {row[0]: dict(zip(cols, row)) for row in rows}


def _resolve_target(arg: str) -> Path:
    """Aceita '0003', '0003_medical_certificates.sql' ou caminho."""
    direct = Path(arg)
    if direct.is_file():
        return direct
    candidates = list(MIGRATIONS_DIR.glob(f"{arg}*.sql"))
    if not candidates:
        sys.exit(f"Migration '{arg}' não encontrada em {MIGRATIONS_DIR}")
    if len(candidates) > 1:
        sys.exit(
            f"Ambíguo: '{arg}' bateu com {[c.name for c in candidates]}. "
            "Use o nome completo."
        )
    return candidates[0]


# ---------------------------------------------------------------
# Operações
# ---------------------------------------------------------------

def cmd_status() -> None:
    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        _ensure_tracking_table(conn)
        applied = _applied_versions(conn)

    files = _list_migrations()
    print(f"\nMigrations em {MIGRATIONS_DIR.relative_to(ROOT.parent)}:\n")
    print(f"  {'Versão':<8} {'Status':<10} {'Arquivo'}")
    print(f"  {'-' * 7} {'-' * 9} {'-' * 50}")
    for path in files:
        v = _version_of(path)
        entry = applied.get(v)
        if entry is None:
            status = "pendente"
        else:
            checksum_now = _checksum(path.read_text(encoding="utf-8"))
            status = "OK" if checksum_now == entry["checksum"] else "MODIFICADA"
        print(f"  {v:<8} {status:<10} {path.name}")
    print()


def _apply_one(conn: psycopg.Connection, path: Path, applied: dict) -> bool:
    version = _version_of(path)
    sql = path.read_text(encoding="utf-8")
    checksum = _checksum(sql)

    if version in applied:
        existing = applied[version]
        if existing["checksum"] == checksum:
            print(f"  [skip] {path.name} já aplicada em {existing['applied_at']}")
            return False
        print(
            f"  [aviso] {path.name} já foi aplicada mas o conteúdo mudou "
            f"(checksum antigo {existing['checksum']} → atual {checksum})."
        )
        print("          Pulando reaplicação automática. Edite o banco manualmente.")
        return False

    print(f"  [aplicar] {path.name} (versão {version}, checksum {checksum})")
    # psycopg executa o script inteiro como um único statement separado por ;
    # numa única transação implícita — DDL do Postgres é transacional.
    with conn.transaction():
        conn.execute(sql)
        conn.execute(
            "INSERT INTO public.schema_migrations (version, file_name, checksum) "
            "VALUES (%s, %s, %s)",
            (version, path.name, checksum),
        )
    print(f"  [ok]     {path.name}")
    return True


def cmd_mark_applied(target: str) -> None:
    """Registra uma migration como aplicada sem reexecutar o SQL.

    Útil quando o conteúdo já foi rodado manualmente (ex.: pelo SQL Editor)
    e queremos apenas alinhar o tracking.
    """
    path = _resolve_target(target)
    version = _version_of(path)
    checksum = _checksum(path.read_text(encoding="utf-8"))

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        _ensure_tracking_table(conn)
        applied = _applied_versions(conn)
        if version in applied:
            print(f"  [skip] {path.name} já marcada como aplicada.")
            return
        conn.execute(
            "INSERT INTO public.schema_migrations (version, file_name, checksum) "
            "VALUES (%s, %s, %s)",
            (version, path.name, checksum),
        )
        conn.commit()
    print(f"  [ok] {path.name} marcada como aplicada (sem reexecutar).")


def cmd_apply(target: str | None, all_pending: bool) -> None:
    files = _list_migrations()
    if not all_pending and target is None:
        # Default: aplica todas as pendentes (igual --all)
        all_pending = True

    targets = [_resolve_target(target)] if target else files

    with psycopg.connect(DATABASE_URL, autocommit=False) as conn:
        _ensure_tracking_table(conn)
        # registra a si mesma como aplicada (caso anteriormente não estivesse)
        conn.commit()

        applied = _applied_versions(conn)

        if all_pending:
            print("\nAplicando migrations pendentes…\n")
            any_applied = False
            for path in targets:
                if _apply_one(conn, path, applied):
                    any_applied = True
                    applied = _applied_versions(conn)
            conn.commit()
            if not any_applied:
                print("  Nada a fazer — todas as migrations já estão aplicadas.")
        else:
            print(f"\nAplicando {targets[0].name}…\n")
            _apply_one(conn, targets[0], applied)
            conn.commit()
    print()


# ---------------------------------------------------------------
# CLI
# ---------------------------------------------------------------

def main() -> None:
    if not DATABASE_URL:
        sys.exit(
            "DATABASE_URL não definida em backend/.env.\n"
            "Pegue em: Supabase → Settings → Database → Connection string → URI.\n"
            "Recomendado: modo 'Session' (porta 5432) — suporta DDL em transação."
        )

    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "target",
        nargs="?",
        help="Versão (ex: 0003) ou nome do arquivo. Se omitido com --all, aplica todas pendentes.",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Aplica todas as migrations pendentes em ordem.",
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Lista o estado de cada migration sem aplicar nada.",
    )
    parser.add_argument(
        "--mark-applied",
        action="store_true",
        help="Marca a migration alvo como aplicada sem reexecutar o SQL.",
    )
    args = parser.parse_args()

    if args.status:
        cmd_status()
    elif args.mark_applied:
        if not args.target:
            sys.exit("--mark-applied requer um alvo (ex: 0001_initial_schema).")
        cmd_mark_applied(args.target)
    else:
        cmd_apply(args.target, args.all)


if __name__ == "__main__":
    main()
