import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, RefreshCw, X, BarChart2,
  CheckCircle2, Clock, AlertTriangle, UserCheck,
} from "lucide-react";
import {
  labelStatus, isOpenStatus, isAssignedStatus,
  isDoneStatus, isResolvedStatus,
} from "../../lib/ui";
import { CATEGORY_ITEMS } from "../../components/ClassificationLegend";

const CATEGORY_META = CATEGORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.code]: item }), {});
const STATUS_COLORS = {
  open: "#94a3b8",
  assigned: "#4f46e5",
  escalated: "#e11d48",
  auto_solved: "#8b5cf6",
  resolved: "#059669",
};
const PRIORITY_COLORS = { P1: "#e11d48", P2: "#ea580c", P3: "#2563eb", P4: "#94a3b8" };

const STATUS_STYLES = {
  open: "bg-slate-100 text-slate-600",
  assigned: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  escalated: "bg-red-50 text-red-600 border border-red-200",
  auto_solved: "bg-violet-50 text-violet-600 border border-violet-200",
  resolved: "bg-emerald-50 text-emerald-600 border border-emerald-200",
};
const PRIORITY_STYLES = {
  P1: "bg-red-50 text-red-600 border border-red-200",
  P2: "bg-orange-50 text-orange-600 border border-orange-200",
  P3: "bg-blue-50 text-blue-600 border border-blue-200",
  P4: "bg-slate-100 text-slate-500",
};
const STATUS_ROW_ACCENT = {
  open: "hover:border-l-slate-400",
  assigned: "hover:border-l-indigo-400",
  escalated: "hover:border-l-red-500",
  auto_solved: "hover:border-l-violet-400",
  resolved: "hover:border-l-emerald-500",
};
const STATUS_ROW_BG = {
  open: "hover:bg-slate-50",
  assigned: "hover:bg-indigo-50/50",
  escalated: "hover:bg-red-50/50",
  auto_solved: "hover:bg-violet-50/30",
  resolved: "hover:bg-emerald-50/50",
};

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {styles === PRIORITY_STYLES ? text : labelStatus(text)}
    </span>
  );
}

function normalizeCategory(ticket) {
  const raw = typeof ticket.category === "object" ? ticket.category?.value : ticket.category;
  return String(raw || "other").toLowerCase();
}

function TicketDrawer({ title, subtitle, tickets, onClose }) {
  if (!tickets) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/80">
          <div>
            <p className="font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle} · {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {tickets.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">No tickets for this selection</div>
          ) : tickets.map(t => (
            <div
              key={t.id}
              className={`p-4 border-l-4 border-l-transparent transition-all duration-150 group ${STATUS_ROW_BG[t.status] || "hover:bg-slate-50"} ${STATUS_ROW_ACCENT[t.status] || "hover:border-l-slate-300"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">#{t.id?.slice(0, 8)}</p>
                  {t.description && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{t.description}</p>}
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  <Badge text={t.priority} styles={PRIORITY_STYLES} />
                  <Badge text={t.status} styles={STATUS_STYLES} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-400">
                <span>{CATEGORY_META[normalizeCategory(t)]?.label || normalizeCategory(t)}</span>
                {t.created_at && <span>{new Date(t.created_at).toLocaleDateString()}</span>}
                {t.assigned_to_user?.full_name && <span>{t.assigned_to_user.full_name}</span>}
              </div>
              {t.resolution_text && (
                <p className="text-xs text-emerald-600 mt-2 bg-emerald-50 rounded-lg px-3 py-1.5 line-clamp-1">{t.resolution_text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DonutChart({ data, totalLabel, onSegmentClick }) {
  const [hovered, setHovered] = useState(null);
  const active = hovered !== null ? data[hovered] : null;
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0">
        <PieChart width={136} height={136}>
          <Pie
            data={data}
            cx={68}
            cy={68}
            innerRadius={38}
            outerRadius={58}
            dataKey="value"
            paddingAngle={3}
            onMouseEnter={(_, i) => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={(_, i) => onSegmentClick?.(data[i])}
            style={{ cursor: "pointer", outline: "none" }}
          >
            {data.map((d, i) => (
              <Cell
                key={d.name}
                fill={d.color}
                opacity={hovered !== null && hovered !== i ? 0.24 : 1}
                stroke="none"
              />
            ))}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-base font-bold leading-none" style={{ color: active?.color || "#4f46e5" }}>
            {active ? active.value : total}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 text-center leading-tight max-w-[70px]">
            {active ? active.name : totalLabel}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1 min-w-0">
        {data.map((d, i) => (
          <button
            key={d.name}
            onClick={() => onSegmentClick?.(d)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-2 py-1 transition-all hover:bg-slate-50"
            style={{ opacity: hovered !== null && hovered !== i ? 0.35 : 1 }}
          >
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600 flex-1 text-left text-xs truncate">{d.name}</span>
            <span className="font-semibold text-slate-900 text-xs">{d.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ClickableBar({ x, y, width, height, fill, payload, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <g style={{ cursor: "pointer" }}>
      <rect
        x={x}
        y={hovered ? y - 5 : y}
        width={width}
        height={hovered ? height + 5 : height}
        fill={fill}
        rx={6}
        ry={6}
        style={{ transition: "y 0.15s, height 0.15s, fill 0.15s" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onClick?.(payload)}
      />
      {hovered && (
        <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={10} fill="#4f46e5" fontWeight={700}>
          View
        </text>
      )}
    </g>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="text-slate-400">{label || payload[0].payload?.label}</p>
      <p className="font-semibold text-slate-900">{payload[0].value} tickets</p>
      <p className="text-indigo-500">Click to view list</p>
    </div>
  );
}

export default function HelpdeskAnalytics() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(null);

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await client.get("/tickets/");
      setTickets(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const stats = useMemo(() => {
    const resolved = tickets.filter(t => isResolvedStatus(t.status));
    const active = tickets.filter(t => !isDoneStatus(t.status));
    const assigned = tickets.filter(t => isAssignedStatus(t.status));
    const open = tickets.filter(t => isOpenStatus(t.status));
    const escalated = tickets.filter(t => t.status === "escalated");
    const p1Open = tickets.filter(t => t.priority === "P1" && !isDoneStatus(t.status));
    const resolutionRate = tickets.length ? Math.round((resolved.length / tickets.length) * 100) : 0;
    return { resolved, active, assigned, open, escalated, p1Open, resolutionRate };
  }, [tickets]);

  const openDrawer = (title, subtitle, subset) => setDrawer({ title, subtitle, tickets: subset });

  const statusData = ["open", "assigned", "escalated", "auto_solved", "resolved"]
    .map(status => ({
      name: labelStatus(status),
      status,
      value: tickets.filter(t => t.status === status).length,
      color: STATUS_COLORS[status],
    }))
    .filter(d => d.value > 0);

  const categoryMap = tickets.reduce((acc, t) => {
    const key = normalizeCategory(t);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const categoryData = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, count]) => ({
      category,
      label: CATEGORY_META[category]?.label || category.replace("_", " "),
      count,
      color: CATEGORY_META[category]?.color || "#94a3b8",
    }));

  const priorityData = ["P1", "P2", "P3", "P4"]
    .map(priority => ({
      priority,
      label: priority,
      count: tickets.filter(t => t.priority === priority).length,
      color: PRIORITY_COLORS[priority],
    }))
    .filter(d => d.count > 0);

  const recentByDay = useMemo(() => {
    const days = [...Array(7)].map((_, index) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - index));
      return {
        key: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        count: 0,
      };
    });
    tickets.forEach(ticket => {
      const key = ticket.created_at ? new Date(ticket.created_at).toISOString().slice(0, 10) : null;
      const day = days.find(d => d.key === key);
      if (day) day.count += 1;
    });
    return days;
  }, [tickets]);

  const kpiCards = [
    { icon: BarChart2, label: "Total Tickets", value: tickets.length, sub: `${stats.active.length} active`, color: "text-indigo-600", hover: "hover:border-indigo-300 hover:bg-indigo-50/30", subset: tickets },
    { icon: UserCheck, label: "Assigned", value: stats.assigned.length, sub: "Engineer queue", color: "text-blue-600", hover: "hover:border-blue-300 hover:bg-blue-50/30", subset: stats.assigned },
    { icon: CheckCircle2, label: "Resolved", value: stats.resolved.length, sub: `${stats.resolutionRate}% resolution rate`, color: "text-emerald-600", hover: "hover:border-emerald-300 hover:bg-emerald-50/30", subset: stats.resolved },
    { icon: AlertTriangle, label: "Escalated", value: stats.escalated.length, sub: "Needs attention", color: "text-red-600", hover: "hover:border-red-300 hover:bg-red-50/30", subset: stats.escalated },
    { icon: Clock, label: "P1 Open", value: stats.p1Open.length, sub: stats.p1Open.length ? "Critical queue" : "All clear", color: stats.p1Open.length ? "text-red-600" : "text-emerald-600", hover: stats.p1Open.length ? "hover:border-red-300 hover:bg-red-50/30" : "hover:border-emerald-300 hover:bg-emerald-50/30", subset: stats.p1Open },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Loading analytics...
      </div>
    );
  }

  return (
    <>
      {drawer && <TicketDrawer {...drawer} onClose={() => setDrawer(null)} />}

      <div className="w-full space-y-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
              title="Back"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Helpdesk Analytics</h1>
              <p className="text-sm text-slate-500 mt-0.5">Click any metric, chart segment, or bar to view the matching tickets.</p>
            </div>
          </div>
          <button
            onClick={loadTickets}
            className="self-start md:self-auto flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 text-sm transition-colors"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-4">
          {kpiCards.map(({ icon: Icon, label, value, sub, color, hover, subset }) => (
            <button
              key={label}
              onClick={() => openDrawer(label, "Current helpdesk view", subset)}
              className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm text-left transition-all duration-200 hover:scale-[1.03] hover:shadow-lg ${hover} group`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center">
                  <Icon size={18} className={color} />
                </div>
                <span className="text-[10px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">View list</span>
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{label}</p>
              <p className={`text-3xl font-bold mt-2 ${color}`}>{value}</p>
              <p className="text-xs text-slate-400 mt-1">{sub}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">7-Day Ticket Intake</p>
                <p className="text-[11px] text-slate-400">Click a bar to view tickets from that day</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={recentByDay} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<ChartTooltip />} cursor={false} />
                <Bar
                  dataKey="count"
                  radius={[6, 6, 0, 0]}
                  shape={(props) => (
                    <ClickableBar
                      {...props}
                      fill="#4f46e5"
                      onClick={(payload) => openDrawer(
                        `${payload.label} Tickets`,
                        payload.key,
                        tickets.filter(t => t.created_at && new Date(t.created_at).toISOString().slice(0, 10) === payload.key)
                      )}
                    />
                  )}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-1">Status Breakdown</p>
            <p className="text-[11px] text-slate-400 mb-3">Click a segment to view tickets</p>
            {statusData.length > 0 ? (
              <DonutChart
                data={statusData}
                totalLabel="tickets"
                onSegmentClick={(d) => openDrawer(
                  `${d.name} Tickets`,
                  "Current helpdesk view",
                  tickets.filter(t => t.status === d.status)
                )}
              />
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">No status data</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-1">Tickets by Category</p>
            <p className="text-[11px] text-slate-400 mb-3">Click a bar to view tickets</p>
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={categoryData} layout="vertical" margin={{ left: 16, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="label" width={96} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Bar
                    dataKey="count"
                    radius={[0, 6, 6, 0]}
                    shape={(props) => (
                      <ClickableBar
                        {...props}
                        fill={props.payload.color}
                        onClick={(payload) => openDrawer(
                          `${payload.label} Tickets`,
                          "By category",
                          tickets.filter(t => normalizeCategory(t) === payload.category)
                        )}
                      />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">No category data</p>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-1">Tickets by Priority</p>
            <p className="text-[11px] text-slate-400 mb-3">Click a bar to view tickets</p>
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={priorityData} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="priority" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<ChartTooltip />} cursor={false} />
                  <Bar
                    dataKey="count"
                    radius={[6, 6, 0, 0]}
                    shape={(props) => (
                      <ClickableBar
                        {...props}
                        fill={props.payload.color}
                        onClick={(payload) => openDrawer(
                          `${payload.priority} Tickets`,
                          "By priority",
                          tickets.filter(t => t.priority === payload.priority)
                        )}
                      />
                    )}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-400 py-8 text-center">No priority data</p>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">All Helpdesk Tickets</p>
              <p className="text-xs text-slate-400">Click table status cards above to narrow into a list.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
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
                {tickets.slice(0, 10).map(t => (
                  <tr
                    key={t.id}
                    onClick={() => openDrawer("Ticket Details", "Selected ticket", [t])}
                    className={`cursor-pointer border-l-4 border-l-transparent transition-all duration-200 group ${STATUS_ROW_BG[t.status] || "hover:bg-slate-50"} ${STATUS_ROW_ACCENT[t.status] || "hover:border-l-slate-300"}`}
                  >
                    <td className="px-5 py-4 text-xs font-mono text-slate-500">#{t.id?.slice(0, 8)}</td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900 truncate max-w-[360px] group-hover:text-slate-700 transition-colors">{t.title}</p>
                      <p className="text-xs text-slate-400 mt-0.5 capitalize">{normalizeCategory(t)}</p>
                    </td>
                    <td className="px-5 py-4"><Badge text={t.status} styles={STATUS_STYLES} /></td>
                    <td className="px-5 py-4"><Badge text={t.priority} styles={PRIORITY_STYLES} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
