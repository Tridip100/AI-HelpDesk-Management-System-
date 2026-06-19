import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useState } from "react";
import {
  LayoutDashboard, Ticket, Users, BarChart3,
  LogOut, MessageSquare, Wrench, HeadphonesIcon, BarChart2,
  Brain,
} from "lucide-react";

const NAV = {
  admin: [
    { path: "/",                label: "Overview",        icon: LayoutDashboard },
    { path: "/admin/tickets",   label: "All Tickets",     icon: Ticket },
    { path: "/admin/users",     label: "User Management", icon: Users },
    { path: "/admin/analytics", label: "Analytics",       icon: BarChart3 },
    { path: "/admin/learning",  label: "Learning",        icon: Brain },
  ],
  helpdesk: [
    { path: "/",                      label: "Ticket Queue", icon: HeadphonesIcon },
    { path: "/helpdesk/analytics",    label: "Analytics",    icon: BarChart2 },
  ],
  engineer: [
    { path: "/", label: "My Tickets", icon: Wrench },
  ],
  user: [
    { path: "/",             label: "Dashboard",      icon: LayoutDashboard },
    { path: "/user/chat",    label: "Live Chat",      icon: MessageSquare },
    { path: "/user/voice",   label: "Voice Assistant",icon: HeadphonesIcon },
    { path: "/user/email",   label: "Create Ticket",  icon: Ticket },
    { path: "/user/tickets", label: "My Tickets",     icon: Wrench },
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const expanded = hovered;
  const navItems = NAV[user?.role] || NAV.user;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`bg-white border-r border-slate-200 flex flex-col shadow-sm transition-all duration-300 ease-in-out flex-shrink-0 ${expanded ? "w-64" : "w-20"}`}
      >
        <div className="h-16 border-b border-slate-200 flex items-center px-4 gap-3 overflow-hidden">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            AI
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-slate-900 whitespace-nowrap">HelpDesk AI</h1>
              <p className="text-xs text-slate-500 whitespace-nowrap">Support Platform</p>
            </div>
          )}
        </div>

        <div className="flex-1 px-3 py-5">
          {expanded && <p className="px-3 mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Navigation</p>}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = location.pathname === item.path;
              const Icon   = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.path}
                  title={!expanded ? item.label : ""}
                  className={`flex items-center rounded-xl transition-all duration-200 ${
                    active ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  } ${expanded ? "gap-3 px-4 py-3" : "justify-center px-3 py-3"}`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {expanded && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 p-4">
          <div className={`flex items-center ${expanded ? "gap-3" : "justify-center"} mb-3`}>
            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold flex-shrink-0">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className="font-medium text-slate-900 truncate">{user?.username}</p>
                <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            className={`w-full rounded-xl border border-slate-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-all text-slate-600 ${
              expanded ? "px-4 py-2.5 flex items-center gap-2 justify-center text-sm" : "p-3 flex justify-center"
            }`}
          >
            <LogOut size={16} />
            {expanded && "Sign Out"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Welcome back</h2>
            <p className="text-sm text-slate-500">Manage your support operations efficiently</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-slate-900">{user?.username}</p>
              <p className="text-xs text-slate-500 capitalize">{user?.role}</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">
              {user?.username?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
