import { AxiosError, type AxiosAdapter } from "axios";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O store de auth importa o cliente do Supabase; o mock evita tocar no projeto
// real (o .env local tem as chaves de produção).
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { onAuthStateChange: vi.fn() } },
}));

import api from "./axios";
import { useAuthStore } from "@/hooks/useAuth";
import type { Profile } from "@/types";

const ok: AxiosAdapter = async (config) => ({
  data: null,
  status: 200,
  statusText: "OK",
  headers: {},
  config,
});

const fail =
  (status: number, data?: unknown): AxiosAdapter =>
  async (config) => {
    throw new AxiosError("falhou", "ERR_BAD_RESPONSE", config, null, {
      data,
      status,
      statusText: "",
      headers: {},
      config,
    });
  };

const session = { access_token: "tok-123", user: { id: "u1" } } as unknown as Session;
const profile = { id: "u1", role: "professor" } as Profile;

function stubLocation(pathname: string) {
  const assign = vi.fn();
  vi.stubGlobal("location", { pathname, assign });
  return assign;
}

beforeEach(() => {
  useAuthStore.setState({ session: null, user: null, profile: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("interceptor de requisição", () => {
  it("injeta o Bearer da sessão", async () => {
    useAuthStore.getState()._setSession(session);
    const res = await api.get("/api/x", { adapter: ok });
    expect(res.config.headers.Authorization).toBe("Bearer tok-123");
  });

  it("sem sessão não manda Authorization", async () => {
    const res = await api.get("/api/x", { adapter: ok });
    expect(res.config.headers.Authorization).toBeUndefined();
  });
});

describe("interceptor de resposta", () => {
  it("401 limpa a sessão e manda para o login", async () => {
    const assign = stubLocation("/notas");
    useAuthStore.setState({ session, profile });

    await expect(
      api.get("/api/x", { adapter: fail(401, { detail: "Token expirado" }) }),
    ).rejects.toThrow("Token expirado");

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("401 já no login não recarrega a página", async () => {
    const assign = stubLocation("/login");
    await expect(api.get("/api/x", { adapter: fail(401) })).rejects.toThrow();
    expect(assign).not.toHaveBeenCalled();
  });

  it("403 devolve o detail e mantém a sessão", async () => {
    const assign = stubLocation("/notas");
    useAuthStore.setState({ session, profile });

    await expect(
      api.get("/api/x", { adapter: fail(403, { detail: "Sem permissão" }) }),
    ).rejects.toThrow("Sem permissão");

    expect(useAuthStore.getState().session).toBe(session);
    expect(assign).not.toHaveBeenCalled();
  });

  it("erro em download (Blob com JSON) vira o detail", async () => {
    const blob = new Blob([JSON.stringify({ detail: "Período encerrado" })], {
      type: "application/json",
    });
    await expect(api.get("/api/x", { adapter: fail(409, blob) })).rejects.toThrow(
      "Período encerrado",
    );
  });

  it("Blob com texto puro vira o detail", async () => {
    await expect(
      api.get("/api/x", { adapter: fail(502, new Blob(["Bad gateway"])) }),
    ).rejects.toThrow("Bad gateway");
  });

  it("sem resposta (rede) cai na mensagem genérica", async () => {
    const semRede: AxiosAdapter = async (config) => {
      throw new AxiosError("Network Error", "ERR_NETWORK", config);
    };
    await expect(api.get("/api/x", { adapter: semRede })).rejects.toThrow(
      "Erro inesperado. Tente novamente.",
    );
  });
});
