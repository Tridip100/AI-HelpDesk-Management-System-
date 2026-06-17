import { useState, useEffect, useRef } from "react";
import client from "../../api/client";

const ROLE_STYLES = {
  user: "bg-blue-100 text-blue-700",
  helpdesk: "bg-indigo-100 text-indigo-700",
  engineer: "bg-emerald-100 text-emerald-700",
  admin: "bg-orange-100 text-orange-700",
};

const getInitials = (u) =>
  u.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2) ||
  u.username?.[0]?.toUpperCase() ||
  "?";

const strengthLabel = (p) => {
  if (!p) return null;
  if (p.length < 6) return { label: "Too short", color: "bg-red-400", width: "20%" };
  if (p.length < 8) return { label: "Weak", color: "bg-orange-400", width: "40%" };
  if (/[A-Z]/.test(p) && /[0-9]/.test(p) && p.length >= 10)
    return { label: "Strong", color: "bg-emerald-500", width: "100%" };
  if (p.length >= 8)
    return { label: "Fair", color: "bg-yellow-400", width: "65%" };
  return null;
};

function PasswordDropdown({ user, onClose, onSave }) {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, []);

  const strength = strengthLabel(pass);
  const canSave = pass.length >= 6;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await onSave(user.id, pass);
    setSaving(false);
  };

  return (
    <div
      className="absolute right-6 z-30 mt-1 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
      style={{ top: "100%" }}
    >
      {/* User info header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {getInitials(user)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {user.full_name || user.username}
          </p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
        </div>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_STYLES[user.role]}`}>
          {user.role}
        </span>
      </div>

      {/* Password input section */}
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          New Password
        </p>

        <div className="relative">
          <input
            ref={inputRef}
            type={show ? "text" : "password"}
            placeholder="Enter new password…"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") onClose();
            }}
            className="w-full bg-white border border-slate-300 rounded-xl pl-3 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            {show ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

        {/* Strength bar */}
        {pass.length > 0 && strength && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                style={{ width: strength.width }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Strength:{" "}
              <span className="font-medium text-slate-600">{strength.label}</span>
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : "Reset Password"}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminUserManagement() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [newRole, setNewRole] = useState("");
  const [resetting, setResetting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    client.get("/admin/users").then((r) => {
      setUsers(r.data);
      setLoading(false);
    });
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!resetting) return;
    const handler = (e) => {
      if (!e.target.closest("[data-pwd-dropdown]")) setResetting(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [resetting]);

  const filtered = users.filter(
    (u) =>
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  const saveRole = async (userId) => {
    setSaving(true);
    try {
      await client.patch(`/admin/users/${userId}`, { role: newRole });
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setEditing(null);
      setMsg("Role updated successfully");
      setTimeout(() => setMsg(""), 2500);
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (userId, newPass) => {
    await client.post(`/admin/users/${userId}/reset-password`, {
      new_password: newPass,
    });
    setResetting(null);
    setMsg("Password reset successfully");
    setTimeout(() => setMsg(""), 2500);
  };

  const toggleActive = async (user) => {
    await client.patch(`/admin/users/${user.id}`, { is_active: !user.is_active });
    setUsers((prev) =>
      prev.map((u) => (u.id === user.id ? { ...u, is_active: !u.is_active } : u))
    );
  };

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">{users.length} users in the system</p>
        </div>

        <div className="flex items-center gap-4">
          {msg && (
            <span className="text-sm text-emerald-600 font-medium bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              ✓ {msg}
            </span>
          )}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[22%]">Name</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[22%]">Email</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[10%]">Status</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[23%]">Role</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[23%]">Password</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="text-center py-16 text-slate-500">Loading users...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-16 text-slate-500">No users found</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors relative">

                  {/* Name */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {getInitials(u)}
                      </div>
                      <div>
                        <p className="text-slate-900 font-medium">{u.full_name || u.username}</p>
                        <p className="text-xs text-slate-400">@{u.username}</p>
                      </div>
                    </div>
                  </td>

                  {/* Email */}
                  <td className="px-6 py-4 text-slate-600">{u.email}</td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <button
                      onClick={() => toggleActive(u)}
                      className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                        u.is_active
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          : "bg-red-100 text-red-700 hover:bg-red-200"
                      }`}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>

                  {/* Role */}
                  <td className="px-6 py-4">
                    {editing === u.id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="user">user</option>
                          <option value="helpdesk">helpdesk</option>
                          <option value="engineer">engineer</option>
                          <option value="admin">admin</option>
                        </select>
                        <button
                          onClick={() => saveRole(u.id)}
                          disabled={saving}
                          className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-slate-500 hover:text-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditing(u.id);
                          setNewRole(u.role);
                          setResetting(null);
                        }}
                        className="group flex items-center gap-2"
                      >
                        <span className={`text-xs font-medium px-3 py-1 rounded-full ${ROLE_STYLES[u.role]}`}>
                          {u.role}
                        </span>
                        <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    )}
                  </td>

                  {/* Password — dropdown trigger */}
                  <td className="px-6 py-4 relative" data-pwd-dropdown>
                    <button
                      onClick={() => {
                        setResetting(resetting === u.id ? null : u.id);
                        setEditing(null);
                      }}
                      className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all ${
                        resetting === u.id
                          ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
                          : "text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border border-transparent"
                      }`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      Change Password
                      <svg
                        className={`w-3.5 h-3.5 transition-transform ${resetting === u.id ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* Dropdown panel */}
                    {resetting === u.id && (
                      <PasswordDropdown
                        user={u}
                        onClose={() => setResetting(null)}
                        onSave={savePassword}
                      />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}