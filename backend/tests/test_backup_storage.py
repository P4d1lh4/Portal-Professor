"""Backup dos anexos (I-25): percorre pastas, pagina e não escreve fora do destino."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import backup_storage as bs  # noqa: E402


class FakeBucket:
    """Bucket em memória. Pastas são implícitas nos caminhos, como no Storage."""

    def __init__(self, files=None):
        self.files = dict(files or {})
        self.offsets = []

    def list(self, prefix, options):
        self.offsets.append(options["offset"])
        base = f"{prefix}/" if prefix else ""
        names = {}
        for path in self.files:
            if path.startswith(base):
                head, _, rest = path[len(base):].partition("/")
                names[head] = None if rest else f"id-{head}"
        items = [{"name": n, "id": i} for n, i in sorted(names.items())]
        return items[options["offset"] : options["offset"] + options["limit"]]

    def download(self, path):
        return self.files[path]

    def upload(self, path, data, options):
        assert options["upsert"] == "true"
        self.files[path] = data


def test_ida_e_volta_preserva_pastas_e_bytes(tmp_path):
    files = {
        "cert-1/a_atestado.pdf": b"%PDF-1",
        "cert-1/b_retorno.pdf": b"%PDF-2",
        "cert-2/sub/c.pdf": b"%PDF-3",
    }
    assert bs.download_all(FakeBucket(files), tmp_path) == 3
    assert (tmp_path / "cert-2" / "sub" / "c.pdf").read_bytes() == b"%PDF-3"

    restored = FakeBucket()
    assert bs.upload_all(restored, tmp_path) == 3
    assert restored.files == files


def test_pagina_a_listagem(tmp_path, monkeypatch):
    monkeypatch.setattr(bs, "PAGE", 2)
    bucket = FakeBucket({f"f{i}.pdf": b"x" for i in range(5)})

    assert bs.download_all(bucket, tmp_path) == 5
    assert bucket.offsets == [0, 2, 4]


def test_recusa_caminho_fora_do_destino(tmp_path):
    dest = tmp_path / "backup"
    with pytest.raises(ValueError, match="fora da pasta"):
        bs.download_all(FakeBucket({"../fora.pdf": b"x"}), dest)
    assert not (tmp_path / "fora.pdf").exists()
