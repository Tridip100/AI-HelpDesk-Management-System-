import { useState, useEffect, useRef } from "react";
import client from "../../api/client";
import {
  Brain, Send, Check, Wrench,
  AlertTriangle, RefreshCw,
} from "lucide-react";

const STATUS_STYLES = {
  open:        "bg-slate-100 text-slate-600",
  ai_pending:  "bg-amber-50 text-amber-600 border border-amber-200",
  assigned:    "bg-indigo-50 text-indigo-600 border border-indigo-200",
  in_progress: "bg-indigo-50 text-indigo-600 border border-indigo-200",
  resolved:    "bg-emerald-50 text-emerald-600 border border-emerald-200",
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
const RESOLVED_STATUSES = ["resolved", "closed"];

function Badge({ text, styles }) {
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${styles?.[text] || "bg-slate-100 text-slate-500"}`}>
      {text?.replace("_", " ")}
    </span>
  );
}

function TypingDots() {
  return (
    <span className="flex gap-1 items-center h-4">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  );
}

export default function EngineerDashboard() {
  const [tickets, setTickets]         = useState([]);
  const [selected, setSelected]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [messages, setMessages]       = useState([]);
  const [input, setInput]             = useState("");
  const [sending, setSending]         = useState(false);
  const [sessionId, setSessionId]     = useState(null);
  const [showResolve, setShowResolve] = useState(false);
  const [resolveText, setResolveText] = useState("");
  const [resolving, setResolving]     = useState(false);
  const [msg, setMsg]                 = useState({ text: "", type: "" });
  const scrollRef                     = useRef(null);

  useEffect(() => {
    client.get("/tickets/").then(r => { setTickets(r.data); setLoading(false); });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const showNotif = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: "", type: "" }), 3000);
  };

  const selectTicket = (ticket) => {
    if (selected?.id === ticket.id) return;
    setSelected(ticket);
    setSessionId(null);
    setShowResolve(false);
    setResolveText("");

    const isResolved = RESOLVED_STATUSES.includes(ticket.status);
    const lines = [
      `I've loaded ticket #${ticket.id.slice(0, 8)}: "${ticket.title}"`,
      `Category: ${ticket.category || "unknown"} | Priority: ${ticket.priority} | Status: ${ticket.status}`,
    ];

    if (ticket.description) lines.push(`\nDescription:\n${ticket.description}`);

    if (ticket.ai_suggestion) {
      lines.push(`\nAI-suggested fix:\n${ticket.ai_suggestion}`);
    } else {
      lines.push("\nNo AI suggestion available for this ticket.");
    }

    if (isResolved && ticket.resolution_text) {
      lines.push(`\nResolution:\n${ticket.resolution_text}`);
    } else if (!isResolved) {
      lines.push("\nAsk me anything — summarize, next steps, diagnostic commands, root cause analysis.");
    }

    setMessages([{ role: "assistant", content: lines.join("\n"), isContext: true }]);
  };

  // Build ticket context string for engineer_mode
  const getTicketContext = () => {
    if (!selected) return null;
    return [
      `Title: ${selected.title}`,
      `Category: ${selected.category || "unknown"}`,
      `Priority: ${selected.priority}`,
      `Status: ${selected.status}`,
      `Description: ${selected.description || "N/A"}`,
      `AI Suggestion: ${selected.ai_suggestion || "none"}`,
    ].join("\n");
  };

  const sendMessage = async () => {
    if (!input.trim() || !selected) return;
    const text = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setSending(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("http://127.0.0.1:8000/chat/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          message:        text,
          session_id:     sessionId,
          engineer_mode:  true,           // ← engineer mode on
          ticket_context: getTicketContext(), // ← ticket context for LLM
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "", buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data    = line.slice(6);
          const trimmed = data.trim();

          if (trimmed.startsWith('{"type"')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.type === "nlp" || parsed.type === "confidence") {
                if (parsed.session_id) setSessionId(parsed.session_id);
              }
            } catch {}
            continue;
          }

          aiText += data;
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: "assistant", content: aiText };
            return updated;
          });
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Failed to get response. Please try again.",
        };
        return updated;
      });
    } finally {
      setSending(false);
    }
  };

  const resolve = async () => {
    if (!selected || !resolveText.trim()) return;
    setResolving(true);
    try {
      await client.post(`/tickets/${selected.id}/resolve`, { resolution_text: resolveText });
      showNotif("Ticket resolved successfully");
      setShowResolve(false);
      setResolveText("");
      const r = await client.get("/tickets/");
      setTickets(r.data);
      setSelected(r.data.find(t => t.id === selected.id) || null);
    } catch {
      showNotif("Failed to resolve", "error");
    } finally {
      setResolving(false);
    }
  };

  const active     = tickets.filter(t => !RESOLVED_STATUSES.includes(t.status));
  const done       = tickets.filter(t => RESOLVED_STATUSES.includes(t.status));
  const isResolved = selected && RESOLVED_STATUSES.includes(selected.status);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 140px)" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Assignments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {active.length} active · {done.length} resolved
          </p>
        </div>
        <div className="flex items-center gap-3">
          {msg.text && (
            <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${
              msg.type === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
            }`}>
              {msg.text}
            </span>
          )}
          <button
            onClick={() => client.get("/tickets/").then(r => setTickets(r.data))}
            className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-500"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main grid — ticket list + AI panel side by side */}
      <div className="flex gap-5 flex-1 min-h-0">

        {/* ── Left: ticket list ─────────────────────── */}
        <div className="w-72 flex-shrink-0 flex flex-col min-h-0">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden h-full">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex-shrink-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">My Tickets</p>
            </div>
            <div className="overflow-y-auto flex-1">
              {loading ? (
                <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
              ) : active.length === 0 && done.length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  <Wrench size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active assignments</p>
                  <p className="text-xs mt-1">You're all caught up!</p>
                </div>
              ) : (
                <>
                  {active.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2">
                        Active ({active.length})
                      </p>
                      {active.map(t => (
                        <button
                          key={t.id}
                          onClick={() => selectTicket(t)}
                          className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-indigo-50/60 transition-colors ${
                            selected?.id === t.id ? "bg-indigo-50 border-l-4 border-l-indigo-500" : ""
                          }`}
                        >
                          <p className="text-sm font-medium text-slate-800 truncate">{t.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">#{t.id.slice(0, 8)}</p>
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            <Badge text={t.priority} styles={PRIORITY_STYLES} />
                            <Badge text={t.status}   styles={STATUS_STYLES} />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {done.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2 mt-1">
                        Resolved ({done.length})
                      </p>
                      {done.map(t => (
                        <button
                          key={t.id}
                          onClick={() => selectTicket(t)}
                          className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors opacity-60 ${
                            selected?.id === t.id ? "opacity-100 bg-slate-100" : ""
                          }`}
                        >
                          <p className="text-sm font-medium text-slate-700 truncate">{t.title}</p>
                          <p className="text-xs text-slate-400 mt-0.5 font-mono">#{t.id.slice(0, 8)}</p>
                          <Badge text={t.status} styles={STATUS_STYLES} />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: AI assistant panel ──────────────── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden h-full">

            {/* Chat header */}
            <div className="border-b border-slate-100 px-5 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 to-white flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Brain size={20} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">AI Assistant</p>
                  <p className="text-xs text-slate-500">
                    {selected
                      ? `Engineer mode · ${selected.title.slice(0, 40)}${selected.title.length > 40 ? "..." : ""}`
                      : "Select a ticket to get AI-powered help"}
                  </p>
                </div>
              </div>

              {selected && !isResolved && (
                <div className="flex items-center gap-2">
                  {selected.priority === "P1" && (
                    <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full border border-red-200">
                      <AlertTriangle size={11} /> P1 Critical
                    </span>
                  )}
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-mono hidden md:block">
                    #{selected.id.slice(0, 8)}
                  </span>
                  <button
                    onClick={() => setShowResolve(!showResolve)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      showResolve
                        ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    <Check size={13} />
                    {showResolve ? "Cancel" : "Mark Resolved"}
                  </button>
                </div>
              )}

              {selected && isResolved && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 font-medium">
                  <Check size={13} /> Resolved
                </span>
              )}
            </div>

            {/* Resolve form */}
            {showResolve && !isResolved && (
              <div className="px-5 py-3.5 bg-emerald-50 border-b border-emerald-100 flex gap-2 items-start flex-shrink-0">
                <div className="flex-1">
                  <p className="text-xs font-medium text-emerald-700 mb-1.5">Resolution notes</p>
                  <textarea
                    value={resolveText}
                    onChange={e => setResolveText(e.target.value)}
                    className="w-full bg-white border border-emerald-200 rounded-xl px-3 py-2 text-xs text-slate-700 h-16 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300"
                    placeholder="Describe the steps taken to resolve this issue..."
                  />
                </div>
                <div className="flex flex-col gap-1.5 mt-5">
                  <button
                    onClick={resolve}
                    disabled={resolving || !resolveText.trim()}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-medium disabled:opacity-40 hover:bg-emerald-700 whitespace-nowrap"
                  >
                    {resolving ? "Saving..." : "Submit"}
                  </button>
                </div>
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
              {!selected ? (
                <div className="text-center text-slate-400 mt-20">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
                    <Brain size={28} className="text-indigo-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">Select a ticket to start</p>
                  <p className="text-xs mt-1 text-slate-400 max-w-xs mx-auto">
                    Click any ticket — I'll load its context instantly. Then ask me anything:
                    summaries, next steps, commands, root cause analysis.
                  </p>
                </div>
              ) : messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="flex items-end gap-2 max-w-[85%]">
                    {m.role === "assistant" && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mb-1">
                        <Brain size={14} className="text-indigo-600" />
                      </div>
                    )}
                    <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : m.isContext
                        ? "bg-slate-50 text-slate-700 rounded-bl-sm border border-slate-200 font-mono text-xs"
                        : "bg-white text-slate-700 rounded-bl-sm border border-slate-100"
                    }`}>
                      {m.content
                        ? <span className="whitespace-pre-wrap">{m.content}</span>
                        : <TypingDots />
                      }
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="border-t border-slate-100 p-4 flex gap-2 bg-white flex-shrink-0">
              <input
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:bg-white focus:border-indigo-200 transition-all"
                placeholder={
                  selected
                    ? "Ask anything — summarize, next steps, commands, root cause..."
                    : "Select a ticket first"
                }
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !sending && !e.shiftKey && sendMessage()}
                disabled={sending || !selected}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !input.trim() || !selected}
                className="bg-indigo-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-indigo-700 disabled:opacity-30 transition-colors flex-shrink-0"
              >
                {sending
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Send size={15} />
                }
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}