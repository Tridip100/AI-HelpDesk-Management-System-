import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useState } from "react";
import {
  LayoutDashboard, Ticket, Users, BarChart3,
  LogOut, MessageSquare, Wrench, HeadphonesIcon, BarChart2,
  Brain, Moon, Sun,
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
  const { dark, toggleTheme } = useTheme();
  const location = useLocation();
  const [hovered, setHovered] = useState(false);
  const expanded = hovered;
  const navItems = NAV[user?.role] || NAV.user;
  const shellBg = dark ? "bg-[#07111f] text-slate-100" : "bg-slate-100 text-slate-900";
  const panelBg = dark ? "bg-slate-900/95 border-slate-800 shadow-black/20" : "bg-white/95 border-slate-200";
  const headerBg = dark ? "bg-slate-900/90 border-slate-800" : "bg-white/90 border-slate-200";
  const mutedText = dark ? "text-slate-400" : "text-slate-500";
  const strongText = dark ? "text-white" : "text-slate-900";
  const avatarBg = dark ? "bg-indigo-500/20 text-indigo-200" : "bg-indigo-100 text-indigo-700";
  const buttonNeutral = dark
    ? "border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
    : "border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900";

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${shellBg}`}>
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`border-r flex flex-col shadow-sm transition-all duration-300 ease-in-out flex-shrink-0 ${panelBg} ${expanded ? "w-64" : "w-20"}`}
      >
        <div className={`h-16 border-b flex items-center px-4 gap-3 overflow-hidden ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm shadow-indigo-500/20">
            AI
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <h1 className={`font-bold whitespace-nowrap ${strongText}`}>HelpDesk AI</h1>
              <p className={`text-xs whitespace-nowrap ${mutedText}`}>Support Platform</p>
            </div>
          )}
        </div>

        <div className="flex-1 px-3 py-5">
          {expanded && <p className={`px-3 mb-3 text-xs font-semibold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`}>Navigation</p>}
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
                    active
                      ? dark
                        ? "bg-indigo-500/15 text-indigo-200 border border-indigo-400/20"
                        : "bg-indigo-50 text-indigo-700 border border-indigo-100"
                      : dark
                        ? "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  } ${expanded ? "gap-3 px-4 py-3" : "justify-center px-3 py-3"}`}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {expanded && <span className="font-medium whitespace-nowrap">{item.label}</span>}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className={`border-t p-4 ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <div className={`flex items-center ${expanded ? "gap-3" : "justify-center"} mb-3`}>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold flex-shrink-0 ${avatarBg}`}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            {expanded && (
              <div className="min-w-0">
                <p className={`font-medium truncate ${strongText}`}>{user?.username}</p>
                <p className={`text-xs capitalize ${mutedText}`}>{user?.role}</p>
              </div>
            )}
          </div>
          <button
            onClick={toggleTheme}
            title={dark ? "Light mode" : "Dark mode"}
            className={`mb-2 w-full rounded-xl border transition-all ${buttonNeutral} ${
              expanded ? "px-4 py-2.5 flex items-center gap-2 justify-center text-sm" : "p-3 flex justify-center"
            }`}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {expanded && (dark ? "Light Mode" : "Dark Mode")}
          </button>
          <button
            onClick={logout}
            title="Sign Out"
            className={`w-full rounded-xl border transition-all ${
              dark
                ? "border-slate-700 text-slate-300 hover:bg-red-500/10 hover:border-red-400/30 hover:text-red-300"
                : "border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
            } ${
              expanded ? "px-4 py-2.5 flex items-center gap-2 justify-center text-sm" : "p-3 flex justify-center"
            }`}
          >
            <LogOut size={16} />
            {expanded && "Sign Out"}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className={`h-16 border-b px-8 flex items-center justify-between flex-shrink-0 backdrop-blur ${headerBg}`}>
          <div>
            <h2 className={`text-lg font-semibold ${strongText}`}>Welcome back</h2>
            <p className={`text-sm ${mutedText}`}>Manage your support operations efficiently</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className={`text-sm font-medium ${strongText}`}>{user?.username}</p>
              <p className={`text-xs capitalize ${mutedText}`}>{user?.role}</p>
            </div>
            <div className={`h-10 w-10 rounded-full flex items-center justify-center font-semibold ${avatarBg}`}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
          </div>
        </header>
        <main className={`flex-1 overflow-y-auto p-8 transition-colors duration-300 ${dark ? "bg-[#07111f]" : "bg-slate-100"}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
