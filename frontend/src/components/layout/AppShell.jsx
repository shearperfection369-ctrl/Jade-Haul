import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Map, ClipboardList, Timer, ScanLine, Gauge, Mic,
  Activity, Truck, MessageSquare, Settings, LogOut, Briefcase,
  TrendingUp, AlertTriangle, Users, Plug, DollarSign, Radio
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import JadeMark from "@/components/JadeMark";

const driverNav = [
  { to: "/driver", icon: LayoutDashboard, label: "Command", testid: "nav-driver-dashboard" },
  { to: "/driver/gps", icon: Map, label: "GPS · Split", testid: "nav-driver-gps" },
  { to: "/driver/logs", icon: ClipboardList, label: "ELD Logs", testid: "nav-driver-logs" },
  { to: "/driver/detention", icon: Timer, label: "Detention", testid: "nav-driver-detention" },
  { to: "/driver/scan", icon: ScanLine, label: "Bill Scanner", testid: "nav-driver-scan" },
  { to: "/driver/weigh", icon: Gauge, label: "Weigh Bypass", testid: "nav-driver-weigh" },
  { to: "/driver/jade", icon: Mic, label: "JADE Voice", testid: "nav-driver-jade" },
  { to: "/driver/safety", icon: Activity, label: "Safety", testid: "nav-driver-safety" },
  { to: "/driver/loads", icon: Truck, label: "Load Board", testid: "nav-driver-loads" },
  { to: "/driver/messages", icon: MessageSquare, label: "Messages", testid: "nav-driver-messages" },
  { to: "/driver/dispatch", icon: Radio, label: "Live Dispatch", testid: "nav-driver-dispatch" },
  { to: "/driver/settlements", icon: DollarSign, label: "Settlements", testid: "nav-driver-settlements" },
];

const brokerNav = [
  { to: "/broker", icon: Briefcase, label: "Command", testid: "nav-broker-dashboard" },
  { to: "/broker/quote", icon: TrendingUp, label: "Quote Optimizer", testid: "nav-broker-quote" },
  { to: "/broker/carriers", icon: Users, label: "Carrier Risk", testid: "nav-broker-carriers" },
  { to: "/broker/exceptions", icon: AlertTriangle, label: "Exceptions", testid: "nav-broker-exceptions" },
  { to: "/broker/dispatch", icon: Radio, label: "Live Dispatch", testid: "nav-broker-dispatch" },
  { to: "/broker/settlements", icon: DollarSign, label: "Payouts", testid: "nav-broker-settlements" },
  { to: "/broker/jade", icon: Mic, label: "JADE", testid: "nav-broker-jade" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const items = user?.role === "broker" ? brokerNav : driverNav;

  return (
    <div className="flex h-screen w-screen overflow-hidden text-foreground">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 jade-glass m-3 mr-0 flex flex-col" data-testid="app-sidebar">
        <div className="px-5 py-5 border-b border-border/60">
          <JadeMark size="sm" subtitle={user?.role === "broker" ? "Broker Desk · MPLS" : "Driver Cockpit · MPLS"} />
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {items.map(({ to, icon: Icon, label, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/driver" || to === "/broker"}
              data-testid={testid}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
                  isActive
                    ? "bg-primary/15 text-primary jade-tracing-border"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.6} />
              <span className="truncate">{label}</span>
            </NavLink>
          ))}

          <div className="pt-2 mt-2 border-t border-border/60 space-y-1">
            <NavLink
              to="/integrations"
              data-testid="nav-integrations"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary"
                }`
              }
            >
              <Plug className="w-4 h-4" strokeWidth={1.6} />
              <span>Integrations</span>
              <span className="ml-auto mono text-[9px] px-1.5 py-0.5 rounded"
                style={{ background: "var(--lime)", color: "#0a0f0e" }}>NEW</span>
            </NavLink>
            <NavLink
              to="/settings"
              data-testid="nav-settings"
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary"
                }`
              }
            >
              <Settings className="w-4 h-4" strokeWidth={1.6} />
              <span>Settings · Theme</span>
            </NavLink>
          </div>
        </nav>

        <div className="px-3 py-3 border-t border-border/60 flex items-center gap-3">
          <Avatar className="w-9 h-9 ring-1 ring-primary/40">
            <AvatarImage src={user?.avatar} />
            <AvatarFallback>{user?.name?.[0] || "J"}</AvatarFallback>
          </Avatar>
          <div className="flex-1 leading-tight">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="mono text-[10px] text-muted-foreground">{user?.callsign}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => { logout(); nav("/login"); }}
            data-testid="logout-btn"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-3 pl-3">
        <Outlet />
      </main>
    </div>
  );
}
