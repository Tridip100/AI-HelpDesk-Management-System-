import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import client from "../../api/client";
import { CATEGORY_ITEMS } from "../../components/ClassificationLegend";
import { labelStatus, isOpenStatus, isAssignedStatus, isAutoSolvedStatus, isResolvedStatus, isDoneStatus } from "../../lib/ui";

const CATEGORY_CODES = new Set(CATEGORY_ITEMS.map(item => item.code));

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  assigned:    "bg-purple-50 text-purple-600 border border-purple-200",
  escalated:   "bg-red-50 text-red-600 border border-red-200",
  auto_solved: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200",
};

const PRIORITY_STYLES = {
  P1: "bg-red-50 text-red-600 border border-red-200",
  P2: "bg-orange-50 text-orange-600 border border-orange-200",
  P3: "bg-blue-50 text-blue-600 border border-blue-200",
  P4: "bg-slate-100 text-slate-500",
};

const STATUS_ROW_ACCENT = {
  open:        "hover:border-l-slate-400",
  assigned:    "hover:border-l-purple-400",
  escalated:   "hover:border-l-red-500",
  auto_solved: "hover:border-l-indigo-400",
  resolved:    "hover:border-l-emerald-500",
};

const STATUS_ROW_BG = {
  open:        "hover:bg-slate-50",
  assigned:    "hover:bg-purple-50/50",
  escalated:   "hover:bg-red-50/50",
  auto_solved: "hover:bg-indigo-50/50",
  resolved:    "hover:bg-emerald-50/50",
};

const FILTERS = [
  { key: "all",         label: "All" },
  { key: "open",        label: "Open" },
  { key: "assigned",    label: "Assigned" },
  { key: "escalated",   label: "Escalated" },
  { key: "auto_solved", label: "AI Solved" },
  { key: "resolved",    label: "Resolved" },
];

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {labelStatus(text)}
    </span>
  );
}

const normalizeCategory = (ticket) => {
  const raw = typeof ticket.category === "object" ? ticket.category?.value : ticket.category;
  const eventNote = ticket.events
    ?.map(e => e.notes || "")
    .find(note => /category:\s*([a-z_]+)/i.test(note));
  const fromEvent = eventNote?.match(/category:\s*([a-z_]+)/i)?.[1];
  const category = String(raw || fromEvent || "other").toLowerCase();
  return CATEGORY_CODES.has(category) ? category : "other";
};

const getAuditColor = (action) => {
  const a = action?.toLowerCase() || "";
  if (a.includes("created"))  return "bg-green-50 border-green-400";
  if (a.includes("assigned"))  return "bg-blue-50 border-blue-400";
  if (a.includes("sla"))       return "bg-red-50 border-red-500";
  if (a.includes("escalated")) return "bg-orange-50 border-orange-500";
  if (a.includes("resolved"))  return "bg-emerald-50 border-emerald-500";
  if (a.includes("closed"))    return "bg-slate-50 border-slate-400";
  return "bg-indigo-50 border-indigo-300";
};

const getAuditIcon = (action) => {
  const a = action?.toLowerCase() || "";
  if (a.includes("created"))  return "🟢";
  if (a.includes("assigned"))  return "🔵";
  if (a.includes("sla"))       return "🚨";
  if (a.includes("escalated")) return "⚠️";
  if (a.includes("resolved"))  return "✅";
  if (a.includes("closed"))    return "📦";
  return "📌";
};

/* ── Ticket Detail Modal ── */
function TicketModal({ ticket, audit, onClose }) {
  if (!ticket) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-base leading-snug">{ticket.title}</p>
            <p className="text-xs text-slate-400 font-mono mt-1">#{ticket.id?.slice(0, 8)} · {new Date(ticket.created_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Badges */}
        <div className="px-6 py-3 flex gap-2 flex-wrap border-b border-slate-100 bg-slate-50">
          {ticket.category && <Badge text={ticket.category} />}
          <Badge text={ticket.priority} styles={PRIORITY_STYLES} />
          <Badge text={ticket.status} styles={STATUS_STYLES} />
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${ticket.sla_breached ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>
            {ticket.sla_breached ? "SLA Breached" : "Within SLA"}
          </span>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[55vh] overflow-y-auto">
          {ticket.description && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Problem Description</p>
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">{ticket.description}</p>
            </div>
          )}
          {ticket.ai_suggestion && (
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" /> AI Recommendation
              </p>
              <p className="text-sm text-indigo-800 leading-relaxed bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">{ticket.ai_suggestion}</p>
            </div>
          )}
          {ticket.resolution_text && (
            <div>
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Resolution
              </p>
              <p className="text-sm text-emerald-800 leading-relaxed bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">{ticket.resolution_text}</p>
            </div>
          )}

          {/* Audit Trail inside modal */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Audit Trail</p>
            <div className="space-y-2">
              {audit.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No audit events</p>
              ) : audit.map(e => (
                <div key={e.id} className={`rounded-xl p-3 border-l-4 ${getAuditColor(e.action)}`}>
                  <p className="font-medium text-slate-900 text-sm">{getAuditIcon(e.action)} {e.action}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{e.actor} · {new Date(e.timestamp).toLocaleString()}</p>
                  {e.notes && <p className="text-xs text-slate-600 mt-1">{e.notes}</p>}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminAllTickets() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets]   = useState([]);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [audit, setAudit]       = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    client.get("/tickets/").then(r => { setTickets(r.data); setLoading(false); });
  }, []);

  useEffect(() => {
    setActiveFilter(searchParams.get("filter") || "all");
  }, [searchParams]);

  const dateInRange = (value, start, end) => {
    if (!value || !start) return true;
    const created = new Date(value);
    const from = new Date(`${start}T00:00:00`);
    const to = new Date(`${end || start}T23:59:59.999`);
    return created >= from && created <= to;
  };

  const searched = tickets.filter(t =>
    t.title?.toLowerCase().includes(search.toLowerCase()) ||
    t.id?.toLowerCase().includes(search.toLowerCase()) ||
    t.category?.toLowerCase().includes(search.toLowerCase())
  );

  const urlFiltered = searched.filter(t => {
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const category = searchParams.get("category");
    const priority = searchParams.get("priority");
    const assignedTo = searchParams.get("assigned_to");
    const resolution = searchParams.get("resolution");

    if (!dateInRange(t.created_at, start, end)) return false;
    if (category && normalizeCategory(t) !== category) return false;
    if (priority && t.priority !== priority) return false;
    if (assignedTo && t.assigned_to !== assignedTo && t.assigned_to_user?.id !== assignedTo) return false;
    if (resolution === "ai" && !isAutoSolvedStatus(t.status)) return false;
    if (resolution === "manual" && !isResolvedStatus(t.status)) return false;
    if (resolution === "engineer" && !(isResolvedStatus(t.status) && t.resolution_path === "engineer")) return false;
    if (resolution === "helpdesk" && !(isResolvedStatus(t.status) && t.resolution_path === "helpdesk")) return false;
    return true;
  });

  const filtered = activeFilter === "all"      ? urlFiltered
    : activeFilter === "open"                  ? urlFiltered.filter(t => isOpenStatus(t.status))
    : activeFilter === "assigned"              ? urlFiltered.filter(t => isAssignedStatus(t.status))
    : activeFilter === "resolved"              ? urlFiltered.filter(t => isDoneStatus(t.status))
    : urlFiltered.filter(t => t.status === activeFilter);

  const counts = FILTERS.reduce((acc, f) => {
    const base = urlFiltered;
    if (f.key === "all")              acc[f.key] = base.length;
    else if (f.key === "open")        acc[f.key] = base.filter(t => isOpenStatus(t.status)).length;
    else if (f.key === "assigned")    acc[f.key] = base.filter(t => isAssignedStatus(t.status)).length;
    else if (f.key === "resolved")    acc[f.key] = base.filter(t => isDoneStatus(t.status)).length;
    else acc[f.key] = base.filter(t => t.status === f.key).length;
    return acc;
  }, {});

  const clearUrlFilters = () => {
    setSearchParams(activeFilter === "all" ? {} : { filter: activeFilter });
  };

  const drilldownLabel = searchParams.get("label");

  const openTicket = async (ticket) => {
    setSelected(ticket);
    setAudit([]);
    try {
      const res = await client.get(`/admin/tickets/${ticket.id}/audit`);
      setAudit(res.data);
    } catch {}
  };

  return (
    <>
      <TicketModal ticket={selected} audit={audit} onClose={() => setSelected(null)} />

      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">All Tickets</h1>
            <p className="text-sm text-slate-500 mt-1">
              {filtered.length} shown from {tickets.length} total tickets{drilldownLabel ? ` · ${drilldownLabel}` : ""}
            </p>
          </div>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              className="bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-80"
              placeholder="Search tickets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {drilldownLabel && (
          <div className="mb-5 flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
            <p className="text-sm text-indigo-700 font-medium">Filtered by {drilldownLabel}</p>
            <button onClick={clearUrlFilters} className="text-xs font-semibold text-indigo-600 hover:text-indigo-800">
              Clear drilldown
            </button>
          </div>
        )}

        {/* Stats — clickable with zoom + coloured border */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Tickets", val: tickets.length,                                                        color: "text-slate-900",   hoverBorder: "hover:border-indigo-300", hoverBg: "hover:bg-indigo-50/30", filter: "all" },
            { label: "Open",          val: tickets.filter(t => isOpenStatus(t.status)).length,                    color: "text-amber-600",   hoverBorder: "hover:border-amber-300",  hoverBg: "hover:bg-amber-50/30",  filter: "open" },
            { label: "Resolved",      val: tickets.filter(t => isDoneStatus(t.status)).length,                    color: "text-emerald-600", hoverBorder: "hover:border-emerald-300",hoverBg: "hover:bg-emerald-50/30",filter: "resolved" },
            { label: "Escalated",     val: tickets.filter(t => t.status === "escalated").length,                  color: "text-red-600",     hoverBorder: "hover:border-red-300",    hoverBg: "hover:bg-red-50/30",    filter: "escalated" },
          ].map(s => (
            <button
              key={s.label}
              onClick={() => setActiveFilter(s.filter)}
              className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left
                          transition-all duration-200 hover:scale-[1.03] hover:shadow-lg
                          ${s.hoverBorder} ${s.hoverBg} group`}
            >
              <p className="text-sm text-slate-500">{s.label}</p>
              <p className={`text-3xl font-bold mt-2 ${s.color}`}>{s.val}</p>
              <p className="text-xs text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">Click to filter →</p>
            </button>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border
                ${activeFilter === f.key
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm scale-[1.03]"
                  : "bg-white text-slate-600 border-slate-200 hover:scale-[1.03] hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm"
                }`}
            >
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeFilter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">ID</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">Title</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={4} className="text-center py-16 text-slate-500">Loading tickets...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-16 text-slate-500">No tickets found</td></tr>
              ) : filtered.map(t => (
                <tr
                  key={t.id}
                  onClick={() => openTicket(t)}
                  className={`cursor-pointer border-l-4 border-l-transparent transition-all duration-200 group
                    ${STATUS_ROW_BG[t.status] || "hover:bg-slate-50"}
                    ${STATUS_ROW_ACCENT[t.status] || "hover:border-l-slate-300"}`}
                >
                  <td className="px-5 py-4 text-xs font-mono text-slate-500">#{t.id.slice(0, 8)}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900 truncate max-w-[250px] group-hover:text-slate-700 transition-colors">{t.title}</p>
                    {t.category && <p className="text-xs text-slate-400 capitalize mt-0.5">{t.category}</p>}
                  </td>
                  <td className="px-5 py-4"><Badge text={t.status} styles={STATUS_STYLES} /></td>
                  <td className="px-5 py-4"><Badge text={t.priority} styles={PRIORITY_STYLES} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
