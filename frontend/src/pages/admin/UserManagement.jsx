import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import client from "../../api/client";
import { isDoneStatus, labelStatus } from "../../lib/ui";

const ROLE_STYLES = {
  user:     "bg-blue-50 text-blue-600 border border-blue-200",
  helpdesk: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  engineer: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  admin:    "bg-orange-50 text-orange-600 border border-orange-200",
};

const getInitials = (u) =>
  u.full_name?.split(" ").map(n => n[0]).join("").slice(0, 2) ||
  u.username?.[0]?.toUpperCase() || "?";

const displayUserName = (value, users = []) => {
  if (!value) return "Unassigned";
  const user = users.find(u => u.id === value || u.username === value || u.email === value);
  return user?.full_name || user?.username || String(value).slice(0, 12);
};

const minutesBetween = (start, end) => {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.round(diff / 60000);
};

const formatMinutes = (minutes) => {
  if (minutes == null) return "Pending";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

const helpdeskAssignmentEvent = (ticket, user) =>
  ticket.events?.find(e => {
    const actor = e.actor_label?.toLowerCase() || "";
    return ["assigned", "reassigned", "helpdesk_reviewed"].includes(e.action) && (
      e.actor_id === user.id ||
      actor.includes(user.username?.toLowerCase() || "___") ||
      actor.includes(user.full_name?.toLowerCase() || "___")
    );
  });

const strengthLabel = (p) => {
  if (!p) return null;
  if (p.length < 6)  return { label: "Too short", color: "bg-red-400",    width: "20%" };
  if (p.length < 8)  return { label: "Weak",      color: "bg-orange-400", width: "40%" };
  if (/[A-Z]/.test(p) && /[0-9]/.test(p) && p.length >= 10)
                     return { label: "Strong",    color: "bg-emerald-500", width: "100%" };
  if (p.length >= 8) return { label: "Fair",      color: "bg-yellow-400", width: "65%" };
  return null;
};

function PasswordDropdown({ user, onClose, onSave }) {
  const [pass, setPass]       = useState("");
  const [show, setShow]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const inputRef              = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const strength = strengthLabel(pass);
  const canSave  = pass.length >= 6;

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
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
          {getInitials(user)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{user.full_name || user.username}</p>
          <p className="text-xs text-slate-400 truncate">{user.email}</p>
        </div>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${ROLE_STYLES[user.role]}`}>{user.role}</span>
      </div>
      <div className="px-4 py-4 space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">New Password</p>
        <div className="relative">
          <input
            ref={inputRef}
            type={show ? "text" : "password"}
            placeholder="Enter new password…"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") onClose(); }}
            className="w-full bg-white border border-slate-300 rounded-xl pl-3 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            {show ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
        {pass.length > 0 && strength && (
          <div className="space-y-1">
            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
            </div>
            <p className="text-xs text-slate-400">Strength: <span className="font-medium text-slate-600">{strength.label}</span></p>
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : "Reset Password"}
          </button>
          <button onClick={onClose} className="px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-100 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ username: "", email: "", full_name: "", password: "", role: "user", department: "" });
  const [show, setShow] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const strength = strengthLabel(form.password);
  const canCreate = form.username.trim() && form.email.trim() && form.full_name.trim() && form.password.length >= 6;

  const handleCreate = async () => {
    if (!canCreate) return;
    setError("");
    setCreating(true);
    try {
      const res = await client.post("/admin/users", form);
      onCreated(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Create New User</h2>
            <p className="text-xs text-slate-500 mt-0.5">Add a new account to the system</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-2 rounded-xl">{error}</div>
          )}

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Username</p>
            <input
              ref={inputRef}
              value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value })}
              placeholder="e.g. john.doe"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Full Name</p>
            <input
              value={form.full_name}
              onChange={e => setForm({ ...form, full_name: e.target.value })}
              placeholder="e.g. John Doe"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Email</p>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="e.g. john@company.com"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Role</p>
            <select
              value={form.role}
              onChange={e => setForm({ ...form, role: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="user">User</option>
              <option value="helpdesk">Helpdesk</option>
              <option value="engineer">Engineer</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Department</p>
            <input
              value={form.department}
              onChange={e => setForm({ ...form, department: e.target.value })}
              placeholder="e.g. Engineering, Sales, IT"
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-1.5">Password</p>
            <div className="relative">
              <input
                type={show ? "text" : "password"}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="Min 6 characters"
                className="w-full bg-white border border-slate-300 rounded-xl pl-3 pr-10 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {show ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
            {form.password.length > 0 && strength && (
              <div className="space-y-1 mt-2">
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strength.color}`} style={{ width: strength.width }} />
                </div>
                <p className="text-xs text-slate-400">Strength: <span className="font-medium text-slate-600">{strength.label}</span></p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate || creating}
            className="flex-1 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl transition-colors"
          >
            {creating ? "Creating…" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserDetailsModal({ user, users, tickets, onClose }) {
  if (!user) return null;

  const raised = tickets.filter(t => t.created_by === user.id || t.created_by_user?.id === user.id);
  const assigned = tickets.filter(t => t.assigned_to === user.id || t.assigned_to_user?.id === user.id);
  const raisedSolved = raised.filter(t => isDoneStatus(t.status));
  const raisedUnresolved = raised.filter(t => !isDoneStatus(t.status));
  const assignedSolved = assigned.filter(t => isDoneStatus(t.status));
  const assignedUnresolved = assigned.filter(t => !isDoneStatus(t.status));
  const assignedByHelpdesk = tickets.filter(t =>
    t.assigned_by === user.id ||
    t.assigned_by_user?.id === user.id ||
    t.helpdesk_id === user.id ||
    t.reviewed_by === user.id ||
    t.routed_by === user.id ||
    t.assigned_by_username === user.username ||
    Boolean(helpdeskAssignmentEvent(t, user))
  );
  const helpdeskResponseTimes = assignedByHelpdesk
    .map(t => minutesBetween(t.created_at, t.assigned_at || t.reviewed_at || t.first_response_at || helpdeskAssignmentEvent(t, user)?.created_at))
    .filter(v => v !== null);
  const avgHelpdeskResponse = helpdeskResponseTimes.length
    ? Math.round(helpdeskResponseTimes.reduce((sum, v) => sum + v, 0) / helpdeskResponseTimes.length)
    : null;
  const assignedWithinTime = assignedByHelpdesk.filter(t => {
    if (typeof t.assigned_within_sla === "boolean") return t.assigned_within_sla;
    const actionAt = t.assigned_at || t.reviewed_at || helpdeskAssignmentEvent(t, user)?.created_at;
    if (t.assignment_due_at && actionAt) return new Date(actionAt) <= new Date(t.assignment_due_at);
    return !t.sla_breached;
  });
  const helpdeskNotSolved = assignedByHelpdesk.filter(t => !isDoneStatus(t.status));

  const statCards = user.role === "user" ? [
    { label: "Problems Raised", value: raised.length, color: "text-blue-600" },
    { label: "Solved", value: raisedSolved.length, color: "text-emerald-600" },
    { label: "Not Solved", value: raisedUnresolved.length, color: "text-amber-600" },
  ] : user.role === "helpdesk" ? [
    { label: "Assigned", value: assignedByHelpdesk.length, color: "text-indigo-600" },
    { label: "Within Time", value: assignedWithinTime.length, color: "text-emerald-600" },
    { label: "Not Solved", value: helpdeskNotSolved.length, color: "text-amber-600" },
    { label: "Avg Reaction", value: formatMinutes(avgHelpdeskResponse), color: "text-blue-600" },
  ] : [
    { label: "Tickets Assigned", value: assigned.length, color: "text-indigo-600" },
    { label: "Solved", value: assignedSolved.length, color: "text-emerald-600" },
    { label: "Not Solved", value: assignedUnresolved.length, color: "text-amber-600" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100 flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-base font-bold flex-shrink-0">
            {getInitials(user)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-slate-900 truncate">{user.full_name || user.username}</h2>
            <p className="text-sm text-slate-500 truncate">{user.email}</p>
            <div className="flex gap-2 flex-wrap mt-3">
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${ROLE_STYLES[user.role]}`}>{user.role}</span>
              <span className="text-xs font-medium px-3 py-1 rounded-full bg-slate-100 text-slate-600">{user.department || "Unassigned department"}</span>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${user.is_active ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {user.is_active ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-4 gap-4">
          {statCards.map(s => (
            <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
              <p className={`text-3xl font-bold mt-2 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          {user.role === "user" && (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Raised Problems</p>
              {raised.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">No raised tickets yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                  {raised.map(t => (
                    <div key={t.id} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                        <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${isDoneStatus(t.status) ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-amber-50 text-amber-600 border border-amber-200"}`}>
                          {isDoneStatus(t.status) ? "Solved" : "Not solved"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Engineer: {t.assigned_to_user?.full_name || displayUserName(t.assigned_to, users)} · {t.priority} · {new Date(t.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {user.role === "helpdesk" && (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Assignment Performance</p>
              {assignedByHelpdesk.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">No assignment data linked to this helpdesk user yet.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl">
                  {assignedByHelpdesk.map(t => {
                    const event = helpdeskAssignmentEvent(t, user);
                    const actionAt = t.assigned_at || t.reviewed_at || t.first_response_at || event?.created_at;
                    const reaction = minutesBetween(t.created_at, actionAt);
                    const withinTime = typeof t.assigned_within_sla === "boolean"
                      ? t.assigned_within_sla
                      : t.assignment_due_at && actionAt
                        ? new Date(actionAt) <= new Date(t.assignment_due_at)
                        : !t.sla_breached;
                    return (
                      <div key={t.id} className="px-4 py-3 border-b border-slate-100 last:border-b-0">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${isDoneStatus(t.status) ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-amber-50 text-amber-600 border border-amber-200"}`}>
                            {isDoneStatus(t.status) ? "Solved" : "Not solved"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Assigned to {t.assigned_to_user?.full_name || displayUserName(t.assigned_to, users)} · reaction {formatMinutes(reaction)} · {withinTime ? "within time" : "late"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {user.role === "engineer" && (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Engineer Performance</p>
              {assigned.length === 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">No assigned tickets yet.</p>
              ) : (
            <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl">
              {assigned.slice(0, 8).map(t => (
                <div key={t.id} className="px-4 py-3 border-b border-slate-100 last:border-b-0 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                    <p className="text-xs text-slate-400">{t.priority} · {new Date(t.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-shrink-0">{labelStatus(t.status)}</span>
                </div>
              ))}
            </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminUserManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers]       = useState([]);
  const [tickets, setTickets]   = useState([]);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(null);
  const [newRole, setNewRole]   = useState("");
  const [roleFilter, setRoleFilter] = useState(searchParams.get("role") || "all");
  const [deptFilter, setDeptFilter] = useState(searchParams.get("department") || "all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    Promise.all([
      client.get("/admin/users"),
      client.get("/tickets/"),
    ]).then(([u, t]) => { setUsers(u.data); setTickets(t.data); setLoading(false); });
  }, []);

  useEffect(() => {
    setRoleFilter(searchParams.get("role") || "all");
    setDeptFilter(searchParams.get("department") || "all");
  }, [searchParams]);

  useEffect(() => {
    const requested = searchParams.get("user");
    if (!requested || users.length === 0) return;
    const match = users.find(u => u.id === requested || u.username === requested);
    if (match) setSelectedUser(match);
  }, [searchParams, users]);

  useEffect(() => {
    if (!resetting) return;
    const handler = e => { if (!e.target.closest("[data-pwd-dropdown]")) setResetting(null); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [resetting]);

  const departments = [...new Set(users.map(u => u.department || "Unassigned").filter(Boolean))].sort();

  const updateFilters = (next) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(next).forEach(([key, value]) => {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    });
    params.delete("user");
    setSearchParams(params);
  };

  const filtered = users.filter(u => {
    const text = search.toLowerCase();
    const matchesSearch =
      u.username?.toLowerCase().includes(text) ||
      u.email?.toLowerCase().includes(text) ||
      u.full_name?.toLowerCase().includes(text) ||
      u.department?.toLowerCase().includes(text);
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    const matchesDept = deptFilter === "all" || (u.department || "Unassigned") === deptFilter;
    return matchesSearch && matchesRole && matchesDept;
  });

  const showMsg = (text) => { setMsg(text); setTimeout(() => setMsg(""), 2500); };

  const saveRole = async (userId) => {
    setSaving(true);
    try {
      await client.patch(`/admin/users/${userId}`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      setEditing(null);
      showMsg("Role updated successfully");
    } finally { setSaving(false); }
  };

  const savePassword = async (userId, newPass) => {
    await client.post(`/admin/users/${userId}/reset-password`, { new_password: newPass });
    setResetting(null);
    showMsg("Password reset successfully");
  };

  const toggleActive = async (user) => {
    await client.patch(`/admin/users/${user.id}`, { is_active: !user.is_active });
    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
  };

  const handleUserCreated = (newUser) => {
    setUsers(prev => [...prev, newUser]);
    setShowCreate(false);
    showMsg(`User "${newUser.username}" created successfully`);
  };

  // role counts for stat cards
  const roleCounts = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc; }, {});

  return (
    <div className="w-full">
      <UserDetailsModal user={selectedUser} users={users} tickets={tickets} onClose={() => setSelectedUser(null)} />
      {showCreate && <CreateUserModal onClose={() => setShowCreate(false)} onCreated={handleUserCreated} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
          <p className="text-sm text-slate-500 mt-1">{users.length} users in the system</p>
        </div>
        <div className="flex items-center gap-3">
          {msg && (
            <span className="text-sm text-emerald-600 font-medium bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">✓ {msg}</span>
          )}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-72"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Create User
          </button>
        </div>
      </div>

      {/* Role stat cards with hover effects */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Users",     role: "user",     color: "text-blue-600",    hoverBorder: "hover:border-blue-300",    hoverBg: "hover:bg-blue-50/30" },
          { label: "Helpdesk",  role: "helpdesk", color: "text-indigo-600",  hoverBorder: "hover:border-indigo-300",  hoverBg: "hover:bg-indigo-50/30" },
          { label: "Engineers", role: "engineer", color: "text-emerald-600", hoverBorder: "hover:border-emerald-300", hoverBg: "hover:bg-emerald-50/30" },
          { label: "Admins",    role: "admin",    color: "text-orange-600",  hoverBorder: "hover:border-orange-300",  hoverBg: "hover:bg-orange-50/30" },
        ].map(s => (
          <button key={s.role}
            onClick={() => updateFilters({ role: roleFilter === s.role ? "all" : s.role })}
            className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
                        text-left
                        transition-all duration-200 hover:scale-[1.03] hover:shadow-lg
                        ${roleFilter === s.role ? "ring-2 ring-indigo-500 border-indigo-200" : ""}
                        ${s.hoverBorder} ${s.hoverBg}`}
          >
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className={`text-3xl font-bold mt-2 ${s.color}`}>{roleCounts[s.role] || 0}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <select
          value={roleFilter}
          onChange={e => updateFilters({ role: e.target.value })}
          className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All roles</option>
          <option value="user">Users</option>
          <option value="helpdesk">Helpdesk</option>
          <option value="engineer">Engineers</option>
          <option value="admin">Admins</option>
        </select>
        <select
          value={deptFilter}
          onChange={e => updateFilters({ department: e.target.value })}
          className="bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        {(roleFilter !== "all" || deptFilter !== "all") && (
          <button onClick={() => updateFilters({ role: "all", department: "all" })} className="text-sm font-medium text-slate-500 hover:text-indigo-600 px-3 py-2">
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-visible">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[22%]">Name</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[22%]">Email</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[14%]">Department</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[10%]">Status</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[16%]">Role</th>
              <th className="text-left px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[16%]">Password</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-16 text-slate-500">Loading users...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-16 text-slate-500">No users found</td></tr>
            ) : filtered.map(u => (
              <tr key={u.id} onClick={() => setSelectedUser(u)} className="hover:bg-slate-50 transition-colors relative group cursor-pointer">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold flex-shrink-0
                                    transition-all duration-200 group-hover:scale-110 group-hover:shadow-sm">
                      {getInitials(u)}
                    </div>
                    <div>
                      <p className="text-slate-900 font-medium group-hover:text-indigo-700 transition-colors">{u.full_name || u.username}</p>
                      <p className="text-xs text-slate-400">@{u.username}</p>
                    </div>
                  </div>
                </td>

                <td className="px-6 py-4 text-slate-600">{u.email}</td>

                <td className="px-6 py-4 text-slate-600">{u.department || "Unassigned"}</td>

                <td className="px-6 py-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleActive(u); }}
                    className={`text-xs font-medium px-3 py-1 rounded-full transition-all duration-200 hover:scale-105 ${
                      u.is_active
                        ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                        : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                    }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </button>
                </td>

                <td className="px-6 py-4">
                  {editing === u.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={newRole}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setNewRole(e.target.value)}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="user">user</option>
                        <option value="helpdesk">helpdesk</option>
                        <option value="engineer">engineer</option>
                        <option value="admin">admin</option>
                      </select>
                      <button onClick={(e) => { e.stopPropagation(); saveRole(u.id); }} disabled={saving}
                        className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        Save
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditing(null); }} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={(e) => { e.stopPropagation(); setEditing(u.id); setNewRole(u.role); setResetting(null); }}
                      className="group/role flex items-center gap-2">
                      <span className={`text-xs font-medium px-3 py-1 rounded-full transition-all duration-200 hover:scale-105 ${ROLE_STYLES[u.role]}`}>
                        {u.role}
                      </span>
                      <svg className="w-3.5 h-3.5 text-slate-300 group-hover/role:text-indigo-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  )}
                </td>

                <td className="px-6 py-4 relative" data-pwd-dropdown>
                  <button
                    onClick={(e) => { e.stopPropagation(); setResetting(resetting === u.id ? null : u.id); setEditing(null); }}
                    className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
                      resetting === u.id
                        ? "bg-indigo-50 text-indigo-600 border border-indigo-200"
                        : "text-slate-500 hover:text-indigo-600 hover:bg-slate-100 border border-transparent hover:scale-105"
                    }`}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Change Password
                    <svg className={`w-3.5 h-3.5 transition-transform ${resetting === u.id ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="6 9 12 15 18 9"/>
                    </svg>
                  </button>
                  {resetting === u.id && (
                    <PasswordDropdown user={u} onClose={() => setResetting(null)} onSave={savePassword} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
