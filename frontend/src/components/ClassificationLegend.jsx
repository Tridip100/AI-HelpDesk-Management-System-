const ITEMS = [
  { code: "P1", label: "Critical", desc: "Entire office/company affected", color: "bg-red-500/10 text-red-400 border-red-500/20" },
  { code: "P2", label: "High", desc: "Team or department blocked", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  { code: "P3", label: "Normal", desc: "Single user, standard issue", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { code: "P4", label: "Low", desc: "Minor, no urgency", color: "bg-slate-700 text-slate-400 border-slate-600" },
];

const TIERS = [
  { code: "Tier 1", desc: "Simple question — AI answers instantly" },
  { code: "Tier 2", desc: "Technical issue — AI uses knowledge base + web search" },
  { code: "Tier 3A", desc: "Simple hardware — AI suggests basic fix" },
  { code: "Tier 3B", desc: "Complex hardware — routed to helpdesk" },
  { code: "Tier 3C", desc: "Critical/security — urgent helpdesk, no AI" },
];

export const CATEGORY_ITEMS = [
  { code: "network", label: "Network", color: "#2563eb" },
  { code: "auth", label: "Account Access", color: "#7c3aed" },
  { code: "hardware", label: "Hardware", color: "#f97316" },
  { code: "database", label: "Database", color: "#0891b2" },
  { code: "cloud_app", label: "Cloud App", color: "#4f46e5" },
  { code: "software", label: "Software", color: "#10b981" },
  { code: "security", label: "Security", color: "#dc2626" },
  { code: "hr_it", label: "HR IT", color: "#be123c" },
  { code: "other", label: "Other", color: "#64748b" },
];

export default function ClassificationLegend() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-400 mb-3">Priority levels</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {ITEMS.map((p) => (
          <div key={p.code} className={`rounded-lg border px-2.5 py-2 ${p.color}`}>
            <p className="text-xs font-semibold">{p.code} — {p.label}</p>
            <p className="text-[11px] opacity-80 mt-0.5">{p.desc}</p>
          </div>
        ))}
      </div>
      <p className="text-xs font-medium text-slate-400 mb-3">Routing tiers</p>
      <div className="space-y-1.5">
        {TIERS.map((t) => (
          <div key={t.code} className="flex gap-2 text-xs">
            <span className="font-medium text-purple-300 w-16 flex-shrink-0">{t.code}</span>
            <span className="text-slate-500">{t.desc}</span>
          </div>
        ))}
      </div>
      <p className="text-xs font-medium text-slate-400 mb-3 mt-4">Ticket categories</p>
      <div className="grid grid-cols-2 gap-2">
        {CATEGORY_ITEMS.map((c) => (
          <div key={c.code} className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-2">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
              <p className="text-xs font-semibold text-slate-200">{c.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
