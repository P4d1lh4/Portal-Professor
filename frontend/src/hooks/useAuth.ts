import { useEffect } from "react";
import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/types";

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  _setSession: (session: Session | null) => void;
  _setProfile: (profile: Profile | null) => void;
  _setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,

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
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null });
  },

  _setSession: (session) =>
    set({ session, user: session?.user ?? null }),

  _setProfile: (profile) => set({ profile }),
  _setLoading: (isLoading) => set({ isLoading }),
}));

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    // onAuthStateChange dispara imediatamente com INITIAL_SESSION —
    // elimina dependência de getSession() que pode travar em refresh de token
    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        store._setSession(session);

        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          store._setProfile(profile);
        } else {
          store._setProfile(null);
        }

        store._setLoading(false);
      }
    );

    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    user: store.user,
    session: store.session,
    profile: store.profile,
    isLoading: store.isLoading,
    signIn: store.signIn,
    signOut: store.signOut,
  };
}
