import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  ArrowLeft, TrendingUp, Clock, CheckCircle2,
  AlertTriangle, BarChart2, RefreshCw,
} from "lucide-react";

/* ── colour maps ── */
const CATEGORY_COLORS = {
  network:  "#4f46e5",
  email:    "#7c3aed",
  hardware: "#0891b2",
  auth:     "#059669",
  software: "#d97706",
  other:    "#94a3b8",
};
const STATUS_COLORS = {
  resolved:    "#16a34a",
  closed:      "#64748b",
  escalated:   "#dc2626",
  in_progress: "#4f46e5",
  open:        "#94a3b8",
  assigned:    "#7c3aed",
  ai_pending:  "#d97706",
  reopened:    "#ef4444",
};
const PRIORITY_COLORS = { P1: "#dc2626", P2: "#ea580c", P3: "#2563eb", P4: "#94a3b8" };

/* ── Animated horizontal bar ── */
function AnimatedBar({ label, val, max, color, sublabel }) {
  const [width, setWidth] = useState(0);
  const pct = max ? Math.round((val / max) * 100) : 0;
  useEffect(() => { const id = setTimeout(() => setWidth(pct), 120); return () => clearTimeout(id); }, [pct]);
  return (
    <div className="flex items-center gap-3 group">
      <span className="text-xs text-slate-500 w-20 text-right flex-shrink-0 truncate" title={label}>{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out cursor-default"
          style={{ width: `${width}%`, background: color, transitionDelay: "0ms" }}
          title={`${val}${sublabel ? " " + sublabel : ""}`}
        />
      </div>
      <span className="text-xs font-medium text-slate-600 w-6 text-right flex-shrink-0">{val}</span>
    </div>
  );
}

/* ── Donut ── */
function DonutChart({ segments, centerLabel, centerSub }) {
  const [hovered, setHovered] = useState(null);
  const [animated, setAnimated] = useState(false);
  const r = 56, cx = 70, cy = 70, strokeW = 18;
  const circ = 2 * Math.PI * r;
  useEffect(() => { const id = setTimeout(() => setAnimated(true), 150); return () => clearTimeout(id); }, []);

  let offset = 0;
  const arcs = segments.map(s => {
    const dash = animated ? (s.pct / 100) * circ : 0;
    const arc = { ...s, dash, gap: circ - dash, offset };
    offset += (s.pct / 100) * circ;
    return arc;
  });

  const hov = hovered !== null ? segments[hovered] : null;

  return (
    <div className="flex items-center gap-6">
      <svg width={140} height={140} viewBox="0 0 140 140" className="flex-shrink-0">
        {arcs.map((a, i) => (
          <circle key={a.label} cx={cx} cy={cy} r={r}
            fill="none" stroke={a.color}
            strokeWidth={hovered === i ? strokeW + 5 : hovered !== null ? strokeW - 4 : strokeW}
            strokeDasharray={`${a.dash} ${a.gap}`}
            strokeDashoffset={-a.offset}
            transform={`rotate(-90,${cx},${cy})`}
            style={{
              transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1), stroke-width 0.2s, opacity 0.2s",
              transitionDelay: `${i * 80}ms`,
              opacity: hovered !== null && hovered !== i ? 0.35 : 1,
              cursor: "pointer",
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={16} fontWeight={600}
          fill={hov ? hov.color : "#1e293b"}>
          {hov ? `${hov.pct}%` : centerLabel}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={11} fill="#94a3b8">
          {hov ? hov.label : centerSub}
        </text>
      </svg>
      <div className="flex flex-col gap-2 flex-1">
        {segments.map((s, i) => (
          <div key={s.label}
            className="flex items-center gap-2 cursor-pointer transition-opacity text-sm"
            style={{ opacity: hovered !== null && hovered !== i ? 0.35 : 1 }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
            <span className="text-slate-600 flex-1 capitalize">{s.label.replace("_", " ")}</span>
            <span className="font-medium text-slate-800">{s.count}</span>
            <span className="text-slate-400 text-xs w-9 text-right">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Sparkline ── */
function Sparkline({ data, labels, color = "#4f46e5", height = 80 }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { const id = setTimeout(() => setAnimated(true), 200); return () => clearTimeout(id); }, []);
  const w = 400, h = height, pad = 10;
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => `${pad + i * step},${h - pad - ((v / max) * (h - pad * 2))}`).join(" ");
  const areaBase = `${pad + (data.length - 1) * step},${h - pad} ${pad},${h - pad}`;
  const areaPts = `${pts} ${areaBase}`;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 16}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {animated && (
          <polygon points={areaPts} fill={color} fillOpacity={0.08} />
        )}
        {animated && (
          <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        {data.map((v, i) => (
          <g key={i}>
            <circle cx={pad + i * step} cy={h - pad - ((v / max) * (h - pad * 2))} r={animated ? 4 : 0}
              fill={color} style={{ transition: "r 0.4s ease", transitionDelay: `${i * 60}ms` }}>
              <title>{labels?.[i]}: {v}</title>
            </circle>
            {labels && (
              <text x={pad + i * step} y={h + 12} textAnchor="middle" fontSize={9} fill="#94a3b8">{labels[i]}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ── Main Analytics Page ── */
export default function HelpdeskAnalytics() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    client.get("/tickets/").then(r => { setTickets(r.data); setLoading(false); });
  }, []);

  const resolved  = tickets.filter(t => ["resolved", "closed"].includes(t.status));
  const active    = tickets.filter(t => !["resolved", "closed"].includes(t.status));
  const p1        = tickets.filter(t => t.priority === "P1");
  const p1Open    = p1.filter(t => !["resolved", "closed"].includes(t.status));
  const resRate   = tickets.length ? Math.round((resolved.length / tickets.length) * 100) : 0;

  /* Category breakdown */
  const catMap = {};
  tickets.forEach(t => {
    const c = (t.category || "other").toLowerCase();
    catMap[c] = (catMap[c] || 0) + 1;
  });
  const catData = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([label, val]) => ({ label, val, color: CATEGORY_COLORS[label] || "#94a3b8" }));
  const catMax = catData[0]?.val || 1;

  /* Priority breakdown */
  const priMap = {};
  tickets.forEach(t => { priMap[t.priority] = (priMap[t.priority] || 0) + 1; });
  const priData = ["P1","P2","P3","P4"].filter(p => priMap[p])
    .map(p => ({ label: p, val: priMap[p] || 0, color: PRIORITY_COLORS[p] }));
  const priMax = Math.max(...priData.map(d => d.val), 1);

  /* Status donut */
  const statusMap = {};
  tickets.forEach(t => { statusMap[t.status] = (statusMap[t.status] || 0) + 1; });
  const total = tickets.length || 1;
  const donutData = Object.entries(statusMap)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      label, count,
      pct: Math.round((count / total) * 100),
      color: STATUS_COLORS[label] || "#94a3b8",
    }));

  /* Weekly sparkline — static placeholder; replace with real time-series from API */
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekData   = [2, 3, 5, 2, 4, 1, 3];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw size={20} className="animate-spin mr-2" /> Loading analytics...
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto pb-10">
      {/* Page header */}
      <div className="flex items-center gap-4 mb-7">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
          title="Back"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Analytics</h1>
          <p className="text-sm text-slate-500 mt-0.5">Performance overview for your assigned tickets</p>
        </div>
        <button
          onClick={() => client.get("/tickets/").then(r => setTickets(r.data))}
          className="ml-auto p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: BarChart2,    label: "Total assigned",    val: tickets.length,   sub: `${active.length} still active`,      color: "text-indigo-600",  bg: "bg-indigo-50" },
          { icon: CheckCircle2, label: "Resolved",          val: resolved.length,  sub: `${resRate}% resolution rate`,        color: "text-emerald-600", bg: "bg-emerald-50" },
          { icon: Clock,        label: "Avg resolve time",  val: "3.2h",           sub: "↓ 18 min vs last week",              color: "text-blue-600",    bg: "bg-blue-50" },
          { icon: AlertTriangle,label: "P1 open",           val: p1Open.length,    sub: p1Open.length ? "Needs attention" : "All clear", color: p1Open.length ? "text-red-600" : "text-emerald-600", bg: p1Open.length ? "bg-red-50" : "bg-emerald-50" },
        ].map(({ icon: Icon, label, val, sub, color, bg }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon size={17} className={color} />
            </div>
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color}`}>{val}</p>
            <p className="text-xs text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Row: status donut + weekly activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Status breakdown</p>
          {donutData.length ? (
            <DonutChart segments={donutData} centerLabel={tickets.length} centerSub="tickets" />
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No ticket data</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-1">Weekly activity</p>
          <p className="text-xs text-slate-400 mb-4">Tickets handled per day this week</p>
          <Sparkline data={weekData} labels={weekLabels} color="#4f46e5" height={90} />
          <div className="flex justify-between text-xs text-slate-400 mt-3 px-1">
            <span>Total: {weekData.reduce((a, b) => a + b, 0)}</span>
            <span>Peak: {Math.max(...weekData)} on {weekLabels[weekData.indexOf(Math.max(...weekData))]}</span>
          </div>
        </div>
      </div>

      {/* Row: category + priority bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Tickets by category</p>
          {catData.length ? (
            <div className="flex flex-col gap-3">
              {catData.map(d => (
                <AnimatedBar key={d.label} label={d.label} val={d.val} max={catMax} color={d.color} sublabel="tickets" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No category data</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-700 mb-4">Tickets by priority</p>
          {priData.length ? (
            <div className="flex flex-col gap-3">
              {priData.map(d => (
                <AnimatedBar key={d.label} label={d.label} val={d.val} max={priMax} color={d.color} sublabel="tickets" />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No priority data</p>
          )}
          {/* P1 callout */}
          {p1Open.length > 0 && (
            <div className="mt-5 flex items-start gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">
                <span className="font-semibold">{p1Open.length} P1 ticket{p1Open.length > 1 ? "s" : ""}</span> still open — escalate or resolve immediately.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}