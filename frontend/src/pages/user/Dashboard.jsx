import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import client from "../../api/client";
import { CATEGORY_ITEMS } from "../../components/ClassificationLegend";
import { labelStatus, isOpenStatus, isAssignedStatus, isDoneStatus, isAutoSolvedStatus } from "../../lib/ui";

const CATEGORY_LABELS = CATEGORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.code]: item.label }), {});

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  assigned:    "bg-purple-50 text-purple-600 border border-purple-200",
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
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-base leading-snug">{ticket.title}</p>
            <p className="text-xs text-slate-400 font-mono mt-1">
              #{ticket.id?.slice(0, 8)} · {new Date(ticket.created_at).toLocaleString()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mt-0.5"
          >
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
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {ticket.description && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Problem Description</p>
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                {ticket.description}
              </p>
            </div>
          )}
          {ticket.ai_suggestion && (
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
                AI Suggested Fix
              </p>
              <p className="text-sm text-indigo-800 leading-relaxed bg-indigo-50 rounded-xl px-4 py-3 border border-indigo-100">
                {ticket.ai_suggestion}
              </p>
            </div>
          )}
          {ticket.resolution_text && (
            <div>
              <p className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                Resolution
              </p>
              <p className="text-sm text-emerald-800 leading-relaxed bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
                {ticket.resolution_text}
              </p>
            </div>
          )}
          {!ticket.description && !ticket.ai_suggestion && !ticket.resolution_text && (
            <p className="text-sm text-slate-400 text-center py-6">No additional details available.</p>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors"
          >
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
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    client
      .get("/tickets/")
      .then(res => setTickets(res.data || []))
      .catch(err => { console.error(err); setTickets([]); })
      .finally(() => setLoading(false));
  }, []);

  const openTickets     = tickets.filter(t => isOpenStatus(t.status));
  const assignedTickets = tickets.filter(t => isAssignedStatus(t.status));
  const escalatedTickets= tickets.filter(t => t.status === "escalated");
  const aiSolvedTickets = tickets.filter(t => isAutoSolvedStatus(t.status));
  const resolvedTickets = tickets.filter(t => isDoneStatus(t.status));

  // Navigate to TicketsView with a pre-applied filter
  const goToFilter = (filter) => navigate(`/user/tickets?filter=${filter}`);

  return (
    <>
      <TicketModal ticket={selected} onClose={() => setSelected(null)} />

      <div className="w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Track support requests and access AI-powered assistance.</p>
        </div>

        {/* Stats — clickable, navigate with filter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-5 mb-8">
          <button
            onClick={() => navigate("/user/tickets")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left hover:border-slate-300 hover:shadow-md transition-all group"
          >
            <p className="text-sm text-slate-500">Total Tickets</p>
            <p className="text-3xl font-bold text-slate-900 mt-2 group-hover:text-indigo-600 transition-colors">
              {tickets.length}
            </p>
            <p className="text-xs text-slate-400 mt-1">View all →</p>
          </button>

          <button
            onClick={() => goToFilter("open")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left hover:border-amber-200 hover:shadow-md transition-all group"
          >
            <p className="text-sm text-slate-500">Open Tickets</p>
            <p className="text-3xl font-bold text-amber-600 mt-2">
              {openTickets.length}
            </p>
            <p className="text-xs text-slate-400 mt-1 group-hover:text-amber-500 transition-colors">View open →</p>
          </button>

          <button
            onClick={() => goToFilter("assigned")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left hover:border-blue-200 hover:shadow-md transition-all group"
          >
            <p className="text-sm text-slate-500">Assigned</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">
              {assignedTickets.length}
            </p>
            <p className="text-xs text-slate-400 mt-1 group-hover:text-blue-500 transition-colors">Engineer working →</p>
          </button>

          <button
            onClick={() => goToFilter("auto_solved")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left hover:border-indigo-200 hover:shadow-md transition-all group"
          >
            <p className="text-sm text-slate-500">AI Solved</p>
            <p className="text-3xl font-bold text-indigo-600 mt-2">
              {aiSolvedTickets.length}
            </p>
            <p className="text-xs text-slate-400 mt-1 group-hover:text-indigo-500 transition-colors">View AI solved →</p>
          </button>

          <button
            onClick={() => goToFilter("escalated")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left hover:border-red-200 hover:shadow-md transition-all group"
          >
            <p className="text-sm text-slate-500">Escalated</p>
            <p className="text-3xl font-bold text-red-600 mt-2">
              {escalatedTickets.length}
            </p>
            <p className="text-xs text-slate-400 mt-1 group-hover:text-red-500 transition-colors">Urgent review →</p>
          </button>

          <button
            onClick={() => goToFilter("resolved")}
            className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left hover:border-emerald-200 hover:shadow-md transition-all group"
          >
            <p className="text-sm text-slate-500">Resolved</p>
            <p className="text-3xl font-bold text-emerald-600 mt-2">
              {resolvedTickets.length}
            </p>
            <p className="text-xs text-slate-400 mt-1 group-hover:text-emerald-500 transition-colors">{aiSolvedTickets.length} by AI · {resolvedTickets.length - aiSolvedTickets.length} by human →</p>
          </button>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-12 gap-6">

          {/* Recent Tickets — clickable rows open modal */}
          <div className="col-span-12 xl:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Recent Tickets</h2>
              <button
                onClick={() => navigate("/user/tickets")}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                View all →
              </button>
            </div>

            {loading ? (
              <div className="p-10 text-center text-slate-500">Loading tickets...</div>
            ) : tickets.length === 0 ? (
              <div className="p-10 text-center text-slate-500">No tickets found.</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Title</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase text-slate-500">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 8).map(ticket => (
                    <tr
                      key={ticket.id}
                      onClick={() => setSelected(ticket)}
                      className={`border-b border-l-4 border-l-transparent border-slate-100 transition cursor-pointer group ${STATUS_ROW_BG[ticket.status] || "hover:bg-indigo-50/40"} ${STATUS_ROW_ACCENT[ticket.status] || "hover:border-l-slate-300"}`}
                    >
                      <td className="px-5 py-4 text-slate-900 text-sm group-hover:text-indigo-700 transition-colors font-medium">
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

            {/* Quick Actions */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <Link to="/user/email" className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 hover:bg-indigo-100 transition">
                  <p className="font-semibold text-indigo-700">Create Ticket</p>
                  <p className="text-xs text-slate-500 mt-1">Raise support request</p>
                </Link>
                <Link to="/user/chat" className="bg-blue-50 border border-blue-100 rounded-xl p-4 hover:bg-blue-100 transition">
                  <p className="font-semibold text-blue-700">Live Chat</p>
                  <p className="text-xs text-slate-500 mt-1">Talk to support</p>
                </Link>
                <Link to="/user/voice" className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 hover:bg-emerald-100 transition">
                  <p className="font-semibold text-emerald-700">Voice AI</p>
                  <p className="text-xs text-slate-500 mt-1">Speak with assistant</p>
                </Link>
                <Link to="/user/tickets" className="bg-purple-50 border border-purple-100 rounded-xl p-4 hover:bg-purple-100 transition">
                  <p className="font-semibold text-purple-700">My Tickets</p>
                  <p className="text-xs text-slate-500 mt-1">View ticket history</p>
                </Link>
              </div>
            </div>

            {/* AI Assistant */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl p-5">
              <h3 className="font-semibold text-indigo-800 mb-2">AI Assistant</h3>
              <p className="text-sm text-slate-600 mb-4">
                Your AI support assistant is online and ready to diagnose issues, recommend solutions and create tickets automatically.
              </p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-emerald-700">Online</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
