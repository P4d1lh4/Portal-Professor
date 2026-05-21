import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { queryClient } from "@/lib/queryClient";
import type { Profile } from "@/types";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  /**
   * true entre o clique no link de recuperação de senha e a definição
   * efetiva da nova senha. Enquanto ativo, o ProtectedRoute desvia o
   * usuário para /reset-password mesmo que ele tenha uma sessão válida.
   */
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  _setSession: (session: Session | null) => void;
  _setProfile: (profile: Profile | null) => void;
  _setLoading: (loading: boolean) => void;
  _setPasswordRecovery: (flag: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isPasswordRecovery: false,

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg =
        error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos."
          : error.message;
      throw new Error(msg);
    }
  },

  signOut: async () => {
    // Limpa o store ANTES da chamada de rede. Se o POST /auth/v1/logout
    // travar (rede lenta, CDN, firewall), a UI ainda reflete o logout
    // imediatamente em vez de ficar presa esperando o servidor responder.
    set({ user: null, session: null, profile: null });
    // Limpa todo o cache de queries para que dados da conta atual não fiquem
    // visíveis se outra conta logar na mesma aba sem recarregar a página.
    queryClient.clear();
    try {
      // scope:'local' limpa apenas o storage do browser — não invalida o
      // refresh token no servidor, mas também não depende de rede.
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // já limpamos o estado; ignorar erro de cleanup
    }
  },

  _setSession: (session) =>
    set({ session, user: session?.user ?? null }),

  _setProfile: (profile) => set({ profile }),
  _setLoading: (isLoading) => set({ isLoading }),
  _setPasswordRecovery: (isPasswordRecovery) => set({ isPasswordRecovery }),
}));

// Logs de auth ficam restritos ao build de desenvolvimento. Em produção
// não devem aparecer no console (vazariam user.id, sessão e o profile).
const isDev = import.meta.env.DEV;
const debug = (...args: unknown[]) => {
  if (isDev) console.log("[auth]", ...args);
};
const debugError = (...args: unknown[]) => {
  if (isDev) console.error("[auth]", ...args);
};

async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (error) {
      debugError("Falha ao buscar profile:", error);
      return null;
    }
    if (!data) {
      debug("Profile não encontrado para userId:", userId);
      return null;
    }
    return data as Profile;
  } catch (err) {
    debugError("Exceção ao buscar profile:", err);
    return null;
  }
}

// ---------------------------------------------------------------
// Bootstrap único do auth listener.
//
// Antes esse setup ficava dentro de um useEffect no hook useAuth(),
// que era chamado em vários componentes simultâneos. Em StrictMode
// (dev) e em telas com muitos consumidores, isso criava listeners
// duplicados e race conditions que podiam deixar isLoading=true para
// sempre se uma das chamadas async falhasse.
//
// Aqui registramos UMA vez no nível de módulo, com try/finally
// garantindo que isLoading sempre vire false, mais um timeout de
// segurança para o caso de a rede do Supabase travar no refresh
// inicial de token.
// ---------------------------------------------------------------

let _authBootstrapped = false;

function bootstrapAuth(): void {
  if (_authBootstrapped) return;
  _authBootstrapped = true;

  debug("bootstrap iniciado");
  const store = useAuthStore.getState();

  // Safety net: se em 5s o onAuthStateChange não tiver disparado
  // (ex.: refresh token preso na rede), libera a UI assumindo "sem
  // sessão". Se a sessão chegar depois, o callback atualiza o estado.
  const safetyTimer = window.setTimeout(() => {
    if (useAuthStore.getState().isLoading) {
      debug("safety timeout — liberando UI");
      useAuthStore.getState()._setLoading(false);
    }
  }, 5000);

  // IMPORTANTE: o callback DEVE ser síncrono. Chamar qualquer função
  // do supabase-js de dentro de um callback async causa deadlock —
  // o lock interno do GoTrueClient bloqueia a próxima request até o
  // callback resolver, e o callback espera a request resolver.
  // Sai do contexto via setTimeout(0) antes de fazer fetchProfile.
  supabase.auth.onAuthStateChange((event, session) => {
    debug("event:", event, "session:", !!session, "user:", session?.user?.id);
    window.clearTimeout(safetyTimer);
    store._setSession(session);

    if (event === "PASSWORD_RECOVERY") {
      store._setPasswordRecovery(true);
    }

    setTimeout(async () => {
      try {
        if (session?.user) {
          debug("buscando profile...");
          const profile = await fetchProfile(session.user.id);
          debug("profile:", profile);
          store._setProfile(profile);
        } else {
          store._setProfile(null);
        }
      } catch (err) {
        debugError("erro no callback:", err);
        store._setProfile(null);
      } finally {
        debug("setLoading(false)");
        store._setLoading(false);
      }
    }, 0);
  });
}

bootstrapAuth();

export function useAuth() {
  const store = useAuthStore();
  return {
    user: store.user,
    session: store.session,
    profile: store.profile,
    isLoading: store.isLoading,
    isPasswordRecovery: store.isPasswordRecovery,
    signIn: store.signIn,
    signOut: store.signOut,
  };
}
