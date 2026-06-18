import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import client from "../../api/client";

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  ai_pending:  "bg-amber-50 text-amber-600 border border-amber-200",
  auto_solved: "bg-emerald-50 text-emerald-600 border border-emerald-200",
  reviewing:   "bg-blue-50 text-blue-600 border border-blue-200",
  assigned:    "bg-purple-50 text-purple-600 border border-purple-200",
  in_progress: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200",
  closed:      "bg-slate-100 text-slate-500",
  reopened:    "bg-red-50 text-red-600 border border-red-200",
  escalated:   "bg-red-50 text-red-600 border border-red-200",
};

const PRIORITY_STYLES = {
  P1: "bg-red-50 text-red-600 border border-red-200",
  P2: "bg-orange-50 text-orange-600 border border-orange-200",
  P3: "bg-blue-50 text-blue-600 border border-blue-200",
  P4: "bg-slate-100 text-slate-500",
};

// left border accent per status
const STATUS_BORDER = {
  open:        "hover:border-l-slate-400",
  ai_pending:  "hover:border-l-amber-400",
  auto_solved: "hover:border-l-emerald-400",
  reviewing:   "hover:border-l-blue-400",
  assigned:    "hover:border-l-purple-400",
  in_progress: "hover:border-l-indigo-500",
  resolved:    "hover:border-l-emerald-500",
  closed:      "hover:border-l-slate-300",
  reopened:    "hover:border-l-red-400",
  escalated:   "hover:border-l-red-500",
};

// bg tint per status
const STATUS_BG = {
  open:        "hover:bg-slate-50",
  ai_pending:  "hover:bg-amber-50/60",
  auto_solved: "hover:bg-emerald-50/60",
  reviewing:   "hover:bg-blue-50/60",
  assigned:    "hover:bg-purple-50/60",
  in_progress: "hover:bg-indigo-50/60",
  resolved:    "hover:bg-emerald-50/60",
  closed:      "hover:bg-slate-50",
  reopened:    "hover:bg-red-50/60",
  escalated:   "hover:bg-red-50/60",
};

// "open" = not yet picked up
const OPEN_STATUSES        = ["open", "escalated", "reopened"];
// "in_progress" = assigned to engineer
const IN_PROGRESS_STATUSES = ["assigned", "in_progress"];

const FILTERS = [
  { key: "all",         label: "All Tickets" },
  { key: "open",        label: "Open" },
  { key: "ai_pending",  label: "AI Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved",    label: "Resolved" },
];

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {text?.replace("_", " ")}
    </span>
  );
}

/* ── Ticket Detail Modal ── */
function TicketModal({ ticket, onClose }) {
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
        <div className="px-6 py-3 flex gap-2 flex-wrap border-b border-slate-100 bg-slate-50">
          {ticket.category && <Badge text={ticket.category} />}
          <Badge text={ticket.priority} styles={PRIORITY_STYLES} />
          <Badge text={ticket.status} styles={STATUS_STYLES} />
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {ticket.description && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Problem Description</p>
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">{ticket.description}</p>
            </div>
          )}
          {ticket.ai_suggestion && (
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" /> AI Suggested Fix
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
          {!ticket.description && !ticket.ai_suggestion && !ticket.resolution_text && (
            <p className="text-sm text-slate-400 text-center py-6">No additional details available for this ticket.</p>
          )}
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

/* ── Main View ── */
export default function TicketsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [selected, setSelected]         = useState(null);

  const activeFilter = searchParams.get("filter") || "all";

  useEffect(() => {
    client.get("/tickets/")
      .then(res => setTickets(res.data || []))
      .catch(err => { console.error(err); setError("Failed to load tickets."); })
      .finally(() => setLoading(false));
  }, []);

  const setFilter = (key) => {
    if (key === "all") searchParams.delete("filter");
    else searchParams.set("filter", key);
    setSearchParams(searchParams);
  };

  const filtered = activeFilter === "all"
    ? tickets
    : activeFilter === "open"
    ? tickets.filter(t => OPEN_STATUSES.includes(t.status))
    : activeFilter === "in_progress"
    ? tickets.filter(t => IN_PROGRESS_STATUSES.includes(t.status))
    : tickets.filter(t => t.status === activeFilter);

  const counts = FILTERS.reduce((acc, f) => {
    if (f.key === "all")              acc[f.key] = tickets.length;
    else if (f.key === "open")        acc[f.key] = tickets.filter(t => OPEN_STATUSES.includes(t.status)).length;
    else if (f.key === "in_progress") acc[f.key] = tickets.filter(t => IN_PROGRESS_STATUSES.includes(t.status)).length;
    else acc[f.key] = tickets.filter(t => t.status === f.key).length;
    return acc;
  }, {});

  return (
    <>
      <TicketModal ticket={selected} onClose={() => setSelected(null)} />

      <div className="w-full">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">My Tickets</h2>
            <p className="text-sm text-slate-500 mt-0.5">{tickets.length} total tickets</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border
                ${activeFilter === f.key
                  ? "bg-indigo-600 text-white border-indigo-600 shadow-sm scale-[1.03]"
                  : "bg-white text-slate-600 border-slate-200 hover:scale-[1.03] hover:border-indigo-200 hover:text-indigo-600 hover:shadow-sm"
                }`}
            >
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                activeFilter === f.key ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
              }`}>
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>

        {/* Ticket list */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-slate-500 text-sm">Loading tickets...</div>
          ) : error ? (
            <div className="p-12 text-center text-red-500 text-sm">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              No {activeFilter !== "all" ? activeFilter.replace("_", " ") : ""} tickets found.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(t => (
                <div
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`p-4 cursor-pointer group border-l-4 border-l-transparent
                              transition-all duration-200
                              ${STATUS_BG[t.status] || "hover:bg-slate-50"}
                              ${STATUS_BORDER[t.status] || "hover:border-l-slate-300"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-slate-900 truncate group-hover:text-slate-700 transition-colors">
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">
                        #{t.id?.slice(0, 8)} · {new Date(t.created_at).toLocaleString()}
                      </p>
                      {t.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-1">{t.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0 items-center">
                      {t.category && <Badge text={t.category} />}
                      <Badge text={t.priority} styles={PRIORITY_STYLES} />
                      <Badge text={t.status} styles={STATUS_STYLES} />
                      <svg className="text-slate-300 group-hover:text-slate-500 transition-colors ml-1" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                  {t.resolution_text && (
                    <p className="text-xs text-emerald-600 mt-2 bg-emerald-50 rounded-lg px-3 py-1.5 line-clamp-1">
                      ✓ {t.resolution_text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}