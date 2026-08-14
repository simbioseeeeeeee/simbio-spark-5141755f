import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import SdrWorkspace from "./pages/SdrWorkspace";
import CloserWorkspace from "./pages/CloserWorkspace";
import ManagerWorkspace from "./pages/ManagerWorkspace";
import FollowUps from "./pages/FollowUps";
import Ligacoes from "./pages/Ligacoes";
import MetasComercial from "./pages/MetasComercial";
import Conversas from "./pages/Conversas";
import SocialSelling from "./pages/SocialSelling";
import Plano from "./pages/Plano";
import Criativos from "./pages/Criativos";
import LeadsOverhaul from "./pages/LeadsOverhaul";
import DashboardOverhaul from "./pages/DashboardOverhaul";
import Campanhas from "./pages/Campanhas";
import ManagerSistema from "./pages/ManagerSistema";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/sdr" element={<ProtectedRoute allowedRoles={["sdr", "manager"]}><SdrWorkspace /></ProtectedRoute>} />
            <Route path="/sdr/explorador" element={<ProtectedRoute allowedRoles={["sdr", "manager"]}><SdrWorkspace /></ProtectedRoute>} />
            <Route path="/sdr/anuncios" element={<ProtectedRoute allowedRoles={["sdr", "manager"]}><SdrWorkspace /></ProtectedRoute>} />
            <Route path="/closer" element={<ProtectedRoute allowedRoles={["closer", "manager"]}><CloserWorkspace /></ProtectedRoute>} />
            <Route path="/closer/explorador" element={<ProtectedRoute allowedRoles={["closer", "manager"]}><CloserWorkspace /></ProtectedRoute>} />
            <Route path="/manager" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerWorkspace /></ProtectedRoute>} />
            <Route path="/manager/cadencia" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerWorkspace /></ProtectedRoute>} />
            <Route path="/manager/pipeline" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerWorkspace /></ProtectedRoute>} />
            <Route path="/manager/explorador" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerWorkspace /></ProtectedRoute>} />
            <Route path="/manager/sistema" element={<ProtectedRoute allowedRoles={["manager"]}><ManagerSistema /></ProtectedRoute>} />
            <Route path="/follow-ups" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><FollowUps /></ProtectedRoute>} />
            <Route path="/ligacoes" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><Ligacoes /></ProtectedRoute>} />
            <Route path="/leads" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><LeadsOverhaul /></ProtectedRoute>} />
            <Route path="/campanhas" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><Campanhas /></ProtectedRoute>} />
            <Route path="/criativos" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><Criativos /></ProtectedRoute>} />
            <Route path="/plano" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><Plano /></ProtectedRoute>} />
            <Route path="/social-selling" element={<ProtectedRoute allowedRoles={["sdr", "manager"]}><SocialSelling /></ProtectedRoute>} />
            <Route path="/conversas" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><Conversas /></ProtectedRoute>} />
            <Route path="/metas" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><MetasComercial /></ProtectedRoute>} />
            <Route path="/dashboard" element={<ProtectedRoute allowedRoles={["sdr", "closer", "manager"]}><DashboardOverhaul /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
