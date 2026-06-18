import { useState, useEffect, useRef } from "react";
import client from "../../api/client";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

const AnimatedNumber = ({ value }) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    if (value === "—" || value === undefined) return;
    const numeric   = parseFloat(String(value).replace("%", ""));
    const isPercent = String(value).includes("%");
    const start = prev.current, end = numeric;
    const duration = 700, startTime = performance.now();
    const tick = (now) => {
      const t      = Math.min((now - startTime) / duration, 1);
      const eased  = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(isPercent ? `${current}%` : current);
      if (t < 1) requestAnimationFrame(tick); else prev.current = end;
    };
    requestAnimationFrame(tick);
  }, [value]);
  if (value === "—") return <span>—</span>;
  return <span>{display}</span>;
};

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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-2 shadow-md text-sm">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="font-semibold text-slate-900">
        {payload[0].name === "cumulative" ? "Total: " : "Tickets: "}
        <span className="text-indigo-600">{payload[0].value}</span>
      </p>
    </div>
  );
};

export default function AdminAnalytics() {
  const [period, setPeriod]         = useState("daily");
  const [data, setData]             = useState([]);
  const [summary, setSummary]       = useState(null);
  const [metrics, setMetrics]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [activeChart, setActiveChart] = useState("bar");
  const [activePieIdx, setActivePieIdx] = useState(0);

  useEffect(() => {
    Promise.all([
      client.get("/admin/stats/summary"),
      client.get("/admin/metrics"),
    ]).then(([s, m]) => { setSummary(s.data); setMetrics(m.data); });
  }, []);

  useEffect(() => {
    setLoading(true);
    const url = period === "daily"   ? "/admin/stats/daily?days=30"
              : period === "weekly"  ? "/admin/stats/weekly?weeks=12"
              :                        "/admin/stats/monthly?months=12";
    client.get(url).then(r => {
      const key = period === "daily" ? "date" : period === "weekly" ? "week" : "month";
      setData(r.data.map(d => ({ name: d[key], count: d.count })));
      setLoading(false);
    });
  }, [period]);

  const aiRate = metrics ? Math.round((metrics.auto_solved / Math.max(metrics.total_tickets, 1)) * 100) : 0;

  const pieData = metrics ? [
    { name: "AI Resolved", value: metrics.auto_solved ?? 0 },
    { name: "Manual",      value: (metrics.resolved ?? 0) - (metrics.auto_solved ?? 0) },
  ] : [];

  const cumulativeData = data.map((d, i) => ({
    ...d,
    cumulative: data.slice(0, i + 1).reduce((sum, x) => sum + x.count, 0),
  }));

  const kpiCards = [
    { label: "Tickets Opened",   value: summary?.this_month, sub: "This month",  color: "text-indigo-600",  hoverBorder: "hover:border-indigo-300",  hoverBg: "hover:bg-indigo-50/30" },
    { label: "Tickets Resolved", value: metrics?.resolved,   sub: "All time",    color: "text-emerald-600", hoverBorder: "hover:border-emerald-300", hoverBg: "hover:bg-emerald-50/30" },
    { label: "Escalated",        value: metrics?.escalated ?? "—", sub: "Active escalations", color: "text-red-600", hoverBorder: "hover:border-red-300", hoverBg: "hover:bg-red-50/30" },
    { label: "Avg Resolution",   value: metrics?.avg_resolution_hours ? `${metrics.avg_resolution_hours}h` : "—", sub: "Hours to resolve", color: "text-blue-600", hoverBorder: "hover:border-blue-300", hoverBg: "hover:bg-blue-50/30" },
  ];

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Ticket trends and resolution performance</p>
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {["daily", "weekly", "monthly"].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all duration-200 ${
                period === p ? "bg-indigo-600 text-white shadow-sm scale-[1.02]" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI stat cards — zoom + coloured border */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {kpiCards.map((s, i) => (
          <div key={s.label}
            className={`bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
                        transition-all duration-200 hover:scale-[1.03] hover:shadow-lg
                        ${s.hoverBorder} ${s.hoverBg}`}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">{s.label}</p>
            <p className={`text-4xl font-bold ${s.color}`}><AnimatedNumber value={s.value} /></p>
            <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* AI Rate + Pie row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* AI Rate Ring */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
                        transition-all duration-200 hover:shadow-md hover:border-indigo-200 flex items-center gap-6">
          <AIRateRing rate={aiRate} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">AI Resolution Rate</p>
            <p className="text-3xl font-bold text-indigo-600">{aiRate}%</p>
            <p className="text-xs text-slate-400 mt-1">{metrics?.auto_solved ?? 0} of {metrics?.total_tickets ?? 0} tickets auto-resolved</p>
          </div>
          {pieData.length > 0 && (
            <div className="ml-auto">
              <PieChart width={100} height={100}>
                <Pie data={pieData} cx={50} cy={50} innerRadius={28} outerRadius={44}
                  dataKey="value" startAngle={90} endAngle={-270}>
                  <Cell fill="#4f46e5" /><Cell fill="#e2e8f0" />
                </Pie>
                <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 12 }} />
              </PieChart>
              <p className="text-xs text-center text-slate-400 -mt-1">breakdown</p>
            </div>
          )}
        </div>

        {/* Status donut */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm
                        transition-all duration-200 hover:shadow-md hover:border-slate-300">
          <p className="text-sm font-semibold text-slate-700 mb-3">Resolution Split</p>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <PieChart width={120} height={120}>
                <Pie data={pieData} cx={60} cy={60} innerRadius={32} outerRadius={52}
                  dataKey="value" activeIndex={activePieIdx}
                  onMouseEnter={(_, i) => setActivePieIdx(i)}
                  paddingAngle={3}>
                  {pieData.map((_, i) => <Cell key={i} fill={["#4f46e5","#e2e8f0"][i]} />)}
                </Pie>
              </PieChart>
              <div className="flex flex-col gap-2">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1 transition-colors"
                    onMouseEnter={() => setActivePieIdx(i)}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: ["#4f46e5","#e2e8f0"][i] }} />
                    <span className="text-slate-600">{d.name}</span>
                    <span className="font-semibold text-slate-900 ml-auto">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-sm text-slate-400 py-8 text-center">No data</p>}
        </div>
      </div>

      {/* Main chart */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {activeChart === "bar" ? "Tickets Over Time" : "Cumulative Tickets Trend"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {period === "daily" ? "Last 30 days" : period === "weekly" ? "Last 12 weeks" : "Last 12 months"}
            </p>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {[["bar","Bar"],["line","Cumulative"]].map(([key, label]) => (
              <button key={key} onClick={() => setActiveChart(key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
                  activeChart === key ? "bg-white text-slate-900 shadow-sm scale-[1.02]" : "text-slate-500 hover:text-slate-700"
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            <span className="animate-pulse">Loading analytics…</span>
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">No data available</div>
        ) : activeChart === "bar" ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="cumulative" stroke="#4f46e5" strokeWidth={2.5}
                dot={false} activeDot={{ r: 5, fill: "#4f46e5", strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}