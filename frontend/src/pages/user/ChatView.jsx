import { useEffect, useRef, useState } from "react";
import { Brain, Check, Globe, Search, Ticket } from "lucide-react";
import { IconChat, IconMic, IconPhone, IconSend, IconStop, IconTicket, IconWrench } from "../../components/Icons";

const STAGE_ICON = {
  analyzing:        Search,
  cache_check:      Brain,
  knowledge_base:   Brain,
  web_search:       Globe,
  thinking:         Brain,
  creating_ticket:  Ticket,
  escalating:       Ticket,
};

function TypingDots() {
  return (
    <span className="inline-flex gap-1">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
    </span>
  );
}

function renderContent(text = "") {
  return text.split("\n").map((line, i) => (
    <span key={i}>
      {line}
      {i < text.split("\n").length - 1 && <br />}
    </span>
  ));
}

export default function ChatView({ mode, onTicketCreated }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [statusSteps, setStatusSteps] = useState([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileRef = useRef(null);
  const scrollRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const parseStream = async (res) => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let aiText = "";
    let started = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        const trimmed = data.trim();

        if (trimmed.startsWith("{")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.session_id) setSessionId(parsed.session_id);
            if (parsed.type === "status") {
              setStatusSteps((prev) => [...prev, parsed]);
              continue;
            }
            if (parsed.type === "vision") {
              setMessages((prev) => [...prev, { role: "system", content: `Screenshot understood: ${parsed.description}` }]);
            }
            if (parsed.type === "auto_solved") {
              setMessages(prev => [...prev, {
                role: "system",
                content: "✅ Issue marked as resolved by AI",
                isAutoSolved: true,
              }]);
              return;
            }
            if (parsed.type === "escalated") {
              setMessages((prev) => [...prev, { role: "system", content: `Ticket created: ${parsed.ticket_id}` }]);
              onTicketCreated?.();
            }
          } catch {}
          continue;
        }

        if (!started) {
          started = true;
          setThinking(false);
          setStatusSteps([]);
          setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
        }
        aiText += data;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: aiText };
          return next;
        });
      }
    }
  };

  const sendMessage = async (overrideText, imageFile) => {
    const text = overrideText ?? input;
    if (!text.trim() && !imageFile) return;
    setMessages((prev) => [...prev, { role: "user", content: text || "Uploaded a screenshot" }]);
    setInput("");
    setSending(true);
    setThinking(true);
    setStatusSteps([]);

    try {
      let res;
      if (imageFile) {
        const body = new FormData();
        body.append("message", text);
        if (sessionId) body.append("session_id", sessionId);
        body.append("image", imageFile);
        res = await fetch("http://127.0.0.1:8000/chat/message-with-image", {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body,
        });
      } else {
        res = await fetch("http://127.0.0.1:8000/chat/message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify({ message: text, session_id: sessionId }),
        });
      }
      await parseStream(res);
    } catch {
      setMessages((prev) => [...prev, { role: "system", content: "Unable to reach AI support right now." }]);
    } finally {
      setSending(false);
      setThinking(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await sendVoice(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const sendVoice = async (blob) => {
    setTranscribing(true);
    const body = new FormData();
    body.append("audio", blob, "recording.webm");
    try {
      const res = await fetch("http://127.0.0.1:8000/intake/call", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        body,
      });
      const data = await res.json();
      await sendMessage(data.transcript || "Voice support request");
    } catch {
      setMessages((prev) => [...prev, { role: "system", content: "Voice processing failed. Try again." }]);
    } finally {
      setTranscribing(false);
    }
  };

  if (mode === "voice") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eef3f9] p-6">
        <div className="w-full max-w-[370px] rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#4034aa] text-white">
            <IconPhone width={34} height={34} />
          </div>
          <h1 className="mt-5 text-xl font-semibold">Voice Support</h1>
          <p className="mt-3 text-sm text-slate-500">Connect with a support agent via voice call</p>
          <button
            onClick={recording ? stopRecording : startRecording}
            className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            {recording ? <IconStop width={17} height={17} /> : <IconPhone width={17} height={17} />}
            {recording ? "Stop Call" : transcribing ? "Processing..." : "Start Call"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#eef3f9]">
      <header className="flex h-[76px] items-center justify-between border-b border-slate-200 bg-white px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500 text-white">
            <IconChat width={19} height={19} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Live Chat Support</h1>
            <p className="text-xs text-slate-500">Helpdesk team · Typically replies in minutes</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Online
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto mb-6 w-fit rounded-full bg-slate-200 px-4 py-1 text-xs text-slate-500">
          Welcome to HelpDesk Live Chat! A support agent will be with you shortly.
        </div>
        <div className="mx-auto max-w-4xl space-y-4">
          {messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "flex justify-end" : "flex justify-start"}>
              {message.role === "system" ? (
                <div className="mx-auto flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1 text-xs text-slate-600">
                  <IconTicket width={13} height={13} />
                  {message.content}
                </div>
              ) : (
                <div className={`max-w-xl rounded-xl border px-4 py-3 text-sm leading-6 ${message.role === "user" ? "border-indigo-500 bg-indigo-500 text-white" : "border-slate-200 bg-white text-slate-900"}`}>
                  {renderContent(message.content)}
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div className="flex justify-start">
              <div className="flex items-end gap-2 max-w-[80%]">
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <Brain size={14} className="text-indigo-600" />
                </div>
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-white border border-slate-200 shadow-sm min-w-[220px]">
                  {statusSteps.length === 0 ? <TypingDots /> : (
                    <div className="space-y-1.5">
                      {statusSteps.map((s, i) => {
                        const Icon   = STAGE_ICON[s.stage] || Brain;
                        const isLast = i === statusSteps.length - 1;
                        return (
                          <div key={i} className={`flex items-center gap-2 text-xs transition-all ${isLast ? "text-slate-700" : "text-slate-400"}`}>
                            {isLast ? (
                              <Icon size={12} className="text-indigo-400 flex-shrink-0" />
                            ) : (
                              <Check size={12} className="text-emerald-500 flex-shrink-0" />
                            )}
                            <span className={isLast ? "" : "line-through"}>{s.label}</span>
                            {isLast && (
                              <span className="flex gap-0.5 ml-auto">
                                {[0,1,2].map(j => (
                                  <span key={j} className="w-1 h-1 bg-indigo-400 rounded-full animate-bounce"
                                    style={{ animationDelay: `${j*0.15}s` }} />
                                ))}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <input
            className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="Type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !sending && sendMessage()}
            disabled={sending}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) sendMessage(input, file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50"
            title="Attach screenshot"
          >
            <IconWrench width={17} height={17} />
          </button>
          <button
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            className="flex h-10 w-12 items-center justify-center rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-40"
            title="Send"
          >
            <IconSend width={17} height={17} />
          </button>
        </div>
      </footer>
    </div>
  );
}
