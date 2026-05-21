import axios from "axios";
import { useAuthStore } from "@/hooks/useAuth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  headers: { "Content-Type": "application/json" },
});

// Injeta o access_token do store Zustand (síncrono — evita travamento por getSession)
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Traduz erros HTTP para mensagens legíveis
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // 401 = token expirado/inválido. O backend só devolve 401 nesse caso,
    // então limpamos a sessão e mandamos o usuário para o login em vez de
    // mostrar um erro genérico numa tela que não vai mais funcionar.
    if (error.response?.status === 401) {
      const store = useAuthStore.getState();
      store._setSession(null);
      store._setProfile(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }

    let data = error.response?.data;
    // Em respostas binárias (responseType: 'blob'), o JSON de erro também
    // vem como Blob — convertemos para texto e tentamos parsear.
    if (data instanceof Blob) {
      try {
        const text = await data.text();
        try {
          data = JSON.parse(text);
        } catch {
          data = { detail: text || undefined };
        }
      } catch {
        data = undefined;
      }
    }
    const detail: string =
      data?.detail ?? "Erro inesperado. Tente novamente.";
    return Promise.reject(new Error(detail));
  }
);

export default api;
