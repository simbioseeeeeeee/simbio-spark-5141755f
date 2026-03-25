import { createContext, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";

export type AppRole = "sdr" | "closer" | "manager";

interface AuthContextType {
  user: User | null;
  role: AppRole | null;
  userName: string;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  userName: "",
  loading: true,
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
  const initializedRef = useRef(false);

  const fetchRole = async (userId: string) => {
    const { data, error } = await supabase.rpc("get_user_role", { _user_id: userId });

    if (!error && data) {
      setRole(data as AppRole);
      const { data: roleData } = await supabase
        .from("user_roles" as any)
        .select("nome")
        .eq("user_id", userId)
        .limit(1)
        .single();

      if (roleData) setUserName((roleData as any).nome || "");
    } else {
      setRole(null);
      setUserName("");
    }
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

    const handlePotentialStall = async () => {
      const resetTriggered = await clearStaleClientStateAndReload();
      if (!resetTriggered) {
        finalizeInit();
      }
    };

    const stallTimeout = window.setTimeout(() => {
      if (!initializedRef.current) {
        // Don't aggressively reset — just finalize loading to unblock the UI
        console.warn("Auth initialization took too long, finalizing without reset");
        finalizeInit();
      }
    }, 8000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      try {
        if (!mounted) return;
        setUser(session?.user ?? null);

        if (session?.user) {
          await fetchRole(session.user.id);
        } else {
          setRole(null);
          setUserName("");
        }
      } finally {
        finalizeInit();
      }
    });

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchRole(session.user.id);
        } else {
          setRole(null);
          setUserName("");
        }
      } catch {
        await handlePotentialStall();
      } finally {
        finalizeInit();
      }
    })();

    return () => {
      mounted = false;
      window.clearTimeout(stallTimeout);
      subscription.unsubscribe();
    };
  }, []);

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
    <AuthContext.Provider value={{ user, role, userName, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
