import { useLocation } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import {
  Crosshair, List, Columns3, BarChart3, LogOut, Building2, Megaphone, CalendarClock, Phone,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: React.ElementType;
}

const SDR_ITEMS: NavItem[] = [
  { title: "Foco de Hoje", url: "/sdr", icon: Crosshair },
  { title: "Explorador", url: "/sdr/explorador", icon: List },
  { title: "Anúncios", url: "/sdr/anuncios", icon: Megaphone },
  { title: "Ligações", url: "/ligacoes", icon: Phone },
  { title: "Follow-ups", url: "/follow-ups", icon: CalendarClock },
];

const CLOSER_ITEMS: NavItem[] = [
  { title: "Pipeline", url: "/closer", icon: Columns3 },
  { title: "Explorador", url: "/closer/explorador", icon: List },
  { title: "Ligações", url: "/ligacoes", icon: Phone },
  { title: "Follow-ups", url: "/follow-ups", icon: CalendarClock },
];

const MANAGER_ITEMS: NavItem[] = [
  { title: "Analytics", url: "/manager", icon: BarChart3 },
  { title: "Cadência SDR", url: "/manager/cadencia", icon: Crosshair },
  { title: "Pipeline Closer", url: "/manager/pipeline", icon: Columns3 },
  { title: "Explorador", url: "/manager/explorador", icon: List },
  { title: "Ligações", url: "/ligacoes", icon: Phone },
  { title: "Follow-ups", url: "/follow-ups", icon: CalendarClock },
];

const ROLE_LABELS: Record<AppRole, string> = {
  sdr: "SDR",
  closer: "Closer",
  manager: "Gerente",
};

const ROLE_COLORS: Record<AppRole, string> = {
  sdr: "bg-primary/15 text-primary",
  closer: "bg-success/15 text-success",
  manager: "bg-warning/15 text-warning",
};

function getNavItems(role: AppRole | null): NavItem[] {
  switch (role) {
    case "sdr": return SDR_ITEMS;
    case "closer": return CLOSER_ITEMS;
    case "manager": return MANAGER_ITEMS;
    default: return [];
  }
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, userName, user, signOut } = useAuth();
  const location = useLocation();
  const items = getNavItems(role);

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Brand */}
        <SidebarGroup>
          <SidebarGroupContent>
            <div className={`flex items-center gap-2.5 px-2 py-3 ${collapsed ? "justify-center" : ""}`}>
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Building2 className="h-4 w-4 text-primary-foreground" />
              </div>
              {!collapsed && <span className="font-bold text-foreground text-sm">Simbiose Sales OS</span>}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Role Badge */}
        {role && !collapsed && (
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="px-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_COLORS[role]}`}>
                  {ROLE_LABELS[role]}
                </span>
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <NavLink to={item.url} end className="hover:bg-muted/50" activeClassName="bg-muted text-primary font-medium">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Notifications for Closer */}
        {role === "closer" && !collapsed && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <NotificationsPanel />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Footer with user info */}
      <SidebarFooter>
        <div className={`px-2 py-3 space-y-2 ${collapsed ? "items-center" : ""}`}>
          {!collapsed && (
            <div className="px-1">
              <p className="text-sm font-medium text-foreground truncate">{userName || user?.email}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={signOut} className={`gap-1.5 text-muted-foreground w-full ${collapsed ? "justify-center px-0" : "justify-start"}`}>
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sair"}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
