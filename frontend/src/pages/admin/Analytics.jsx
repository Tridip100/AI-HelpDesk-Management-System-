import { useState, useEffect, useRef } from "react";
import client from "../../api/client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const AnimatedNumber = ({ value }) => {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (value === "—" || value === undefined) return;
    const numeric = parseFloat(String(value).replace("%", ""));
    const isPercent = String(value).includes("%");
    const start = prev.current;
    const end = numeric;
    const duration = 700;
    const startTime = performance.now();

    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplay(isPercent ? `${current}%` : current);
      if (t < 1) requestAnimationFrame(tick);
      else prev.current = end;
    };
    requestAnimationFrame(tick);
  }, [value]);

  if (value === "—") return <span>—</span>;
  return <span>{display}</span>;
};

const AIRateRing = ({ rate }) => {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setProgress(rate), 100);
    return () => clearTimeout(t);
  }, [rate]);

  const dash = (progress / 100) * circ;

  return (
    <svg width="96" height="96" viewBox="0 0 96 96">
      <circle cx="48" cy="48" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
      <circle
        cx="48"
        cy="48"
        r={r}
        fill="none"
        stroke="#4f46e5"
        strokeWidth="8"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 48 48)"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)" }}
      />
      <text
        x="48"
        y="53"
        textAnchor="middle"
        fontSize="15"
        fontWeight="700"
        fill="#4f46e5"
      >
        {rate}%
      </text>
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
  const [period, setPeriod] = useState("daily");
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState("bar");

  useEffect(() => {
    Promise.all([
      client.get("/admin/stats/summary"),
      client.get("/admin/metrics"),
    ]).then(([s, m]) => {
      setSummary(s.data);
      setMetrics(m.data);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const url =
      period === "daily"
        ? "/admin/stats/daily?days=30"
        : period === "weekly"
        ? "/admin/stats/weekly?weeks=12"
        : "/admin/stats/monthly?months=12";

    client.get(url).then((r) => {
      const key =
        period === "daily" ? "date" : period === "weekly" ? "week" : "month";
      setData(r.data.map((d) => ({ name: d[key], count: d.count })));
      setLoading(false);
    });
  }, [period]);

  const aiRate = metrics
    ? Math.round(
        (metrics.auto_solved / Math.max(metrics.total_tickets, 1)) * 100
      )
    : 0;

  const pieData = metrics
    ? [
        { name: "AI Resolved", value: metrics.auto_solved ?? 0 },
        {
          name: "Manual",
          value: (metrics.resolved ?? 0) - (metrics.auto_solved ?? 0),
        },
      ]
    : [];

  const cumulativeData = data.map((d, i) => ({
    ...d,
    cumulative: data.slice(0, i + 1).reduce((sum, x) => sum + x.count, 0),
  }));

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">
            Ticket trends and resolution performance
          </p>
        </div>
        <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {["daily", "weekly", "monthly"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${
                period === p
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Stats + AI Ring Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {/* Tickets Opened */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Tickets Opened
          </p>
          <p className="text-4xl font-bold text-indigo-600">
            <AnimatedNumber value={summary?.this_month} />
          </p>
          <p className="text-xs text-slate-400 mt-1">This month</p>
        </div>

        {/* Tickets Resolved */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-2">
            Tickets Resolved
          </p>
          <p className="text-4xl font-bold text-emerald-600">
            <AnimatedNumber value={metrics?.resolved} />
          </p>
          <p className="text-xs text-slate-400 mt-1">All time</p>
        </div>

        {/* AI Rate Ring Card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex items-center gap-4 md:col-span-2">
          <AIRateRing rate={aiRate} />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1">
              AI Resolution Rate
            </p>
            <p className="text-2xl font-bold text-blue-600">{aiRate}%</p>
            <p className="text-xs text-slate-400 mt-1">
              {metrics?.auto_solved ?? 0} of {metrics?.total_tickets ?? 0} tickets auto-resolved
            </p>
          </div>

          {/* Mini Pie */}
          {pieData.length > 0 && (
            <div className="ml-auto">
              <PieChart width={100} height={100}>
                <Pie
                  data={pieData}
                  cx={50}
                  cy={50}
                  innerRadius={28}
                  outerRadius={44}
                  dataKey="value"
                  startAngle={90}
                  endAngle={-270}
                >
                  <Cell fill="#4f46e5" />
                  <Cell fill="#e2e8f0" />
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                />
              </PieChart>
              <p className="text-xs text-center text-slate-400 -mt-1">breakdown</p>
            </div>
          )}
        </div>
      </div>

      {/* Chart Toggle + Charts */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
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
            <button
              onClick={() => setActiveChart("bar")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeChart === "bar"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Bar
            </button>
            <button
              onClick={() => setActiveChart("line")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeChart === "line"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Cumulative
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            <span className="animate-pulse">Loading analytics…</span>
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
            No data available
          </div>
        ) : activeChart === "bar" ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} barCategoryGap="35%">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="count" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumulativeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="cumulative"
                stroke="#4f46e5"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "#4f46e5", strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}