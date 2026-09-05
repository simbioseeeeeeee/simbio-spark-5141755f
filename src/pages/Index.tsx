import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function Index() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role === "sdr") return <Navigate to="/sdr" replace />;
  if (role === "closer") return <Navigate to="/closer" replace />;
  if (role === "manager") return <Navigate to="/manager/pipeline" replace />;

  return <Navigate to="/login" replace />;
}
