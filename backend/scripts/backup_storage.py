"""Backup e restore dos anexos do Supabase Storage (bucket de atestados).

    python scripts/backup_storage.py baixar <pasta>   # bucket -> pasta (backup)
    python scripts/backup_storage.py enviar <pasta>   # pasta -> bucket (restore)

Lê SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY do ambiente. Usado pelo workflow
.github/workflows/backup.yml; o restore completo está no DEPLOY.md.
"""
import mimetypes
import os
import sys
from pathlib import Path

BUCKET = "medical-certificates"
PAGE = 1000


def walk(bucket, prefix: str = ""):
    """Caminhos de todos os arquivos sob `prefix`. O Storage lista pastas com id None."""
    offset = 0
    while True:
        items = bucket.list(prefix, {"limit": PAGE, "offset": offset})
        for item in items:
            path = f"{prefix}/{item['name']}" if prefix else item["name"]
            if item.get("id") is None:
                yield from walk(bucket, path)
            else:
                yield path
        if len(items) < PAGE:
            return
        offset += PAGE


def _inside(root: Path, rel: str) -> Path:
    target = (root / rel).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f"caminho fora da pasta de backup: {rel}")
    return target


def download_all(bucket, dest: Path) -> int:
    count = 0
    for path in walk(bucket):
        target = _inside(dest, path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(bucket.download(path))
        count += 1
    return count


def upload_all(bucket, src: Path) -> int:
    count = 0
    for file in sorted(p for p in src.rglob("*") if p.is_file()):
        content_type = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        bucket.upload(
            file.relative_to(src).as_posix(),
            file.read_bytes(),
            {"content-type": content_type, "upsert": "true"},
        )
        count += 1
    return count


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in ("baixar", "enviar"):
        sys.exit(__doc__)
    from supabase import create_client

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    bucket = client.storage.from_(BUCKET)
    folder = Path(sys.argv[2])
    if sys.argv[1] == "baixar":
        print(f"{download_all(bucket, folder)} arquivo(s) de '{BUCKET}' baixados em {folder}")
    else:
        print(f"{upload_all(bucket, folder)} arquivo(s) enviados para '{BUCKET}'")


if __name__ == "__main__":
    main()
