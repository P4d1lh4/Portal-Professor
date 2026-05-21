"""Testes do validador de URL de sincronização (defesa contra SSRF)."""
import pytest
from fastapi import HTTPException

from app.routers.sheets import _validate_sync_url


class TestValidateSyncUrl:
    @pytest.mark.parametrize(
        "url",
        [
            "https://docs.google.com/spreadsheets/d/abc/export?format=csv",
            "https://docs.google.com/spreadsheets/d/e/abc/pub?output=csv",
            "https://drive.google.com/uc?id=abc",
            "https://doc-0s-sheets.googleusercontent.com/export/abc",
        ],
    )
    def test_aceita_hosts_do_google(self, url):
        # Não deve levantar
        _validate_sync_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "http://docs.google.com/spreadsheets/d/abc/export?format=csv",  # sem https
            "https://169.254.169.254/latest/meta-data/",                    # metadata interno
            "https://localhost:8000/api/healthz",                            # loopback
            "https://evil.com/docs.google.com",                              # host malicioso
            "https://docs.google.com.evil.com/x",                            # sufixo enganoso
        ],
    )
    def test_bloqueia_hosts_nao_permitidos(self, url):
        with pytest.raises(HTTPException) as exc:
            _validate_sync_url(url)
        assert exc.value.status_code == 422
