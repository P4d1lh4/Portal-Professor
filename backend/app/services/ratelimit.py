"""Rate limiter fixed-window em memória.

ponytail: em memória por processo — suficiente para o deploy de worker único
(WEB_CONCURRENCY=1). Para múltiplos workers/instâncias, trocar por Redis ou
slowapi. Usado onde há vetor de brute-force (ex.: troca de senha).
"""
import time
from threading import Lock

_hits: dict[str, list[float]] = {}
_lock = Lock()


def check_rate_limit(key: str, max_calls: int, window_seconds: float) -> bool:
    """Registra uma tentativa para `key`. Retorna True se permitido, False se
    excedeu `max_calls` dentro de `window_seconds`."""
    now = time.monotonic()
    with _lock:
        hits = [t for t in _hits.get(key, []) if now - t < window_seconds]
        if len(hits) >= max_calls:
            _hits[key] = hits
            return False
        hits.append(now)
        _hits[key] = hits
        return True
