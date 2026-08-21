import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface Props {
  children: React.ReactNode;
  allowedRoles: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, loading, roleLoading } = useAuth();

  // Espera TAMBÉM o papel: com só `loading`, existia uma janela de
  // user-carregado/role-nula em que este guard expulsava o usuário pra /login
  // (e de lá pro workspace). Era o motivo de F5 em qualquer rota perder a página.
  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (!role || !allowedRoles.includes(role)) {
    // Redirect to their correct workspace
    if (role === "sdr") return <Navigate to="/sdr" replace />;
    if (role === "closer") return <Navigate to="/closer" replace />;
    if (role === "manager") return <Navigate to="/manager" replace />;
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
