import type { Session } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => {
  // Os logs de debug do store são só ruído aqui.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  const single = vi.fn();
  return {
    single,
    supabase: {
      auth: {
        onAuthStateChange: vi.fn(),
        signInWithPassword: vi.fn(),
        signOut: vi.fn(),
      },
      from: vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) })),
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: sb.supabase }));

import { useAuthStore } from "./useAuth";
import { queryClient } from "@/lib/queryClient";

type Listener = (event: string, session: Session | null) => void;
// O bootstrap registra o listener uma vez, no import do módulo.
const emit = sb.supabase.auth.onAuthStateChange.mock.calls[0][0] as Listener;

const PROFILE = {
  id: "u1",
  username: "prof",
  full_name: "Prof. Teste",
  email: "prof@exemplo.com",
  role: "professor",
  avatar_url: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
const session = { access_token: "t", user: { id: "u1" } } as unknown as Session;

const state = () => useAuthStore.getState();
const settled = () => vi.waitFor(() => expect(state().isLoading).toBe(false));

beforeEach(() => {
  sb.single.mockReset();
  sb.supabase.from.mockClear();
  useAuthStore.setState({
    session: null,
    user: null,
    profile: null,
    isLoading: true,
    isPasswordRecovery: false,
  });
});

describe("listener de auth", () => {
  it("SIGNED_IN guarda a sessão, busca o profile e libera a UI", async () => {
    sb.single.mockResolvedValue({ data: PROFILE, error: null });
    emit("SIGNED_IN", session);

    expect(state().session).toBe(session);
    await settled();
    expect(sb.supabase.from).toHaveBeenCalledWith("profiles");
    expect(state().profile?.role).toBe("professor");
  });

  it("profile fora do schema (role desconhecido) vira null", async () => {
    sb.single.mockResolvedValue({ data: { ...PROFILE, role: "aluno" }, error: null });
    emit("SIGNED_IN", session);
    await settled();
    expect(state().profile).toBeNull();
  });

  it("erro ao buscar o profile vira null sem travar o carregamento", async () => {
    sb.single.mockResolvedValue({ data: null, error: { message: "timeout" } });
    emit("SIGNED_IN", session);
    await settled();
    expect(state().profile).toBeNull();
  });

  it("SIGNED_OUT limpa sessão e profile sem ir ao banco", async () => {
    useAuthStore.setState({ session, profile: PROFILE as never });
    emit("SIGNED_OUT", null);
    await settled();
    expect(state().session).toBeNull();
    expect(state().profile).toBeNull();
    expect(sb.supabase.from).not.toHaveBeenCalled();
  });

  it("PASSWORD_RECOVERY liga o desvio para a troca de senha", async () => {
    sb.single.mockResolvedValue({ data: PROFILE, error: null });
    emit("PASSWORD_RECOVERY", session);
    expect(state().isPasswordRecovery).toBe(true);
    await settled();
  });
});

describe("signIn / signOut", () => {
  it("traduz credencial inválida", async () => {
    sb.supabase.auth.signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    await expect(state().signIn("a@b.com", "x")).rejects.toThrow(
      "E-mail ou senha incorretos.",
    );
  });

  it("repassa os outros erros do Supabase", async () => {
    sb.supabase.auth.signInWithPassword.mockResolvedValue({
      error: { message: "Email not confirmed" },
    });
    await expect(state().signIn("a@b.com", "x")).rejects.toThrow("Email not confirmed");
  });

  it("signOut limpa o store e o cache mesmo se o logout falhar na rede", async () => {
    const clear = vi.spyOn(queryClient, "clear");
    sb.supabase.auth.signOut.mockRejectedValue(new Error("rede"));
    useAuthStore.setState({ session, profile: PROFILE as never });

    await state().signOut();

    expect(state().session).toBeNull();
    expect(state().profile).toBeNull();
    expect(clear).toHaveBeenCalled();
    expect(sb.supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});

describe("bootstrap", () => {
  it("libera a UI em 5 s se o Supabase não disparar evento", async () => {
    vi.useFakeTimers();
    try {
      vi.resetModules();
      const { useAuthStore: fresh } = await import("./useAuth");
      expect(fresh.getState().isLoading).toBe(true);
      vi.advanceTimersByTime(4999);
      expect(fresh.getState().isLoading).toBe(true);
      vi.advanceTimersByTime(1);
      expect(fresh.getState().isLoading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
