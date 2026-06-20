import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie, Sector,
} from "recharts";
import { CATEGORY_ITEMS } from "../../components/ClassificationLegend";
import { labelStatus, isOpenStatus, isAssignedStatus, isDoneStatus, isResolvedStatus } from "../../lib/ui";

const COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
const CATEGORY_META = CATEGORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.code]: item }), {});
const CATEGORY_LABELS = CATEGORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.code]: item.label }), {});
const CATEGORY_CODES = new Set(CATEGORY_ITEMS.map(item => item.code));

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

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {CATEGORY_LABELS[text] || labelStatus(text)}
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
  const [selectedStatusIndex, setSelectedStatusIndex] = useState(null);
  const [hoveredStatusIndex, setHoveredStatusIndex] = useState(null);
  const [selected, setSelected]         = useState(null);
  const [learning, setLearning]         = useState(null);

  useEffect(() => {
    Promise.all([
      client.get("/admin/metrics"),
      client.get("/admin/stats/summary"),
      client.get("/tickets/"),
      client.get("/admin/learning-stats").catch(() => ({ data: null })),
    ]).then(([m, s, t, l]) => {
      setMetrics(m.data);
      setSummary(s.data);
      setTickets(t.data);
      setLearning(l.data);
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
    const category = normalizeCategory(t);
    const found = acc.find(x => x.name === category);
    if (found) found.count++; else acc.push({
      name: category,
      label: CATEGORY_META[category]?.label || category.replace("_", " "),
      color: CATEGORY_META[category]?.color || COLORS[acc.length % COLORS.length],
      count: 1,
    });
    return acc;
  }, []);

  const statusData = tickets.reduce((acc, t) => {
    const found = acc.find(x => x.name === t.status);
    if (found) found.value++; else acc.push({ name: t.status, value: 1 });
    return acc;
  }, []);

  const openCount      = tickets.filter(t => isOpenStatus(t.status)).length;
  const assignedCount  = tickets.filter(t => isAssignedStatus(t.status)).length;
  const escalatedCount = tickets.filter(t => t.status === "escalated").length;
  const aiSolvedCount  = tickets.filter(t => t.status === "auto_solved").length;
  const resolvedCount  = tickets.filter(t => isDoneStatus(t.status)).length;

  const resolvedByEngineer = tickets.filter(t =>
    isResolvedStatus(t.status) && t.resolution_path === "engineer"
  ).length;
  const resolvedByHelpdesk = tickets.filter(t =>
    isResolvedStatus(t.status) && t.resolution_path === "helpdesk"
  ).length;
  const humanResolvedCount = resolvedByEngineer + resolvedByHelpdesk;

  const stats = [
    { label: "Total Tickets", value: tickets.length, sub: "All tickets", color: "text-slate-900", filter: "all", hoverBorder: "hover:border-indigo-300", hoverBg: "hover:bg-indigo-50/30" },
    { label: "Open", value: openCount, sub: "Awaiting action", color: "text-amber-600", filter: "open", hoverBorder: "hover:border-amber-300", hoverBg: "hover:bg-amber-50/30" },
    { label: "Assigned", value: assignedCount, sub: "Engineer working on it", color: "text-blue-600", filter: "assigned", hoverBorder: "hover:border-blue-300", hoverBg: "hover:bg-blue-50/30" },
    { label: "Escalated", value: escalatedCount, sub: "SLA breached — urgent", color: "text-red-600", filter: "escalated", hoverBorder: "hover:border-red-300", hoverBg: "hover:bg-red-50/30" },
    {
      label: "Resolved",
      value: resolvedCount,
      sub: `${aiSolvedCount} by AI · ${humanResolvedCount} by human`,
      color: "text-emerald-600",
      filter: "resolved",
      hoverBorder: "hover:border-emerald-300",
      hoverBg: "hover:bg-emerald-50/30",
    },
  ];

  const openTickets = (params = {}) => {
    const query = new URLSearchParams(params).toString();
    navigate(`/admin/tickets${query ? `?${query}` : ""}`);
  };

  const visibleStatusData = selectedStatusIndex === null ? statusData : [statusData[selectedStatusIndex]];
  const statusOpacity = (index) => hoveredStatusIndex === null || hoveredStatusIndex === index ? 1 : 0.22;

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
            className="bg-indigo-600 hover:bg-indigo-700 text-white theme-text-white px-5 py-2.5 rounded-xl text-sm font-medium transition shadow-sm disabled:opacity-50"
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

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4 mb-8">
          {stats.map((s, i) => (
            <button
              key={s.label}
              onClick={() => openTickets({ filter: s.filter, label: s.label.toLowerCase() })}
              className={`enter bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-lg ${s.hoverBorder} ${s.hoverBg} group`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <p className="text-xs text-slate-500 mb-2">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color} mb-1`}>{s.value}</p>
              <p className="text-xs text-slate-400">{s.sub}</p>
              <p className="text-xs text-slate-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">View tickets →</p>
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
                  <XAxis dataKey="label" tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#475569", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(99,102,241,0.08)", radius: 8 }}
                    formatter={(value, _key, props) => [`${value} Tickets`, props.payload.label]}
                    contentStyle={{ background: "#fff", border: "1px solid #cbd5e1", borderRadius: "12px", boxShadow: "0 10px 25px rgba(0,0,0,0.1)", color: "#0f172a" }}
                    labelStyle={{ display: "none" }}
                  />
                  <Bar dataKey="count" radius={[8, 8, 0, 0]} activeBar={{ stroke: "#4338ca", strokeWidth: 2 }} cursor="pointer"
                    onClick={(point) => openTickets({ category: point.name, label: `${point.name} tickets` })}>
                    {categoryData.map((c) => <Cell key={c.name} fill={c.color} />)}
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
                    <Pie data={visibleStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      dataKey="value" paddingAngle={3}
                      activeIndex={activePieIndex} activeShape={renderActiveShape}
                      onMouseEnter={(_, index) => { setActivePieIndex(index); setHoveredStatusIndex(selectedStatusIndex ?? index); }}
                      onMouseLeave={() => setHoveredStatusIndex(null)}
                      onClick={(_, index) => {
                        const status = visibleStatusData[index]?.name;
                        if (status) openTickets({ filter: status, label: `${labelStatus(status).toLowerCase()} tickets` });
                      }}
                    >
                      {visibleStatusData.map((_, i) => {
                        const originalIndex = selectedStatusIndex ?? i;
                        return (
                          <Cell
                            key={i}
                            fill={COLORS[originalIndex % COLORS.length]}
                            fillOpacity={statusOpacity(originalIndex)}
                            strokeOpacity={statusOpacity(originalIndex)}
                          />
                        );
                      })}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-4">
                  {statusData.map((s, i) => (
                    <button key={s.name} className={`w-full flex items-center justify-between text-sm cursor-pointer rounded-lg px-2 py-1 transition-colors ${selectedStatusIndex === i ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                      onMouseEnter={() => { setActivePieIndex(i); setHoveredStatusIndex(i); }}
                      onMouseLeave={() => setHoveredStatusIndex(null)}
                      onClick={() => openTickets({ filter: s.name, label: `${labelStatus(s.name).toLowerCase()} tickets` })}>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-slate-600">{labelStatus(s.name)}</span>
                      </div>
                      <span className="font-semibold text-slate-900">{s.value}</span>
                    </button>
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
                <button key={e.id || e.username}
                  onClick={() => navigate(`/admin/users?role=engineer&user=${encodeURIComponent(e.id || e.username)}`)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-md hover:border-indigo-200 hover:bg-indigo-50/20">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center mb-4">
                    {e.full_name?.split(" ").map(n => n[0]).join("") || e.username[0].toUpperCase()}
                  </div>
                  <h4 className="font-semibold text-slate-900">{e.full_name || e.username}</h4>
                  <p className="text-3xl font-bold text-indigo-600 my-2">{e.assigned}</p>
                  <p className="text-sm text-slate-500">Tickets Assigned{e.avg_csat ? ` • ${e.avg_csat} CSAT` : ""}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Continuous Learning */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mt-6 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-lg font-semibold text-slate-900">Continuous Learning</h3>
            <button
              onClick={() => navigate("/admin/learning")}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              View details →
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-5">System knowledge grows automatically — no model retraining needed</p>

          {!learning ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => navigate("/admin/learning?tab=cache")}
                className="bg-indigo-50 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:shadow-sm hover:bg-indigo-100/70"
              >
                <p className="text-2xl font-bold text-indigo-600">{learning.solution_cache_size}</p>
                <p className="text-xs text-slate-500 mt-1">Cached Solutions</p>
              </button>
              <button
                onClick={() => navigate("/admin/learning?tab=conversations")}
                className="bg-emerald-50 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:shadow-sm hover:bg-emerald-100/70"
              >
                <p className="text-2xl font-bold text-emerald-600">{learning.resolved_tickets_size}</p>
                <p className="text-xs text-slate-500 mt-1">Resolved Conversations</p>
              </button>
              <button
                onClick={() => navigate("/admin/learning?tab=knowledge")}
                className="bg-blue-50 rounded-xl p-4 text-left transition-all hover:scale-[1.02] hover:shadow-sm hover:bg-blue-100/70"
              >
                <p className="text-2xl font-bold text-blue-600">{learning.sop_chunks_size}</p>
                <p className="text-xs text-slate-500 mt-1">Knowledge Base Docs</p>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
