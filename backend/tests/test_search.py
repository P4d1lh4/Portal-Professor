"""Testes do sanitizador de termos de busca (anti-injeção de filtro PostgREST)."""
from app.services.search import build_ilike_or, sanitize_search_term


class TestSanitizeSearchTerm:
    def test_preserva_letras_e_acentos(self):
        assert sanitize_search_term("Maria José") == "Maria José"

    def test_remove_caracteres_estruturais(self):
        # vírgula, parênteses, aspas, contrabarra, curingas e dois-pontos somem
        out = sanitize_search_term('a,role.eq.admin')
        assert "," not in out
        out2 = sanitize_search_term('x")(*%:y')
        for ch in ',()"\\*%:':
            assert ch not in out2


class TestBuildIlikeOr:
    def test_monta_filtro_para_colunas(self):
        f = build_ilike_or("ana", ["full_name", "email"])
        assert f == "full_name.ilike.%ana%,email.ilike.%ana%"

    def test_termo_vazio_retorna_none(self):
        assert build_ilike_or("   ", ["full_name"]) is None

    def test_termo_so_com_caracteres_perigosos_retorna_none(self):
        assert build_ilike_or(",,(),", ["full_name"]) is None

    def test_injecao_de_filtro_e_neutralizada(self):
        # Tentativa de injetar um segundo filtro via vírgula não deve produzir
        # uma vírgula separadora extra além das que separam as colunas.
        f = build_ilike_or("a,role.eq.admin", ["full_name"])
        assert f is not None
        # Só a vírgula entre colunas existiria; com 1 coluna, nenhuma vírgula.
        assert "," not in f
