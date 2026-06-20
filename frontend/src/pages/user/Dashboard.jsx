import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  ai_pending:  "bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  auto_solved: "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  reviewing:   "bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  assigned:    "bg-purple-50 text-purple-600 border border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  in_progress: "bg-indigo-50 text-indigo-600 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  closed:      "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  reopened:    "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  escalated:   "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

const PRIORITY_STYLES = {
  P1: "bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  P2: "bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
  P3: "bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  P4: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

const STATUS_ROW_ACCENT = {
  open:        "hover:border-l-slate-400",
  ai_pending:  "hover:border-l-amber-400",
  auto_solved: "hover:border-l-emerald-400",
  reviewing:   "hover:border-l-blue-400",
  assigned:    "hover:border-l-purple-400",
  in_progress: "hover:border-l-indigo-400",
  resolved:    "hover:border-l-emerald-500",
  closed:      "hover:border-l-slate-300",
  reopened:    "hover:border-l-red-400",
  escalated:   "hover:border-l-red-500",
};

const STATUS_ROW_BG = {
  open:        "hover:bg-slate-50 dark:hover:bg-slate-800/60",
  ai_pending:  "hover:bg-amber-50/50 dark:hover:bg-amber-900/10",
  auto_solved: "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10",
  reviewing:   "hover:bg-blue-50/50 dark:hover:bg-blue-900/10",
  assigned:    "hover:bg-purple-50/50 dark:hover:bg-purple-900/10",
  in_progress: "hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10",
  resolved:    "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10",
  closed:      "hover:bg-slate-50 dark:hover:bg-slate-800/60",
  reopened:    "hover:bg-red-50/50 dark:hover:bg-red-900/10",
  escalated:   "hover:bg-red-50/50 dark:hover:bg-red-900/10",
};

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"}`}>
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
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-base leading-snug">{ticket.title}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">
              #{ticket.id?.slice(0, 8)} · {new Date(ticket.created_at).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="px-6 py-3 flex gap-2 flex-wrap border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          {ticket.category && <Badge text={ticket.category} />}
          <Badge text={ticket.priority} styles={PRIORITY_STYLES} />
          <Badge text={ticket.status} styles={STATUS_STYLES} />
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {ticket.description && (
            <div>
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Problem Description</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-xl px-4 py-3 border border-slate-100 dark:border-slate-700">{ticket.description}</p>
            </div>
          )}
          {ticket.ai_suggestion && (
            <div>
              <p className="text-xs font-semibold text-indigo-400 dark:text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" /> AI Suggested Fix
              </p>
              <p className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed bg-indigo-50 dark:bg-indigo-900/20 rounded-xl px-4 py-3 border border-indigo-100 dark:border-indigo-800">{ticket.ai_suggestion}</p>
            </div>
          )}
          {ticket.resolution_text && (
            <div>
              <p className="text-xs font-semibold text-emerald-500 dark:text-emerald-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" /> Resolution
              </p>
              <p className="text-sm text-emerald-800 dark:text-emerald-300 leading-relaxed bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-3 border border-emerald-100 dark:border-emerald-800">{ticket.resolution_text}</p>
            </div>
          )}
          {!ticket.description && !ticket.ai_suggestion && !ticket.resolution_text && (
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">No additional details available.</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main Dashboard ── */
export default function UserDashboard() {
  const navigate = useNavigate();
  const [tickets, setTickets]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    client.get("/tickets/")
      .then(res => setTickets(res.data || []))
      .catch(err => { console.error(err); setTickets([]); })
      .finally(() => setLoading(false));
  }, []);

  const openTickets     = tickets.filter(t => ["open", "escalated", "reopened"].includes(t.status));
  const resolvedTickets = tickets.filter(t => t.status === "resolved");
  const pendingTickets  = tickets.filter(t => t.status === "ai_pending");

  const goToFilter = (filter) => navigate(`/user/tickets?filter=${filter}`);

  return (
    <>
      <TicketModal ticket={selected} onClose={() => setSelected(null)} />

      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track support requests and access AI-powered assistance.</p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">

          <button
            onClick={() => navigate("/user/tickets")}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm text-left
                       transition-all duration-200 ease-out
                       hover:scale-[1.03] hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10
                       group"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">Total Tickets</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors duration-200">
              {tickets.length}
            </p>
            <p className="text-xs text-indigo-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">View all →</p>
          </button>

          <button
            onClick={() => goToFilter("open")}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm text-left
                       transition-all duration-200 ease-out
                       hover:scale-[1.03] hover:shadow-lg hover:border-amber-300 dark:hover:border-amber-600 hover:bg-amber-50/30 dark:hover:bg-amber-900/10
                       group"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">Open Tickets</p>
            <p className="text-3xl font-bold text-amber-600 dark:text-amber-400 mt-2 group-hover:text-amber-500 transition-colors duration-200">
              {openTickets.length}
            </p>
            <p className="text-xs text-amber-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">View open →</p>
          </button>

          <button
            onClick={() => goToFilter("ai_pending")}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm text-left
                       transition-all duration-200 ease-out
                       hover:scale-[1.03] hover:shadow-lg hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10
                       group"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">Pending AI Review</p>
            <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400 mt-2 group-hover:text-indigo-500 transition-colors duration-200">
              {pendingTickets.length}
            </p>
            <p className="text-xs text-indigo-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">View pending →</p>
          </button>

          <button
            onClick={() => goToFilter("resolved")}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm text-left
                       transition-all duration-200 ease-out
                       hover:scale-[1.03] hover:shadow-lg hover:border-emerald-300 dark:hover:border-emerald-600 hover:bg-emerald-50/30 dark:hover:bg-emerald-900/10
                       group"
          >
            <p className="text-sm text-slate-500 dark:text-slate-400">Resolved</p>
            <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 mt-2 group-hover:text-emerald-500 transition-colors duration-200">
              {resolvedTickets.length}
            </p>
            <p className="text-xs text-emerald-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">View resolved →</p>
          </button>

        </div>

        {/* Main Content */}
        <div className="grid grid-cols-12 gap-6">

          {/* Recent Tickets */}
          <div className="col-span-12 xl:col-span-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 dark:text-slate-100">Recent Tickets</h2>
              <button
                onClick={() => navigate("/user/tickets")}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium transition-colors"
              >
                View all →
              </button>
            </div>

            {loading ? (
              <div className="p-10 text-center text-slate-500 dark:text-slate-400">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="p-10 text-center text-slate-500 dark:text-slate-400">No tickets found.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Title</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 8).map(ticket => (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelected(ticket)}
                      className={`border-b border-slate-100 dark:border-slate-700/60 border-l-4 border-l-transparent cursor-pointer
                                  transition-all duration-200 group
                                  ${STATUS_ROW_BG[ticket.status] || "hover:bg-slate-50 dark:hover:bg-slate-800/60"}
                                  ${STATUS_ROW_ACCENT[ticket.status] || "hover:border-l-slate-300"}`}
                    >
                      <td className="px-5 py-4 text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors">
                        {ticket.title}
                      </td>
                      <td className="px-5 py-4">
                        <Badge text={ticket.status} styles={STATUS_STYLES} />
                      </td>
                      <td className="px-5 py-4">
                        <Badge text={ticket.priority} styles={PRIORITY_STYLES} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right Side */}
          <div className="col-span-12 xl:col-span-4 space-y-5">

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link to="/user/email"
                  className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4
                             transition-all duration-200 hover:scale-[1.04] hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30">
                  <p className="font-semibold text-indigo-700 dark:text-indigo-400">Create Ticket</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Raise support request</p>
                </Link>
                <Link to="/user/chat"
                  className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-xl p-4
                             transition-all duration-200 hover:scale-[1.04] hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30">
                  <p className="font-semibold text-blue-700 dark:text-blue-400">Live Chat</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Talk to support</p>
                </Link>
                <Link to="/user/voice"
                  className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4
                             transition-all duration-200 hover:scale-[1.04] hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/30">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Voice AI</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Speak with assistant</p>
                </Link>
                <Link to="/user/tickets"
                  className="bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-xl p-4
                             transition-all duration-200 hover:scale-[1.04] hover:shadow-md hover:border-purple-300 dark:hover:border-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30">
                  <p className="font-semibold text-purple-700 dark:text-purple-400">My Tickets</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">View ticket history</p>
                </Link>
              </div>
            </div>

            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-5
                            transition-all duration-200 hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-600">
              <h3 className="font-semibold text-indigo-800 dark:text-indigo-300 mb-2">AI Assistant</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                Your AI support assistant is online and ready to diagnose issues, recommend solutions and create tickets automatically.
              </p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Online</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}