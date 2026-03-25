import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const handleResetCache = async () => {
  try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
  try {
    Object.keys(localStorage)
      .filter(k => /supabase|sb-|crm|vite|persist/i.test(k))
      .forEach(k => localStorage.removeItem(k));
  } catch {}
  try { sessionStorage.clear(); } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {}
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(db => db.name && new Promise<void>(r => {
        const req = indexedDB.deleteDatabase(db.name!);
        req.onsuccess = req.onerror = req.onblocked = () => r();
      })));
    }
  } catch {}
  try {
    if (navigator.serviceWorker?.getRegistrations) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch {}
  location.replace('/login?reset=1');
};

export default function Login() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [seedLoading, setSeedLoading] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user && role) {
    if (role === "sdr") return <Navigate to="/sdr" replace />;
    if (role === "closer") return <Navigate to="/closer" replace />;
    if (role === "manager") return <Navigate to="/manager" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      // AuthContext's onAuthStateChange will set user+role → triggers redirect via the if(user && role) check above
      // Use a hard redirect as fallback after a short wait
      setTimeout(() => {
        window.location.href = "/";
      }, 3000);
    } catch (err: any) {
      setError(err.message === "Invalid login credentials" ? "Email ou senha incorretos." : err.message);
      setSubmitting(false);
    }
  };

  const handleSeedUsers = async () => {
    setSeedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-test-users");
      if (error) throw error;
      toast({
        title: "✅ Usuários de teste criados!",
        description: "SDR: sdr@simbiose.com | Closer: closer@simbiose.com | Manager: manager@simbiose.com — Senha: test1234",
      });
    } catch (err: any) {
      toast({ title: "Erro ao criar usuários", description: err.message, variant: "destructive" });
    } finally {
      setSeedLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="h-14 w-14 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Simbiose Sales OS</h1>
          <p className="text-muted-foreground mt-1">Faça login para acessar seu workspace</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Entrar</CardTitle>
            <CardDescription>Use suas credenciais para acessar o sistema</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {submitting ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Seed Test Users */}
        <Card className="border-dashed">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground mb-3 text-center">
              Primeiro acesso? Crie usuários de teste para validar o sistema.
            </p>
            <Button variant="outline" className="w-full gap-2" onClick={handleSeedUsers} disabled={seedLoading}>
              {seedLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {seedLoading ? "Criando..." : "🧪 Criar Usuários de Teste"}
            </Button>
            <div className="mt-3 text-xs text-muted-foreground space-y-1">
              <p><strong>SDR:</strong> sdr@simbiose.com</p>
              <p><strong>Closer:</strong> closer@simbiose.com</p>
              <p><strong>Gerente:</strong> manager@simbiose.com</p>
              <p><strong>Senha:</strong> test1234</p>
            </div>
          </CardContent>
        </Card>

        {/* Reset Cache */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs text-muted-foreground hover:text-destructive"
          onClick={handleResetCache}
        >
          🔄 Resetar cache do app (tela travada?)
        </Button>
      </div>
    </div>
  );
}
