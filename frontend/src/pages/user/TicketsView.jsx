import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";

const STATUS_STYLES = {
  open: "bg-slate-700 text-slate-300",
  ai_pending: "bg-amber-500/10 text-amber-400",
  auto_solved: "bg-emerald-500/10 text-emerald-400",
  reviewing: "bg-blue-500/10 text-blue-400",
  assigned: "bg-purple-500/10 text-purple-400",
  in_progress: "bg-indigo-500/10 text-indigo-400",
  resolved: "bg-emerald-500/10 text-emerald-400",
  closed: "bg-slate-700 text-slate-400",
  reopened: "bg-red-500/10 text-red-400",
  escalated: "bg-red-500/10 text-red-400",
};

const PRIORITY_STYLES = {
  P1: "bg-red-500/10 text-red-400",
  P2: "bg-orange-500/10 text-orange-400",
  P3: "bg-blue-500/10 text-blue-400",
  P4: "bg-slate-700 text-slate-400",
};

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles?.[text] || "bg-slate-800 text-slate-400"}`}>
      {text}
    </span>
  );
}

export default function TicketsView() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    client
      .get("/tickets/")
      .then((res) => setTickets(res.data || []))
      .catch((err) => {
        console.error(err);
        setError("Failed to load tickets.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="w-full">
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-slate-500 hover:text-slate-700 mb-4 flex items-center gap-1.5"
      >
        ← Back
      </button>

      <h2 className="text-lg font-semibold text-slate-900 mb-4">My Tickets</h2>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading tickets...</div>
        ) : error ? (
          <div className="p-12 text-center text-red-500 text-sm">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No tickets yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{t.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      #{t.id.slice(0, 8)} — {new Date(t.created_at).toLocaleString()}
                    </p>
                    {t.description && (
                      <p className="text-xs text-slate-500 mt-1 line-clamp-1">{t.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    {t.category && <Badge text={t.category} />}
                    <Badge text={t.priority} styles={PRIORITY_STYLES} />
                    <Badge text={t.status} styles={STATUS_STYLES} />
                  </div>
                </div>
                {t.resolution_text && (
                  <p className="text-xs text-emerald-600 mt-2 bg-emerald-50 rounded-lg px-2 py-1.5">
                    {t.resolution_text}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}