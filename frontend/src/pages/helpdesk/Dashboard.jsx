import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import client from "../../api/client";
import { CATEGORY_ITEMS } from "../../components/ClassificationLegend";
import {
  Search, Brain, Check, UserCheck, Clock,
  FileText, AlertTriangle, RefreshCw,
} from "lucide-react";
import { labelStatus, isOpenStatus, isAssignedStatus, isDoneStatus, isResolvedStatus } from "../../lib/ui";

const CATEGORY_LABELS = CATEGORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.code]: item.label }), {});

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  assigned:    "bg-indigo-50 text-indigo-600 border border-indigo-200",
  escalated:   "bg-red-50 text-red-600 border border-red-200",
  auto_solved: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200",
};
const STATUS_ROW_ACCENT = {
  open:        "hover:border-l-slate-400",
  assigned:    "hover:border-l-blue-400",
  escalated:   "hover:border-l-red-500",
  auto_solved: "hover:border-l-indigo-400",
  resolved:    "hover:border-l-emerald-500",
};
const STATUS_ROW_BG = {
  open:        "hover:bg-slate-50",
  assigned:    "hover:bg-blue-50/50",
  escalated:   "hover:bg-red-50/50",
  auto_solved: "hover:bg-indigo-50/50",
  resolved:    "hover:bg-emerald-50/50",
};
const PRIORITY_STYLES = {
  P1: "bg-red-50 text-red-600 border border-red-200",
  P2: "bg-orange-50 text-orange-600 border border-orange-200",
  P3: "bg-blue-50 text-blue-600 border border-blue-200",
  P4: "bg-slate-100 text-slate-500",
};

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {CATEGORY_LABELS[text] || labelStatus(text)}
    </span>
  );
}

export default function HelpdeskDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets]       = useState([]);
  const [engineers, setEngineers]   = useState([]);
  const [selected, setSelected]     = useState(null);
  const [filter, setFilter]         = useState(searchParams.get("filter") || "all");
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [engineerId, setEngineerId] = useState("");
  const [resolveText, setResolveText] = useState("");
  const [assigning, setAssigning]   = useState(false);
  const [resolving, setResolving]   = useState(false);
  const [digest, setDigest]         = useState(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [msg, setMsg]               = useState({ text: "", type: "" });

  useEffect(() => {
    Promise.all([
      client.get("/tickets/"),
      client.get("/admin/engineers"),
    ]).then(([t, e]) => {
      setTickets(t.data);
      setEngineers(e.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    setFilter(searchParams.get("filter") || "all");
  }, [searchParams]);

  const updateFilter = (key) => {
    setFilter(key);
    if (key === "all") setSearchParams({});
    else setSearchParams({ filter: key });
  };

  const refresh = async () => {
    const r = await client.get("/tickets/");
    setTickets(r.data);
    if (selected) {
      const updated = r.data.find(t => t.id === selected.id);
      setSelected(updated || null);
    }
  };

  const showMsg = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3000);
  };

  const filtered = tickets.filter(t => {
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const matchFilter =
      filter === "all"          ? true :
      filter === "open"         ? isOpenStatus(t.status) :
      filter === "assigned"     ? isAssignedStatus(t.status) :
      filter === "escalated"    ? t.status === "escalated" :
      filter === "resolved"     ? isDoneStatus(t.status) : true;
    const matchCategory = !category || t.category === category;
    const matchPriority = !priority || t.priority === priority;
    const matchSearch = !search ||
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.id?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchCategory && matchPriority && matchSearch;
  });

  const counts = {
    all:          tickets.length,
    ai_solved:    tickets.filter(t => t.status === "auto_solved").length,
    open:         tickets.filter(t => isOpenStatus(t.status)).length,
    assigned:     tickets.filter(t => isAssignedStatus(t.status)).length,
    escalated:    tickets.filter(t => t.status === "escalated").length,
    resolved:     tickets.filter(t => isDoneStatus(t.status)).length,
  };
  const resolvedByEngineer = tickets.filter(t =>
    isResolvedStatus(t.status) && t.resolution_path === "engineer"
  ).length;
  const resolvedByHelpdesk = tickets.filter(t =>
    isResolvedStatus(t.status) && t.resolution_path === "helpdesk"
  ).length;
  const humanResolvedCount = resolvedByEngineer + resolvedByHelpdesk;

  const approve = async () => {
    if (!selected) return;
    try {
      await client.patch(`/tickets/${selected.id}/review`, { status: "open" });
      showMsg("AI card approved");
      await refresh();
    } catch { showMsg("Failed to approve", "error"); }
  };

  const assign = async () => {
    if (!engineerId || !selected) return;
    setAssigning(true);
    try {
      await client.post(`/tickets/${selected.id}/assign`, { engineer_id: engineerId });
      showMsg("Ticket assigned successfully");
      setEngineerId("");
      await refresh();
    } catch { showMsg("Failed to assign", "error"); }
    finally { setAssigning(false); }
  };

  const resolve = async () => {
    if (!selected || !resolveText.trim()) return;
    setResolving(true);
    try {
      await client.post(`/tickets/${selected.id}/resolve`, { resolution_text: resolveText });
      showMsg("Ticket resolved");
      setResolveText("");
      await refresh();
    } catch { showMsg("Failed to resolve", "error"); }
    finally { setResolving(false); }
  };

  const fetchDigest = async () => {
    setLoadingDigest(true);
    try {
      const res = await client.get("/admin/digest?hours=8");
      setDigest(res.data.digest);
    } finally { setLoadingDigest(false); }
  };

  const isResolved = selected && isDoneStatus(selected.status);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ticket Queue</h1>
          <p className="text-sm text-slate-500 mt-0.5">Review AI suggestions and route tickets to engineers</p>
        </div>
        <div className="flex items-center gap-3">
          {msg.text && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${
              msg.type === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
            }`}>
              {msg.text}
            </span>
          )}
          <button
            onClick={refresh}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={fetchDigest}
            disabled={loadingDigest}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-40"
          >
            {loadingDigest ? "Generating..." : "Shift Digest"}
          </button>
        </div>
      </div>

      {/* Digest */}
      {digest && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Shift Handover Digest</p>
            <button onClick={() => setDigest(null)} className="text-xs text-slate-400 hover:text-slate-600">Dismiss</button>
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{digest}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4 mb-6">
        {[
          { key: "all", label: "Total Tickets", value: counts.all, sub: "All tickets", color: "text-slate-900", hover: "hover:border-indigo-300 hover:bg-indigo-50/30" },
          { key: "open", label: "Open", value: counts.open, sub: "Awaiting action", color: "text-amber-600", hover: "hover:border-amber-300 hover:bg-amber-50/30" },
          { key: "assigned", label: "Assigned", value: counts.assigned, sub: "Engineer working on it", color: "text-blue-600", hover: "hover:border-blue-300 hover:bg-blue-50/30" },
          { key: "escalated", label: "Escalated", value: counts.escalated, sub: "SLA breached — urgent", color: "text-red-600", hover: "hover:border-red-300 hover:bg-red-50/30" },
          { key: "resolved", label: "Resolved", value: counts.resolved, sub: `${counts.ai_solved} by AI · ${humanResolvedCount} by human`, color: "text-emerald-600", hover: "hover:border-emerald-300 hover:bg-emerald-50/30" },
        ].map((s, i) => (
          <button
            key={s.label}
            onClick={() => updateFilter(s.key)}
            className={`enter bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-lg ${s.hover}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <p className="text-xs text-slate-500 mb-2">{s.label}</p>
            <p className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</p>
            <p className="text-xs text-slate-400">{s.sub}</p>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        .enter { animation: slideUp 0.4s ease-out backwards; }
      `}</style>

      {/* Filter + Search */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { key: "all",       label: "All" },
          { key: "open",      label: "Open" },
          { key: "assigned",  label: "Assigned" },
          { key: "escalated", label: "Escalated" },
          { key: "resolved",  label: "Resolved" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => updateFilter(f.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
              filter === f.key
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600"
            }`}
          >
            {f.label} ({counts[f.key] ?? 0})
          </button>
        ))}
        <div className="ml-auto relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="bg-white border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 w-48"
            placeholder="Search tickets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-5 gap-5">
        {/* Ticket list */}
        <div className="col-span-3 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ticket</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Conf.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                <tr><td colSpan={4} className="text-center py-16 text-slate-400 text-sm">Loading tickets...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-slate-400 text-sm">No tickets in this view</td></tr>
              ) : filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => { setSelected(t); setEngineerId(""); setResolveText(""); }}
                  className={`cursor-pointer border-l-4 border-l-transparent transition-all duration-200 ${STATUS_ROW_BG[t.status] || "hover:bg-indigo-50/40"} ${STATUS_ROW_ACCENT[t.status] || "hover:border-l-slate-300"} ${
                    selected?.id === t.id ? "bg-indigo-50 border-l-4 border-l-indigo-500" : ""
                  }`}
                >
                  <td className="px-5 py-3.5">
                    <p className="text-slate-800 font-medium truncate max-w-[200px]">{t.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">#{t.id.slice(0,8)}{t.category ? ` · ${t.category}` : ""}</p>
                  </td>
                  <td className="px-4 py-3.5"><Badge text={t.status} styles={STATUS_STYLES} /></td>
                  <td className="px-4 py-3.5"><Badge text={t.priority} styles={PRIORITY_STYLES} /></td>
                  <td className="px-4 py-3.5">
                    {t.ai_confidence != null
                      ? <span className={`text-xs font-semibold ${t.ai_confidence >= 0.7 ? "text-emerald-600" : t.ai_confidence >= 0.5 ? "text-amber-600" : "text-red-500"}`}>
                          {Math.round(t.ai_confidence * 100)}%
                        </span>
                      : <span className="text-slate-300 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        <div className="col-span-2 space-y-4">
          {!selected ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
              <FileText size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">Select a ticket</p>
              <p className="text-xs text-slate-400 mt-1">Click any ticket to view details and take action</p>
            </div>
          ) : (
            <>
              {/* Ticket info */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs text-slate-400 font-mono mb-1">#{selected.id.slice(0,8)}</p>
                    <h3 className="text-sm font-semibold text-slate-800">{selected.title}</h3>
                  </div>
                  {selected.priority === "P1" && (
                    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">
                      <AlertTriangle size={11} /> Critical
                    </span>
                  )}
                </div>

                <div className="flex gap-1.5 mb-3 flex-wrap">
                  <Badge text={selected.status} styles={STATUS_STYLES} />
                  <Badge text={selected.priority} styles={PRIORITY_STYLES} />
                  {selected.category && <Badge text={selected.category} />}
                </div>

                {selected.description && (
                  <p className="text-xs text-slate-500 mb-3 line-clamp-3 leading-relaxed">{selected.description}</p>
                )}

                {selected.created_at && (
                  <p className="text-xs text-slate-400">Created: {new Date(selected.created_at).toLocaleString()}</p>
                )}
              </div>

              {/* AI suggestion */}
              {selected.ai_suggestion && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain size={14} className="text-indigo-500" />
                    <p className="text-xs font-semibold text-slate-700">AI Suggestion</p>
                    {selected.ai_confidence != null && (
                      <span className={`text-xs font-medium ml-auto px-2 py-0.5 rounded-full ${
                        selected.ai_confidence >= 0.7 ? "bg-emerald-50 text-emerald-600" :
                        selected.ai_confidence >= 0.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"
                      }`}>
                        {Math.round(selected.ai_confidence * 100)}% confidence
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-6 leading-relaxed">{selected.ai_suggestion}</p>
                  {!isResolved && (
                    <button
                      onClick={approve}
                      className="w-full mt-3 bg-indigo-600 text-white py-2 rounded-xl text-xs font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Check size={13} /> Approve AI card
                    </button>
                  )}
                </div>
              )}

              {/* Assign to engineer — only if not resolved */}
              {!isResolved && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <UserCheck size={14} className="text-indigo-500" />
                    <p className="text-xs font-semibold text-slate-700">Assign to Engineer</p>
                  </div>
                  {selected.assigned_to && (
                    <p className="text-xs text-slate-500 mb-2">
                      Currently assigned to: <span className="font-medium text-slate-700">{engineers.find(e => e.id === selected.assigned_to)?.full_name || selected.assigned_to.slice(0,8)}</span>
                    </p>
                  )}
                  <select
                    value={engineerId}
                    onChange={e => setEngineerId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-700 mb-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">Select engineer...</option>
                    {engineers.map(e => (
                      <option key={e.id} value={e.id}>{e.full_name || e.username}</option>
                    ))}
                  </select>
                  <button
                    onClick={assign}
                    disabled={assigning || !engineerId}
                    className="w-full bg-slate-800 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-slate-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    <UserCheck size={13} />
                    {assigning ? "Assigning..." : "Assign ticket"}
                  </button>
                </div>
              )}

              {/* Resolve — only if not already resolved */}
              {!isResolved && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={14} className="text-emerald-500" />
                    <p className="text-xs font-semibold text-slate-700">Resolve Ticket</p>
                  </div>
                  <textarea
                    value={resolveText}
                    onChange={e => setResolveText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 h-24 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-200 mb-2.5"
                    placeholder="Describe how this was resolved..."
                  />
                  <button
                    onClick={resolve}
                    disabled={resolving || !resolveText.trim()}
                    className="w-full bg-emerald-600 text-white py-2.5 rounded-xl text-xs font-medium hover:bg-emerald-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    <Check size={13} />
                    {resolving ? "Resolving..." : "Mark as resolved"}
                  </button>
                </div>
              )}

              {/* Show resolution if already resolved */}
              {isResolved && selected.resolution_text && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Check size={14} className="text-emerald-600" />
                    <p className="text-xs font-semibold text-emerald-700">Resolved</p>
                  </div>
                  <p className="text-xs text-slate-600">{selected.resolution_text}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
