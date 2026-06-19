import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import client from "../../api/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { ArrowLeft, Database, MessageSquare, BookOpen, RefreshCw } from "lucide-react";

const COLORS = ["#4f46e5", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

const TABS = [
  { key: "cache",         label: "Solution Cache",   icon: Database },
  { key: "conversations", label: "Resolved Chats",   icon: MessageSquare },
  { key: "knowledge",     label: "Knowledge Base",   icon: BookOpen },
];

export default function LearningStats() {
  const [params, setParams] = useSearchParams();
  const navigate             = useNavigate();
  const [data, setData]      = useState(null);
  const [loading, setLoading]= useState(true);
  const activeTab             = params.get("tab") || "cache";

  const fetchData = () => {
    setLoading(true);
    client.get("/admin/learning-stats")
      .then(r => setData(r.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const setTab = (tab) => setParams({ tab });

  // Build category breakdown for the cache bar chart
  const cacheCategoryData = (data?.recently_learned || []).reduce((acc, item) => {
    const cat = item.category || "unknown";
    const found = acc.find(x => x.name === cat);
    if (found) found.count++;
    else acc.push({ name: cat, count: 1 });
    return acc;
  }, []);

  return (
    <div className="w-full">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
      >
        <ArrowLeft size={16} /> Back to Overview
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Continuous Learning</h1>
          <p className="text-sm text-slate-500 mt-1">
            How the system improves over time — no model retraining, just smarter retrieval
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === t.key
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {loading || !data ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center text-slate-400 shadow-sm">
          Loading learning data...
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-slate-500 mb-2">Solution Cache</p>
              <p className="text-3xl font-bold text-indigo-600">{data.solution_cache_size}</p>
              <p className="text-xs text-slate-400 mt-1">Instant-answer entries</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-slate-500 mb-2">Resolved Conversations</p>
              <p className="text-3xl font-bold text-emerald-600">{data.resolved_tickets_size}</p>
              <p className="text-xs text-slate-400 mt-1">Stored from chat history</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-slate-500 mb-2">Knowledge Base</p>
              <p className="text-3xl font-bold text-blue-600">{data.sop_chunks_size}</p>
              <p className="text-xs text-slate-400 mt-1">SOP & document chunks</p>
            </div>
          </div>

          {/* Cache tab content */}
          {activeTab === "cache" && (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-5">Cached Solutions by Category</h3>
                {cacheCategoryData.length === 0 ? (
                  <p className="text-center text-slate-400 py-12 text-sm">
                    No cached solutions yet — resolve a few tickets via chat to populate this
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={cacheCategoryData}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={85}
                        dataKey="count"
                        paddingAngle={2}
                        label={({ name, count }) => `${name} (${count})`}
                      >
                        {cacheCategoryData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-900">Recently Learned Solutions</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Most recent additions to the solution cache</p>
                </div>
                {!data.recently_learned?.length ? (
                  <div className="p-12 text-center text-slate-400 text-sm">
                    No solutions cached yet. As users confirm "yes, resolved" in chat,
                    solutions get stored here for instant reuse.
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Problem</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Category</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Times Reused</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.recently_learned.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3.5 text-slate-700">{item.problem}</td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                              {item.category}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold ${Number(item.uses) > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                              {item.uses}×
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {/* Conversations tab */}
          {activeTab === "conversations" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm text-center">
              <MessageSquare size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {data.resolved_tickets_size} resolved conversations stored
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Every time a user confirms an AI chat resolved their issue, the conversation
                is summarized and embedded into the knowledge base — future similar questions
                will retrieve this as relevant context.
              </p>
            </div>
          )}

          {/* Knowledge base tab */}
          {activeTab === "knowledge" && (
            <div className="bg-white border border-slate-200 rounded-2xl p-10 shadow-sm text-center">
              <BookOpen size={32} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {data.sop_chunks_size} document chunks indexed
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Loaded from uploaded SOPs, manuals, and historical resolved tickets.
                The RAG pipeline searches this collection before generating any answer.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}