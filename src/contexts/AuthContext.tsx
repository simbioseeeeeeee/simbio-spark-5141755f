import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session, User } from "@supabase/supabase-js";

export type AppRole = "sdr" | "closer" | "manager";

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  userName: string;
  loading: boolean;
  /** true enquanto o papel do usuário ainda está sendo buscado */
  roleLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  userName: "",
  loading: true,
  roleLoading: true,
  signIn: async () => {},
  signOut: async () => {},
});

const CACHE_RESET_PARAM = "__cache_reset";

async function clearStaleClientStateAndReload() {
  const url = new URL(window.location.href);
  const alreadyReset = url.searchParams.get(CACHE_RESET_PARAM) === "1";

  if (alreadyReset) {
    return false;
  }

  // Only clear caches and service workers — NEVER clear localStorage/sessionStorage
  // because that destroys the Supabase auth tokens and causes login loops
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // no-op
  }

  url.searchParams.set(CACHE_RESET_PARAM, "1");
  window.location.replace(url.toString());
  return true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  // O papel é buscado num efeito SEPARADO do da sessão. Sem este estado havia
  // uma janela com loading=false + user preenchido + role=null, e o
  // ProtectedRoute expulsava o usuário: dar F5 em /leads mandava pra /login e
  // de lá pro workspace do papel. Só o clique no menu funcionava.
  const [roleLoading, setRoleLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchRole = async (userId: string) => {
    const { data, error } = await supabase.rpc("get_user_role", { _user_id: userId });

    if (error || !data) {
      if (error) console.error("[auth] get_user_role falhou:", error.message);
      setRole(null);
      setUserName("");
      return;
    }

    setRole(data as AppRole);

    const { data: roleData } = await supabase
      .from("user_roles" as any)
      .select("nome")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    setUserName((roleData as any)?.nome || "");
  };

  useEffect(() => {
    let mounted = true;

    const finalizeInit = () => {
      if (!mounted) return;
      initializedRef.current = true;
      setLoading(false);

      const url = new URL(window.location.href);
      if (url.searchParams.get(CACHE_RESET_PARAM) === "1") {
        url.searchParams.delete(CACHE_RESET_PARAM);
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      }
    };

    // `finalize` só é true na resolução do getSession(): o onAuthStateChange
    // dispara INITIAL_SESSION antes da restauração do storage terminar, e
    // finalizar ali deixava loading=false com user=null por um instante — o
    // ProtectedRoute mandava pra /login e de lá pro workspace. Era isso que
    // fazia F5 (ou link direto) perder a página aberta.
    const applySession = (session: Session | null, finalize = true) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);

      if (!u) {
        setRole(null);
        setUserName("");
        if (finalize || initializedRef.current) setRoleLoading(false);
      }

      if (finalize || initializedRef.current) finalizeInit();
    };

    const stallTimeout = window.setTimeout(() => {
      if (!initializedRef.current) {
        console.warn("Auth initialization took too long, finalizing without reset");
        finalizeInit();
      }
    }, 8000);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session, false);
    });

    (async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        applySession(session);
      } catch {
        const resetTriggered = await clearStaleClientStateAndReload();
        if (!resetTriggered) finalizeInit();
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(stallTimeout);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setRole(null);
      setUserName("");
      setRoleLoading(false);
      return;
    }

    setRoleLoading(true);
    (async () => {
      try {
        await fetchRole(user.id);
      } finally {
        if (!cancelled) setRoleLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
    setUserName("");
  };

  return (
    <AuthContext.Provider
      value={{ user, role, userName, loading, roleLoading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
