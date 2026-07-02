"""Rate limiter fixed-window em memória."""
from app.services.ratelimit import check_rate_limit


def test_permite_ate_o_limite_e_bloqueia_depois():
    key = "test-ratelimit-1"
    assert all(check_rate_limit(key, 3, 60) for _ in range(3))
    assert check_rate_limit(key, 3, 60) is False


def test_chaves_diferentes_sao_isoladas():
    assert check_rate_limit("test-ratelimit-a", 1, 60) is True
    assert check_rate_limit("test-ratelimit-b", 1, 60) is True
    assert check_rate_limit("test-ratelimit-a", 1, 60) is False


def test_janela_expirada_libera_novas_tentativas():
    key = "test-ratelimit-window"
    assert check_rate_limit(key, 1, 0.0) is True   # janela zero: nunca acumula
    assert check_rate_limit(key, 1, 0.0) is True
