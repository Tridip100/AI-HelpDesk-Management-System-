import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Sector,
} from "recharts";

const COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

const STATUS_ROW_ACCENT = {
  open:        "hover:border-l-slate-400",
  ai_pending:  "hover:border-l-amber-400",
  assigned:    "hover:border-l-purple-400",
  in_progress: "hover:border-l-indigo-400",
  resolved:    "hover:border-l-emerald-500",
  escalated:   "hover:border-l-red-500",
  reopened:    "hover:border-l-red-400",
};
const STATUS_ROW_BG = {
  open:        "hover:bg-slate-50",
  ai_pending:  "hover:bg-amber-50/50",
  assigned:    "hover:bg-purple-50/50",
  in_progress: "hover:bg-indigo-50/50",
  resolved:    "hover:bg-emerald-50/50",
  escalated:   "hover:bg-red-50/50",
  reopened:    "hover:bg-red-50/50",
};

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  ai_pending:  "bg-amber-50 text-amber-600 border border-amber-200",
  assigned:    "bg-purple-50 text-purple-600 border border-purple-200",
  in_progress: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200",
  closed:      "bg-slate-100 text-slate-500",
  escalated:   "bg-red-50 text-red-600 border border-red-200",
  reopened:    "bg-red-50 text-red-600 border border-red-200",
};
const PRIORITY_STYLES = {
  P1: "bg-red-50 text-red-600 border border-red-200",
  P2: "bg-orange-50 text-orange-600 border border-orange-200",
  P3: "bg-blue-50 text-blue-600 border border-blue-200",
  P4: "bg-slate-100 text-slate-500",
};

const OPEN_STATUSES        = ["open", "escalated", "reopened"];
const IN_PROGRESS_STATUSES = ["assigned", "in_progress"];

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {text?.replace("_", " ")}
    </span>
  );
}

const renderActiveShape = (props) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value } = props;
  return (
    <g>
      <text x={cx} y={cy - 10} textAnchor="middle" fill={fill} style={{ fontSize: 13, fontWeight: 600 }}>{payload.name}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" style={{ fontSize: 12 }}>{value} tickets</text>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 10} startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={innerRadius - 6} outerRadius={innerRadius - 2} startAngle={startAngle} endAngle={endAngle} fill={fill} />
    </g>
  );
};

/* ── Ticket Detail Modal ── */
function TicketModal({ ticket, onClose }) {
  if (!ticket) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-base leading-snug">{ticket.title}</p>
            <p className="text-xs text-slate-400 font-mono mt-1">#{ticket.id?.slice(0, 8)} · {new Date(ticket.created_at).toLocaleString()}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div className="px-6 py-3 flex gap-2 flex-wrap border-b border-slate-100 bg-slate-50">
          {ticket.category && <Badge text={ticket.category} />}
          <Badge text={ticket.priority} styles={PRIORITY_STYLES} />
          <Badge text={ticket.status} styles={STATUS_STYLES} />
          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${ticket.sla_breached ? "bg-red-50 text-red-600 border border-red-200" : "bg-emerald-50 text-emerald-600 border border-emerald-200"}`}>
            {ticket.sla_breached ? "SLA Breached" : "Within SLA"}
          </span>
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
          {!ticket.description && !ticket.ai_suggestion && !ticket.resolution_text && (
            <p className="text-sm text-slate-400 text-center py-6">No additional details available.</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics]           = useState(null);
  const [summary, setSummary]           = useState(null);
  const [tickets, setTickets]           = useState([]);
  const [digest, setDigest]             = useState(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState(0);
  const [selected, setSelected]         = useState(null);

  useEffect(() => {
    Promise.all([
      client.get("/admin/metrics"),
      client.get("/admin/stats/summary"),
      client.get("/tickets/"),
    ]).then(([m, s, t]) => {
      setMetrics(m.data);
      setSummary(s.data);
      setTickets(t.data);
    });
  }, []);

  const fetchDigest = async () => {
    setLoadingDigest(true);
    try {
      const res = await client.get("/admin/digest?hours=8");
      setDigest(res.data);
    } finally { setLoadingDigest(false); }
  };

  const categoryData = tickets.reduce((acc, t) => {
    if (!t.category) return acc;
    const found = acc.find(x => x.name === t.category);
    if (found) found.count++; else acc.push({ name: t.category, count: 1 });
    return acc;
  }, []);

  const statusData = tickets.reduce((acc, t) => {
    const found = acc.find(x => x.name === t.status);
    if (found) found.value++; else acc.push({ name: t.status, value: 1 });
    return acc;
  }, []);

  const openCount       = tickets.filter(t => OPEN_STATUSES.includes(t.status)).length;
  const inProgressCount = tickets.filter(t => IN_PROGRESS_STATUSES.includes(t.status)).length;

  const stats = [
    { label: "Total Tickets",          value: metrics?.total_tickets ?? "—", sub: "All time",            color: "text-slate-900",   hoverBorder: "hover:border-indigo-300", hoverBg: "hover:bg-indigo-50/30",  filter: null },
    { label: "Open Tickets",           value: openCount,                      sub: "Needs attention",     color: "text-amber-600",   hoverBorder: "hover:border-amber-300",  hoverBg: "hover:bg-amber-50/30",   filter: "open" },
    { label: "Resolved by AI",         value: metrics?.auto_solved ?? "—",    sub: `${metrics?.auto_solve_rate ?? 0}% of total`, color: "text-indigo-600", hoverBorder: "hover:border-indigo-300", hoverBg: "hover:bg-indigo-50/30", filter: null },
    { label: "Resolved by Engineers",  value: metrics?.resolved ?? "—",       sub: "Human resolved",      color: "text-emerald-600", hoverBorder: "hover:border-emerald-300",hoverBg: "hover:bg-emerald-50/30", filter: "resolved" },
  ];

  return (
    <>
      <TicketModal ticket={selected} onClose={() => setSelected(null)} />

      <div className="w-full">
        <style>{`
          @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
          .enter { animation: slideUp 0.4s ease-out backwards; }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">System Overview</h1>
            <p className="text-sm text-slate-500 mt-1">Welcome back. Here's the current state of your support platform.</p>
          </div>
          <button
            onClick={fetchDigest}
            disabled={loadingDigest}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-sm disabled:opacity-50"
          >
            {loadingDigest ? "Generating..." : "Generate Shift Digest"}
          </button>
        </div>

        {/* Digest */}
        {digest && (
          <div className="enter bg-white border border-indigo-100 rounded-2xl p-6 shadow-sm mb-6">
            <p className="text-sm font-semibold text-indigo-700 mb-3">Shift Handover Digest</p>
            <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{digest.digest}</p>
          </div>
        )}

        {/* Stat cards — zoom + coloured border glow, clickable */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
          {stats.map((s, i) => (
            <button
              key={s.label}
              onClick={() => s.filter && navigate(`/admin/tickets?filter=${s.filter}`)}
              className={`enter bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-left
                          transition-all duration-200 hover:scale-[1.03] hover:shadow-lg
                          ${s.hoverBorder} ${s.hoverBg} group`}
              style={{ animationDelay: `${i * 0.05}s`, cursor: s.filter ? "pointer" : "default" }}
            >
              <p className="text-sm text-slate-500 mb-2">{s.label}</p>
              <p className={`text-4xl font-bold mb-2 ${s.color}`}>{s.value}</p>
              <p className="text-sm text-slate-500">{s.sub}</p>
              {s.filter && <p className="text-xs text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">View tickets →</p>}
            </button>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          {/* Categories */}
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
            <h3 className="text-lg font-semibold text-slate-900 mb-5">Tickets by Category</h3>
            {categoryData.length === 0 ? (
              <p className="text-center text-slate-500 py-12">No data available</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={categoryData}>
                  <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.08)", radius: 8 }}
                    formatter={(value, _key, props) => [`${value} Tickets`, props.payload.name]}
                    contentStyle={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", color: "#0f172a" }}
                    labelStyle={{ display: "none" }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} activeBar={{ stroke: "#4338ca", strokeWidth: 2 }}>
                    {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Status Pie */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
            <h3 className="text-lg font-semibold text-slate-900 mb-5">Status Distribution</h3>
            {statusData.length === 0 ? (
              <p className="text-center text-slate-500 py-12">No data available</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      dataKey="value" paddingAngle={3}
                      activeIndex={activePieIndex} activeShape={renderActiveShape}
                      onMouseEnter={(_, index) => setActivePieIndex(index)}
                    >
                      {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4">
                  {statusData.map((s, i) => (
                    <div key={s.name} className="flex items-center justify-between text-sm cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors"
                      onMouseEnter={() => setActivePieIndex(i)}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-600 capitalize">{s.name.replace("_", " ")}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Recent Tickets — clickable rows open modal */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden mb-8">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Recent Tickets</h3>
            <button onClick={() => navigate("/admin/tickets")} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors">
              View all →
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">ID</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Title</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tickets.slice(0, 8).map(t => (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`cursor-pointer border-l-4 border-l-transparent transition-all duration-200 group
                    ${STATUS_ROW_BG[t.status] || "hover:bg-slate-50"}
                    ${STATUS_ROW_ACCENT[t.status] || "hover:border-l-slate-300"}`}
                >
                  <td className="px-5 py-4 text-xs font-mono text-slate-500">#{t.id.slice(0, 8)}</td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-slate-900 truncate max-w-[260px] group-hover:text-slate-700 transition-colors">{t.title}</p>
                    {t.category && <p className="text-xs text-slate-400 mt-0.5 capitalize">{t.category}</p>}
                  </td>
                  <td className="px-5 py-4"><Badge text={t.status} styles={STATUS_STYLES} /></td>
                  <td className="px-5 py-4"><Badge text={t.priority} styles={PRIORITY_STYLES} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Engineers */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-5">Engineer Performance</h3>
          {!metrics?.engineer_breakdown?.length ? (
            <p className="text-slate-500">No engineer data available.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {metrics.engineer_breakdown.map(e => (
                <div key={e.username}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:border-indigo-200 hover:bg-indigo-50/20">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center mb-4">
                    {e.full_name?.split(" ").map(n => n[0]).join("") || e.username[0].toUpperCase()}
                  </div>
                  <h4 className="font-semibold text-slate-900">{e.full_name || e.username}</h4>
                  <p className="text-3xl font-bold text-indigo-600 my-2">{e.assigned}</p>
                  <p className="text-sm text-slate-500">Tickets Assigned{e.avg_csat ? ` • ${e.avg_csat} CSAT` : ""}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}