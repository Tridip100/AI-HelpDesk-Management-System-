import { useState, useEffect } from "react";
import client from "../../api/client";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Sector,
} from "recharts";

const COLORS = [
  "#4f46e5",
  "#06b6d4",
  "#10b981",
  "#f59e0b",
  "#ef4444",
];

const renderActiveShape = (props) => {
  const {
    cx, cy, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, value,
  } = props;

  return (
    <g>
      <text
        x={cx}
        y={cy - 10}
        textAnchor="middle"
        fill={fill}
        className="text-sm font-semibold"
        style={{ fontSize: 13, fontWeight: 600 }}
      >
        {payload.name}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        fill="#64748b"
        style={{ fontSize: 12 }}
      >
        {value} tickets
      </text>
      {/* Outer pop-out slice */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      {/* Inner ring accent */}
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius - 6}
        outerRadius={innerRadius - 2}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [digest, setDigest] = useState(null);
  const [loadingDigest, setLoadingDigest] = useState(false);
  const [activePieIndex, setActivePieIndex] = useState(0);

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
    } finally {
      setLoadingDigest(false);
    }
  };

  const categoryData = tickets.reduce((acc, t) => {
    if (!t.category) return acc;
    const found = acc.find((x) => x.name === t.category);
    if (found) {
      found.count++;
    } else {
      acc.push({ name: t.category, count: 1 });
    }
    return acc;
  }, []);

  const statusData = tickets.reduce((acc, t) => {
    const found = acc.find((x) => x.name === t.status);
    if (found) {
      found.value++;
    } else {
      acc.push({ name: t.status, value: 1 });
    }
    return acc;
  }, []);

  const stats = [
    {
      label: "Total Tickets",
      value: metrics?.total_tickets ?? "—",
      sub: "All time",
    },
    {
      label: "Open Tickets",
      value: tickets.filter((t) =>
        ["open", "ai_pending", "reviewing"].includes(t.status)
      ).length,
      sub: "Requires attention",
    },
    {
      label: "Resolved by AI",
      value: metrics?.auto_solved ?? "—",
      sub: `${metrics?.auto_solve_rate ?? 0}% of total`,
    },
    {
      label: "Resolved by Engineers",
      value: metrics?.resolved ?? "—",
      sub: "Human resolved",
    },
  ];

  return (
    <div className="w-full">
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .enter { animation: slideUp 0.4s ease-out backwards; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">System Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Welcome back. Here's the current state of your support platform.
          </p>
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

      {/* Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="enter bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all"
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            <p className="text-sm text-slate-500 mb-2">{s.label}</p>
            <p className="text-4xl font-bold text-slate-900 mb-2">{s.value}</p>
            <p className="text-sm text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
        {/* Categories */}
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-5">Tickets by Category</h3>
          {categoryData.length === 0 ? (
            <p className="text-center text-slate-500 py-12">No data available</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#475569", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#475569", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.08)", radius: 8 }}
                  formatter={(value, _key, props) => [
                    `${value} Tickets`,
                    props.payload.name,
                  ]}
                  contentStyle={{
                    background: "#fff",
                    border: "1px solid #cbd5e1",
                    borderRadius: "12px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                    color: "#0f172a",
                  }}
                  labelStyle={{ display: "none" }}
                />
                <Bar
                  dataKey="count"
                  radius={[8, 8, 0, 0]}
                  activeBar={{ stroke: "#4338ca", strokeWidth: 2 }}
                >
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Status */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-5">Status Distribution</h3>
          {statusData.length === 0 ? (
            <p className="text-center text-slate-500 py-12">No data available</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    dataKey="value"
                    paddingAngle={3}
                    activeIndex={activePieIndex}
                    activeShape={renderActiveShape}
                    onMouseEnter={(_, index) => setActivePieIndex(index)}
                  >
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="space-y-2 mt-4">
                {statusData.map((s, i) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between text-sm cursor-pointer"
                    onMouseEnter={() => setActivePieIndex(i)}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ background: COLORS[i % COLORS.length] }}
                      />
                      <span className="text-slate-600 capitalize">{s.name}</span>
                    </div>
                    <span className="font-semibold text-slate-900">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Engineers */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-5">Engineer Performance</h3>
        {!metrics?.engineer_breakdown?.length ? (
          <p className="text-slate-500">No engineer data available.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {metrics.engineer_breakdown.map((e) => (
              <div
                key={e.username}
                className="bg-slate-50 border border-slate-200 rounded-2xl p-5"
              >
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center mb-4">
                  {e.full_name?.split(" ").map((n) => n[0]).join("") ||
                    e.username[0].toUpperCase()}
                </div>
                <h4 className="font-semibold text-slate-900">{e.full_name || e.username}</h4>
                <p className="text-3xl font-bold text-indigo-600 my-2">{e.assigned}</p>
                <p className="text-sm text-slate-500">
                  Tickets Assigned{e.avg_csat ? ` • ${e.avg_csat} CSAT` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}