import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  AlertCircle,
  Activity,
  BarChart3,
  Settings,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/unallocated", icon: AlertCircle, label: "Unallocated" },
  { to: "/focus", icon: Activity, label: "Focus Score" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/setup", icon: Settings, label: "Setup" },
];

export default function AppSidebar() {
  const location = useLocation();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <Activity className="h-6 w-6 text-sidebar-primary" />
        <span className="text-lg font-bold tracking-tight text-sidebar-primary-foreground">
          TimeTracker
        </span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <p className="text-xs text-sidebar-foreground/50">GSuite Time Tracker</p>
      </div>
    </aside>
  );
}
