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
    </div>
  );
}