import { useState, useEffect } from "react";
import client from "../../api/client";

const STATUS_STYLES = {
  open: "bg-slate-100 text-slate-700",
  ai_pending: "bg-amber-100 text-amber-700",
  auto_solved: "bg-emerald-100 text-emerald-700",
  reviewing: "bg-blue-100 text-blue-700",
  assigned: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
  reopened: "bg-red-100 text-red-700",
  escalated: "bg-red-100 text-red-700",
};

const PRIORITY_STYLES = {
  P1: "bg-red-100 text-red-700",
  P2: "bg-orange-100 text-orange-700",
  P3: "bg-blue-100 text-blue-700",
  P4: "bg-slate-100 text-slate-700",
};

function Badge({ text, styles }) {
  return (
    <span
      className={`text-xs font-medium px-3 py-1 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-600"
        }`}
    >
      {text}
    </span>
  );
}

const getAuditColor = (action) => {
  const a = action?.toLowerCase() || "";
  if (a.includes("created")) return "bg-green-50 border-green-400";
  if (a.includes("assigned")) return "bg-blue-50 border-blue-400";
  if (a.includes("sla")) return "bg-red-50 border-red-500";
  if (a.includes("escalated")) return "bg-orange-50 border-orange-500";
  if (a.includes("resolved")) return "bg-emerald-50 border-emerald-500";
  if (a.includes("closed")) return "bg-slate-50 border-slate-400";
  return "bg-indigo-50 border-indigo-300";
};

const getAuditIcon = (action) => {
  const a = action?.toLowerCase() || "";
  if (a.includes("created")) return "🟢";
  if (a.includes("assigned")) return "🔵";
  if (a.includes("sla")) return "🚨";
  if (a.includes("escalated")) return "⚠️";
  if (a.includes("resolved")) return "✅";
  if (a.includes("closed")) return "📦";
  return "📌";
};

export default function AdminAllTickets() {
  const [tickets, setTickets] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    client.get("/tickets/").then((r) => {
      setTickets(r.data);
      setLoading(false);
    });
  }, []);

  const filtered = tickets.filter(
    (t) =>
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.id?.toLowerCase().includes(search.toLowerCase()) ||
      t.category?.toLowerCase().includes(search.toLowerCase())
  );

  const loadAudit = async (ticket) => {
    setSelected(ticket);
    setAudit([]);
    try {
      const res = await client.get(`/admin/tickets/${ticket.id}/audit`);
      setAudit(res.data);
    } catch { }
  };

  return (
    <div className="w-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">All Tickets</h1>
          <p className="text-sm text-slate-500 mt-1">
            {tickets.length} total tickets in the system
          </p>
        </div>

        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className="bg-white border border-slate-300 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-80"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Tickets</p>
          <p className="text-3xl font-bold text-slate-900">{tickets.length}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Open</p>
          <p className="text-3xl font-bold text-amber-600">
            {tickets.filter((t) => t.status === "open").length}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Resolved</p>
          <p className="text-3xl font-bold text-emerald-600">
            {tickets.filter((t) => t.status === "resolved").length}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Escalated</p>
          <p className="text-3xl font-bold text-red-600">
            {tickets.filter((t) => t.status === "escalated").length}
          </p>
        </div>
      </div>
      {/* ↑ Stats grid closed here — was missing in original */}

      {/* Tickets Table + Audit Panel */}
      <div className="grid grid-cols-3 gap-6">

        {/* Tickets Table */}
        <div className="col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">
                  ID
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Title
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Status
                </th>
                <th className="text-left px-5 py-4 text-xs font-semibold text-slate-500 uppercase">
                  Priority
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-500">
                    Loading tickets...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-16 text-slate-500">
                    No tickets found
                  </td>
                </tr>
              ) : (
                filtered.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => loadAudit(t)}
                    className={`cursor-pointer transition-all hover:bg-indigo-50 ${selected?.id === t.id
                        ? "bg-indigo-50 border-l-4 border-indigo-500"
                        : ""
                      }`}
                  >
                    <td className="px-5 py-4 text-xs font-mono text-slate-500">
                      #{t.id.slice(0, 8)}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900 truncate max-w-[250px]">
                        {t.title}
                      </p>
                      {t.category && (
                        <p className="text-xs text-slate-500 capitalize mt-1">
                          {t.category}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge text={t.status} styles={STATUS_STYLES} />
                    </td>
                    <td className="px-5 py-4">
                      <Badge text={t.priority} styles={PRIORITY_STYLES} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Audit / Detail Panel */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          {!selected ? (
            <div className="flex flex-col items-center justify-center h-full py-20">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center mb-4">
                🎫
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">
                Select a Ticket
              </h3>
              <p className="text-sm text-slate-500 text-center">
                Click any ticket from the table to view details and audit history.
              </p>
            </div>
          ) : (
            <div>

              {/* Ticket Header */}
              <div className="mb-4">
                <p className="text-xs font-mono text-slate-500 mb-1">
                  #{selected.id.slice(0, 8)}
                </p>
                <h3 className="text-lg font-semibold text-slate-900">
                  {selected.title}
                </h3>
              </div>

              {/* Status & Priority */}
              <div className="flex flex-wrap gap-2 mb-5">
                <Badge text={selected.status} styles={STATUS_STYLES} />
                <Badge text={selected.priority} styles={PRIORITY_STYLES} />
              </div>

              {/* Created & SLA */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-green-700 mb-1">Created</p>
                  <p className="font-semibold text-green-900">
                    {selected.created_at
                      ? new Date(selected.created_at).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-medium text-red-700 mb-1">SLA Status</p>
                  <p className="font-semibold text-red-900">
                    {selected.sla_breached ? "Escalated" : "Within SLA"}
                  </p>
                </div>
              </div>

              {/* Description */}
              {selected.description && (
                <div className="mb-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Description
                  </p>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-sm text-slate-700">{selected.description}</p>
                  </div>
                </div>
              )}

              {/* AI Recommendation */}
              {selected.ai_suggestion && (
                <div className="mb-5">
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl p-4">
                    <p className="text-sm font-semibold text-indigo-700 mb-2">
                      🤖 AI Recommendation
                    </p>
                    <p className="text-sm text-slate-700">{selected.ai_suggestion}</p>
                  </div>
                </div>
              )}

              {/* Audit Trail */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Audit Trail
                </p>
                <div className="space-y-3 max-h-[350px] overflow-y-auto">
                  {audit.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No audit events
                    </div>
                  ) : (
                    audit.map((e) => (
                      <div
                        key={e.id}
                        className={`rounded-xl p-3 border-l-4 ${getAuditColor(e.action)}`}
                      >
                        <p className="font-medium text-slate-900">
                          {getAuditIcon(e.action)} {e.action}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          {e.actor} · {new Date(e.timestamp).toLocaleString()}
                        </p>
                        {e.notes && (
                          <p className="text-xs text-slate-600 mt-2">{e.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

      </div>
      {/* ↑ grid-cols-3 closed here */}

    </div>
    // ↑ max-w-7xl wrapper closed here
  );
}