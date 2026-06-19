import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";
import { labelStatus, isOpenStatus, isAssignedStatus, isResolvedStatus } from "../../lib/ui";
import { CATEGORY_ITEMS } from "../../components/ClassificationLegend";
import { X } from "lucide-react";

const CATEGORY_META   = CATEGORY_ITEMS.reduce((acc, item) => ({ ...acc, [item.code]: item }), {});
const PRIORITY_COLORS = { P1: "#dc2626", P2: "#ea580c", P3: "#2563eb", P4: "#94a3b8" };
const STATUS_COLORS   = {
  open: "#94a3b8", assigned: "#4f46e5", escalated: "#dc2626",
  auto_solved: "#6366f1", resolved: "#16a34a",
};

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  ai_pending:  "bg-amber-50 text-amber-600 border border-amber-200",
  assigned:    "bg-purple-50 text-purple-600 border border-purple-200",
  in_progress: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200",
  auto_solved: "bg-emerald-50 text-emerald-600 border border-emerald-200",
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
const STATUS_ROW_ACCENT = {
  open: "hover:border-l-slate-400", ai_pending: "hover:border-l-amber-400",
  assigned: "hover:border-l-purple-400", in_progress: "hover:border-l-indigo-400",
  resolved: "hover:border-l-emerald-500", auto_solved: "hover:border-l-emerald-400",
  escalated: "hover:border-l-red-500", reopened: "hover:border-l-red-400",
};
const STATUS_ROW_BG = {
  open: "hover:bg-slate-50", ai_pending: "hover:bg-amber-50/50",
  assigned: "hover:bg-purple-50/50", in_progress: "hover:bg-indigo-50/50",
  resolved: "hover:bg-emerald-50/50", auto_solved: "hover:bg-emerald-50/50",
  escalated: "hover:bg-red-50/50", reopened: "hover:bg-red-50/50",
};

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {text?.replace("_", " ")}
    </span>
  );
}

/* ── Animated number counter ── */
const AnimatedNumber = ({ value }) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (value === "—" || value === undefined) return;
    const numeric = parseFloat(String(value).replace("%", ""));
    const isPercent = String(value).includes("%");
    const start = prev.current, end = numeric, duration = 700, startTime = performance.now();
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(isPercent ? `${current}%` : current);
      if (t < 1) requestAnimationFrame(tick); else prev.current = end;
    };
    requestAnimationFrame(tick);
  }, [value]);
  if (value === "—") return <span>—</span>;
  return <span>{display}</span>;
};

/* ── AI Rate ring ── */
const AIRateRing = ({ rate }) => {
  const r = 36, circ = 2 * Math.PI * r;
  const [progress, setProgress] = useState(0);
  useEffect(() => { const t = setTimeout(() => setProgress(rate), 100); return () => clearTimeout(t); }, [rate]);
  const dash = (progress / 100) * circ;
  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle cx="48" cy="48" r={r} fill="none" stroke="#4f46e5" strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 48 48)"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }} />
      <text x="48" y="53" textAnchor="middle" fontSize="15" fontWeight="700" fill="#4f46e5">{rate}%</text>
    </svg>
  );
};

/* ── No-box bar tooltip ── */
const BarTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 12px", fontSize: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
      <p style={{ color: "#94a3b8", marginBottom: 2 }}>{label}</p>
      <p style={{ fontWeight: 600, color: "#1e293b" }}>
        {payload[0].value} tickets
        <span style={{ color: "#4f46e5", marginLeft: 6, fontSize: 11 }}>· click to filter</span>
      </p>
    </div>
  );
};

/* ── Clickable animated bar shape ── */
function ClickableBar({ x, y, width, height, name, fill, opacity, onClick }) {
  const [hovered, setHovered] = useState(false);
  const liftY = hovered ? y - 5 : y;
  const liftH = hovered ? height + 5 : height;
  return (
    <g style={{ cursor: "pointer" }}>
      <rect x={x} y={liftY} width={width} height={liftH}
        fill={fill} fillOpacity={opacity ?? 1} rx={6} ry={6}
        style={{ transition: "y 0.15s, height 0.15s, fill 0.15s" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onClick?.(name)}
      />
      {hovered && (
        <text x={x + width / 2} y={liftY - 7}
          textAnchor="middle" fontSize={10} fill="#4f46e5" fontWeight={700}>
          View →
        </text>
      )}
    </g>
  );
}

/* ── Ticket drawer ── */
function TicketDrawer({ title, subtitle, tickets, onClose }) {
  if (!tickets) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
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
            <div key={t.id}
              className={`p-4 border-l-4 border-l-transparent transition-all duration-150 group
                ${STATUS_ROW_BG[t.status] || "hover:bg-slate-50"}
                ${STATUS_ROW_ACCENT[t.status] || "hover:border-l-slate-300"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{t.title}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">#{t.id?.slice(0, 8)}</p>
                  {t.description && <p className="text-xs text-slate-500 mt-1 line-clamp-1">{t.description}</p>}
                </div>
                <div className="flex flex-col gap-1 items-end flex-shrink-0">
                  <Badge text={t.priority} styles={PRIORITY_STYLES} />
                  <Badge text={t.status} styles={STATUS_STYLES} />
                </div>
              </div>
              {t.resolution_text && (
                <p className="text-xs text-emerald-600 mt-2 bg-emerald-50 rounded-lg px-3 py-1.5 line-clamp-1">✓ {t.resolution_text}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Date bucket helpers ── */
function getBucketRange(period, bucketValue) {
  if (period === "daily") {
    const start = new Date(bucketValue + "T00:00:00");
    const end   = new Date(bucketValue + "T23:59:59.999");
    return [start, end];
  }
  if (period === "weekly") {
    const start = new Date(bucketValue + "T00:00:00");
    const end   = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return [start, end];
  }
  if (period === "monthly") {
    const [y, m] = bucketValue.split("-").map(Number);
    return [new Date(y, m - 1, 1, 0, 0, 0), new Date(y, m, 0, 23, 59, 59, 999)];
  }
  return [null, null];
}

function formatBucketLabel(period, bucketValue) {
  const [start, end] = getBucketRange(period, bucketValue);
  if (!start) return bucketValue;
  const opts = { month: "short", day: "numeric", year: "numeric" };
  if (period === "daily")   return start.toLocaleDateString("en-US", opts);
  if (period === "weekly")  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", opts)}`;
  if (period === "monthly") return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return bucketValue;
}

/* ── Global: kill focus outline on all SVG/canvas elements ── */
const NO_OUTLINE = `
  svg:focus, svg *:focus, canvas:focus, [tabindex]:focus { outline: none !important; box-shadow: none !important; }
  .recharts-sector:focus, .recharts-rectangle:focus, .recharts-curve:focus { outline: none !important; }
`;

/* ── Donut with no tooltip box — center text on hover ── */
function DonutChart({ data, totalLabel, onSegmentClick }) {
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  const active = hovered ?? selected;

  const hov = active !== null ? data[active] : null;
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative flex-shrink-0" style={{ outline: "none" }}>
        <PieChart width={130} height={130} style={{ outline: "none" }}>
          <Pie
            data={data} cx={65} cy={65}
            innerRadius={36} outerRadius={56}
            dataKey="value" paddingAngle={3}
            onMouseEnter={(_, i) => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={(_, i) => {
              setSelected(prev => prev === i ? null : i);
              onSegmentClick?.(data[i]);
            }}
            style={{ cursor: "pointer", outline: "none" }}
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={d.color}
                opacity={active !== null && active !== i ? 0.18 : 1}
                stroke="none"
                strokeWidth={0}
                style={{ transition: "opacity 0.2s", outline: "none" }}
              />
            ))}
          </Pie>
        </PieChart>
        {/* Center text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-base font-bold leading-none" style={{ color: hov ? hov.color : "#1e293b" }}>
            {hov ? hov.value : total}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5 text-center leading-tight max-w-[60px]">
            {hov ? hov.name : totalLabel}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 flex-1">
        {data.map((d, i) => (
          <div key={d.name}
            onClick={() => { setSelected(prev => prev === i ? null : i); onSegmentClick?.(d); }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-2 py-1 transition-all hover:bg-slate-50"
            style={{ opacity: active !== null && active !== i ? 0.25 : 1 }}
          >
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
            <span className="text-slate-600 flex-1 text-xs">{d.name}</span>
            <span className="font-semibold text-slate-900 text-xs">{d.value}</span>
          </div>
        ))}
        {selected !== null && (
          <button onClick={() => setSelected(null)} className="text-[11px] text-indigo-500 hover:text-indigo-700 px-2 text-left mt-0.5">↺ Reset</button>
        )}
      </div>
    </div>
  );
}

/* ── Category bubble cards ── */
function CategoryBubbles({ data, maxVal, onCategoryClick }) {
  const [hovered, setHovered] = useState(null);
  if (!data.length) return <p className="text-sm text-slate-400 py-8 text-center">No data</p>;
  return (
    <div className="grid grid-cols-2 gap-2">
      {data.map((d, i) => {
        const sizePct = maxVal ? Math.max(Math.round((d.count / maxVal) * 100), 20) : 50;
        const isHov = hovered === i;
        return (
          <div
            key={d.category}
            onClick={() => onCategoryClick(d)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            className="relative rounded-2xl p-3 cursor-pointer overflow-hidden transition-all duration-200 group"
            style={{
              background: isHov ? d.color : `${d.color}18`,
              border: `1.5px solid ${isHov ? d.color : `${d.color}40`}`,
              transform: isHov ? "scale(1.04)" : "scale(1)",
              boxShadow: isHov ? `0 4px 20px ${d.color}30` : "none",
            }}
          >
            {/* Background circle decoration */}
            <div className="absolute -right-3 -bottom-3 rounded-full opacity-10 transition-all duration-300"
              style={{
                width: `${sizePct * 1.2}px`, height: `${sizePct * 1.2}px`,
                background: d.color,
              }}
            />
            <p className="text-[11px] font-medium truncate relative z-10"
              style={{ color: isHov ? "rgba(255,255,255,0.85)" : "#64748b" }}>
              {d.label}
            </p>
            <p className="text-2xl font-bold relative z-10 mt-0.5"
              style={{ color: isHov ? "#fff" : d.color }}>
              {d.count}
            </p>
            <p className="text-[10px] relative z-10 mt-0.5"
              style={{ color: isHov ? "rgba(255,255,255,0.65)" : "#94a3b8" }}>
              {maxVal ? Math.round((d.count / maxVal) * 100) : 0}% of top
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default function AdminAnalytics() {
  const navigate = useNavigate();
  const [period, setPeriod]             = useState("daily");
  const [data, setData]                 = useState([]);
  const [summary, setSummary]           = useState(null);
  const [metrics, setMetrics]           = useState(null);
  const [tickets, setTickets]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeChart, setActiveChart]   = useState("bar");
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [drawer, setDrawer]             = useState(null); // { title, subtitle, tickets }

  useEffect(() => {
    Promise.all([
      client.get("/admin/stats/summary"),
      client.get("/admin/metrics"),
      client.get("/tickets/"),
    ]).then(([s, m, t]) => { setSummary(s.data); setMetrics(m.data); setTickets(t.data || []); });
  }, []);

  useEffect(() => {
    setLoading(true);
    setSelectedBucket(null);
    const url = period === "daily"  ? "/admin/stats/daily?days=30"
              : period === "weekly" ? "/admin/stats/weekly?weeks=12"
              :                       "/admin/stats/monthly?months=12";
    client.get(url).then(r => {
      const key = period === "daily" ? "date" : period === "weekly" ? "week" : "month";
      setData(r.data.map(d => ({ name: d[key], rawKey: d[key], count: d.count })));
      setLoading(false);
    });
  }, [period]);

  /* Tickets filtered by selected bar bucket */
  const filteredTickets = useMemo(() => {
    if (!selectedBucket) return tickets;
    const [start, end] = getBucketRange(selectedBucket.period, selectedBucket.value);
    if (!start) return tickets;
    return tickets.filter(t => {
      const c = new Date(t.created_at);
      return c >= start && c <= end;
    });
  }, [tickets, selectedBucket]);

  const handleBarClick = (rawKey) => {
    if (selectedBucket?.value === rawKey && selectedBucket?.period === period) {
      setSelectedBucket(null);
    } else {
      setSelectedBucket({ period, value: rawKey });
    }
  };

  /* Derived stats */
  const aiSolvedCount      = filteredTickets.filter(t => t.status === "auto_solved").length;
  const resolvedByEngineer = filteredTickets.filter(t => isResolvedStatus(t.status) && t.resolution_path === "engineer").length;
  const resolvedByHelpdesk = filteredTickets.filter(t => isResolvedStatus(t.status) && t.resolution_path === "helpdesk").length;
  const manualResolved     = filteredTickets.filter(t => isResolvedStatus(t.status)).length;
  const aiRate             = filteredTickets.length > 0 ? Math.round((aiSolvedCount / filteredTickets.length) * 100) : 0;

  const statusDonutData = ["open","assigned","escalated","auto_solved","resolved"]
    .map(s => ({ name: labelStatus(s), status: s, value: filteredTickets.filter(t => t.status === s).length, color: STATUS_COLORS[s] }))
    .filter(d => d.value > 0);

  const resolutionPieData = [
    { name: "AI Solved",       value: aiSolvedCount,      color: "#4f46e5" },
    { name: "Engineer Solved", value: resolvedByEngineer, color: "#10b981" },
    { name: "Helpdesk Solved", value: resolvedByHelpdesk, color: "#06b6d4" },
    { name: "Other Manual",    value: Math.max(manualResolved - resolvedByEngineer - resolvedByHelpdesk, 0), color: "#cbd5e1" },
  ].filter(d => d.value > 0);

  const categoryMap = filteredTickets.reduce((acc, t) => {
    const key = (typeof t.category === "object" ? t.category?.value : t.category) || "other";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const categoryData = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([category, count]) => ({
      category, count,
      label: CATEGORY_META[category]?.label || category.replace("_", " "),
      color: CATEGORY_META[category]?.color || "#94a3b8",
    }));
  const catMax = categoryData[0]?.count || 1;

  const priorityData = ["P1","P2","P3","P4"]
    .map(p => ({ priority: p, count: filteredTickets.filter(t => t.priority === p).length, color: PRIORITY_COLORS[p] }))
    .filter(d => d.count > 0);

  const cumulativeData = data.map((d, i) => ({
    ...d, cumulative: data.slice(0, i + 1).reduce((sum, x) => sum + x.count, 0),
  }));

  const kpiCards = [
    { label: "Tickets",        value: filteredTickets.length,                                              sub: selectedBucket ? "In period" : "All time",    color: "text-indigo-600",  hoverBorder: "hover:border-indigo-300",  hoverBg: "hover:bg-indigo-50/30",  filter: "all" },
    { label: "Open",           value: filteredTickets.filter(t => isOpenStatus(t.status)).length,          sub: "Awaiting action",  color: "text-amber-600",   hoverBorder: "hover:border-amber-300",   hoverBg: "hover:bg-amber-50/30",   filter: "open" },
    { label: "Assigned",       value: filteredTickets.filter(t => isAssignedStatus(t.status)).length,      sub: "Engineer queue",   color: "text-blue-600",    hoverBorder: "hover:border-blue-300",    hoverBg: "hover:bg-blue-50/30",    filter: "assigned" },
    { label: "AI Solved",      value: aiSolvedCount,                                                       sub: "Auto-resolved",    color: "text-violet-600",  hoverBorder: "hover:border-violet-300",  hoverBg: "hover:bg-violet-50/30",  filter: "auto_solved" },
    { label: "Resolved",       value: manualResolved,                                                      sub: `${resolvedByEngineer}eng · ${resolvedByHelpdesk}hd`, color: "text-emerald-600", hoverBorder: "hover:border-emerald-300", hoverBg: "hover:bg-emerald-50/30", filter: "resolved" },
    { label: "Escalated",      value: filteredTickets.filter(t => t.status === "escalated").length,        sub: "Active",           color: "text-red-600",     hoverBorder: "hover:border-red-300",     hoverBg: "hover:bg-red-50/30",     filter: "escalated" },
    { label: "Avg Resolve",    value: metrics?.avg_resolution_hours ? `${metrics.avg_resolution_hours}h` : "—", sub: "Hrs to resolve", color: "text-blue-600", hoverBorder: "hover:border-blue-300", hoverBg: "hover:bg-blue-50/30" },
  ];

  const openDrawer = (title, subtitle, subset) => setDrawer({ title, subtitle, tickets: subset });

  return (
    <>
      {drawer && <TicketDrawer title={drawer.title} subtitle={drawer.subtitle} tickets={drawer.tickets} onClose={() => setDrawer(null)} />}

      <style>{NO_OUTLINE}</style>

      <div className="w-full space-y-5">

        {/* ── SECTION 1: Bar chart (main filter control) ── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Tickets Over Time</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {period === "daily" ? "Last 30 days" : period === "weekly" ? "Last 12 weeks" : "Last 12 months"}
                <span className="ml-2 text-indigo-400">· Click a bar to filter all charts below</span>
              </p>
            </div>
            {/* Period toggle lives HERE — next to bar chart only */}
            <div className="flex items-center gap-2">
              {selectedBucket && (
                <button onClick={() => setSelectedBucket(null)}
                  className="flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-full hover:bg-indigo-100 transition-colors">
                  <X size={12} /> Clear filter
                </button>
              )}
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {["daily","weekly","monthly"].map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
                      period === p ? "bg-indigo-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                    }`}>{p}
                  </button>
                ))}
              </div>
              <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                {[["bar","Bar"],["line","Line"]].map(([key, label]) => (
                  <button key={key} onClick={() => setActiveChart(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      activeChart === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:bg-white"
                    }`}>{label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter badge */}
          {selectedBucket && (
            <div className="mb-3 mt-1">
              <span className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full">
                Filtered: {formatBucketLabel(selectedBucket.period, selectedBucket.value)}
                <button onClick={() => setSelectedBucket(null)} className="hover:bg-indigo-100 rounded-full p-0.5 transition-colors">
                  <X size={12} />
                </button>
              </span>
            </div>
          )}

          {loading ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
              <span className="animate-pulse">Loading…</span>
            </div>
          ) : data.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data available</div>
          ) : activeChart === "bar" ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data} barCategoryGap="35%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<BarTooltip />} cursor={false} />
                <Bar dataKey="count" radius={[6,6,0,0]}
                  shape={(props) => {
                    const isSelected = selectedBucket?.value === props.rawKey && selectedBucket?.period === period;
                    const anySelected = !!selectedBucket;
                    return (
                      <ClickableBar
                        {...props}
                        fill={isSelected ? "#312e81" : "#4f46e5"}
                        opacity={anySelected && !isSelected ? 0.3 : 1}
                        onClick={() => handleBarClick(props.rawKey || props.name)}
                      />
                    );
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={cumulativeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip content={<BarTooltip />} />
                <Line type="monotone" dataKey="cumulative" stroke="#4f46e5" strokeWidth={2.5}
                  dot={false} activeDot={{ r: 5, fill: "#4f46e5", strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── SECTION 2: KPI cards (respond to bar selection) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-3">
          {kpiCards.map(s => (
            <button key={s.label}
              onClick={() => {
                if (!s.filter) return;
                const subset = s.filter === "all" ? filteredTickets
                  : filteredTickets.filter(t => t.status === s.filter);
                openDrawer(s.label, selectedBucket ? formatBucketLabel(selectedBucket.period, selectedBucket.value) : "All time", subset);
              }}
              className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-sm text-left
                          transition-all duration-200 hover:scale-[1.03] hover:shadow-lg
                          ${s.hoverBorder} ${s.hoverBg} group`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color}`}><AnimatedNumber value={s.value} /></p>
              <p className="text-[10px] text-slate-400 mt-1">{s.sub}</p>
              {s.filter && <p className="text-[10px] text-indigo-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">View list →</p>}
            </button>
          ))}
        </div>

        {/* ── SECTION 3: AI Rate + Resolution Split ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AI Rate ring */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex items-center gap-6">
            <AIRateRing rate={aiRate} />
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">AI Resolution Rate</p>
              <p className="text-3xl font-bold text-indigo-600">{aiRate}%</p>
              <p className="text-xs text-slate-400 mt-1">{aiSolvedCount} of {filteredTickets.length} auto-resolved</p>
            </div>
            {resolutionPieData.length > 0 && (
              <div className="flex-shrink-0">
                <PieChart width={90} height={90}>
                  <Pie data={resolutionPieData} cx={45} cy={45} innerRadius={24} outerRadius={40}
                    dataKey="value" startAngle={90} endAngle={-270}>
                    {resolutionPieData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                </PieChart>
                <p className="text-[10px] text-center text-slate-400 -mt-1">breakdown</p>
              </div>
            )}
          </div>

          {/* Resolution split donut — no tooltip box */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
            <p className="text-sm font-semibold text-slate-700 mb-1">Resolution Split</p>
            <p className="text-[11px] text-slate-400 mb-3">Hover or click to isolate · Click list to view tickets</p>
            {resolutionPieData.length > 0 ? (
              <DonutChart
                data={resolutionPieData}
                totalLabel="tickets"
                onSegmentClick={d => openDrawer(d.name, selectedBucket ? formatBucketLabel(selectedBucket.period, selectedBucket.value) : "All time",
                  filteredTickets.filter(t => t.status === (d.name === "AI Solved" ? "auto_solved" : "resolved"))
                )}
              />
            ) : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}
          </div>
        </div>

        {/* ── SECTION 4: Status + Category + Priority ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Status donut */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-1">Status Breakdown</p>
            <p className="text-[11px] text-slate-400 mb-3">Click a segment to view tickets</p>
            {statusDonutData.length > 0 ? (
              <DonutChart
                data={statusDonutData}
                totalLabel="total"
                onSegmentClick={d => openDrawer(
                  d.name + " Tickets",
                  selectedBucket ? formatBucketLabel(selectedBucket.period, selectedBucket.value) : "All time",
                  filteredTickets.filter(t => t.status === d.status)
                )}
              />
            ) : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}
          </div>

          {/* Category bubble cards */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-1">Tickets by Category</p>
            <p className="text-[11px] text-slate-400 mb-3">Click a card to view tickets</p>
            {categoryData.length > 0 ? (
              <CategoryBubbles
                data={categoryData}
                maxVal={catMax}
                onCategoryClick={d => openDrawer(
                  d.label + " Tickets",
                  selectedBucket ? formatBucketLabel(selectedBucket.period, selectedBucket.value) : "All time",
                  filteredTickets.filter(t => {
                    const cat = typeof t.category === "object" ? t.category?.value : t.category;
                    return cat === d.category;
                  })
                )}
              />
            ) : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}
          </div>

          {/* Priority bars */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-700 mb-1">Tickets by Priority</p>
            <p className="text-[11px] text-slate-400 mb-3">Click a bar to view tickets</p>
            {priorityData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={priorityData} barCategoryGap="35%">
                  <XAxis dataKey="priority" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "6px 12px", fontSize: 12 }}>
                          <p style={{ fontWeight: 600, color: "#1e293b" }}>{payload[0].payload.priority}: {payload[0].value} tickets</p>
                          <p style={{ color: "#4f46e5", fontSize: 11 }}>Click to view</p>
                        </div>
                      );
                    }}
                    cursor={false}
                  />
                  <Bar dataKey="count" radius={[6,6,0,0]}
                    shape={(props) => (
                      <ClickableBar {...props} fill={props.color || PRIORITY_COLORS[props.priority] || "#4f46e5"} opacity={1}
                        onClick={() => openDrawer(
                          props.priority + " Tickets",
                          selectedBucket ? formatBucketLabel(selectedBucket.period, selectedBucket.value) : "All time",
                          filteredTickets.filter(t => t.priority === props.priority)
                        )}
                      />
                    )}
                  >
                    {priorityData.map(d => <Cell key={d.priority} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}
          </div>
        </div>

      </div>
    </>
  );
}