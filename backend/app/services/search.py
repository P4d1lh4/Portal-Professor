"""Utilitários para montar filtros de busca do PostgREST com segurança."""
import re

# Caracteres com significado estrutural na sintaxe de filtros do PostgREST:
# vírgula separa filtros num `or`, parênteses agrupam, aspas/contrabarra
# delimitam valores e *,% são curingas. Removê-los do termo digitado pelo
# usuário evita injeção de filtros adicionais via o parâmetro de busca.
_UNSAFE = re.compile(r'[,()"\\*%:]')


def sanitize_search_term(term: str) -> str:
    """Remove caracteres estruturais do termo, preservando letras/acentos."""
    return _UNSAFE.sub(" ", term).strip()


def build_ilike_or(term: str, columns: list[str]) -> str | None:
    """Monta a expressão `or` de ilike para as colunas dadas.

    Retorna None se o termo, após sanitização, ficar vazio.
    """
    safe = sanitize_search_term(term)
    if not safe:
        return None
    pattern = f"%{safe}%"
    return ",".join(f"{col}.ilike.{pattern}" for col in columns)
