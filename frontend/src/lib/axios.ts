import axios from "axios";
import { useAuthStore } from "@/hooks/useAuth";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
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
  (error) => {
    const detail: string =
      error.response?.data?.detail ?? "Erro inesperado. Tente novamente.";
    return Promise.reject(new Error(detail));
  }
);

export default api;
