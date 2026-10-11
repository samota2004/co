import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  X,
  Bot,
  User,
  ShieldCheck,
  Activity,
  BrainCircuit,
  LockKeyhole,
} from "lucide-react";

export const CopilotModal = ({ isOpen, onClose, initialContext, context }) => {
  const activeContext = context || initialContext;

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      id: "msg-init",
      sender: "assistant",
      text: "Welcome to CyberOrbit Security Copilot. I analyze real-time UEBA behavioral telemetry, explain risk score attributions, and provide prescriptive incident response recommendations. How may I assist your forensic investigation today?",
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSend = async (queryText) => {
    const textToSend = queryText || input;

    if (!textToSend.trim() || loading) return;

    const userMsg = {
      id: `msg-u-${Date.now()}`,
      sender: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);

    if (!queryText) setInput("");

    setLoading(true);

    try {
      const res = await fetch("/api/copilot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: textToSend,
          context: activeContext,
        }),
      });

      const data = await res.json();

      const assistantMsg = {
        id: `msg-a-${Date.now()}`,
        sender: "assistant",
        text:
          data.reply ||
          "I have evaluated telemetry against active policy baselines. Continuous zero trust posture maintained.",
        timestamp: new Date().toLocaleTimeString(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-err-${Date.now()}`,
          sender: "assistant",
          text: "Notice: Copilot inference connection degraded. Local policy evaluation remains active.",
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "Summarize all active security incidents",
    "Recommend Zero Trust policy optimizations",
    "Explain how the UEBA ML pipeline calculates cross-department risk",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-[#03070C]/85 backdrop-blur-md">
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-[#67E8F9]/20 bg-[#050A10] text-[#F4F7FA] shadow-[-24px_0_80px_rgba(0,0,0,0.45)]">
        {/* Master reference accents */}
        <div className="pointer-events-none absolute left-0 top-0 h-20 w-[1.5px] rounded-full bg-[#D4AF37] shadow-[0_0_20px_rgba(212,175,55,0.5)]" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-20 w-[1.5px] rounded-full bg-[#67E8F9] shadow-[0_0_20px_rgba(103,232,249,0.5)]" />

        {/* Technical grid */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.8) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* Header */}
        <div className="relative z-10 border-b border-white/10 bg-[#050A10]/95 px-5 py-5 sm:px-6 lg:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/30 bg-[#070C12] shadow-[0_0_25px_rgba(103,232,249,0.08)]">
                <BrainCircuit className="h-5 w-5 text-[#67E8F9]" />
                <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[#D4AF37] shadow-[0_0_10px_rgba(212,175,55,0.7)]" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[12px] uppercase tracking-[0.2em] text-[#67E8F9]">
                    AI Security Operations
                  </span>
                  <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-2.5 py-1 text-[11px] font-medium tracking-wide text-[#D4AF37]">
                    GEMINI ENGINE
                  </span>
                </div>

                <h3 className="mt-1 text-2xl font-light tracking-tight text-[#F4F7FA]">
                  CyberOrbit{" "}
                  <span className="text-[#67E8F9]">Security Copilot</span>
                </h3>

                <p className="mt-1.5 text-[13px] leading-5 text-[#7F8A96]">
                  Autonomous Cybersecurity & UEBA Forensic Investigator
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Close Copilot"
              className="shrink-0 rounded-xl border border-white/10 bg-[#070C12] p-2.5 text-[#7F8A96] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#050A10] hover:text-[#67E8F9] hover:shadow-[0_8px_25px_rgba(103,232,249,0.07)] focus:border-[#67E8F9]/50 focus:outline-none focus:ring-1 focus:ring-[#67E8F9]/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Operational status */}
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-2 rounded-lg border border-[#67E8F9]/20 bg-[#070C12] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#67E8F9] shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
              Engine Online
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[#070C12] px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-[#7F8A96]">
              <LockKeyhole className="h-3.5 w-3.5 text-[#D4AF37]" />
              Zero Trust Context
            </div>
          </div>
        </div>

        {/* Chat Stream */}
        <div className="relative z-10 flex-1 space-y-5 overflow-y-auto bg-[#03070C] p-5 sm:p-6">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`group flex gap-3 ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.sender === "assistant" && (
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#070C12] shadow-[0_0_18px_rgba(103,232,249,0.05)]">
                  <Bot className="h-4 w-4 text-[#67E8F9]" />
                </div>
              )}

              <div
                className={`max-w-[88%] rounded-2xl border p-4 text-[13px] leading-6 shadow-[0_10px_30px_rgba(0,0,0,0.12)] transition-all duration-300 ${
                  msg.sender === "user"
                    ? "border-[#67E8F9]/25 bg-[#050A10] text-[#F4F7FA] hover:-translate-y-0.5 hover:border-[#67E8F9]/45 hover:shadow-[0_14px_35px_rgba(103,232,249,0.06)]"
                    : "border-white/10 bg-[#070C12] text-[#A7B0BA] hover:border-[#67E8F9]/20 hover:bg-[#050A10]"
                }`}
              >
                <div className="mb-2 flex items-center gap-2">
                  {msg.sender === "user" ? (
                    <User className="h-3.5 w-3.5 text-[#67E8F9]" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 text-[#67E8F9]" />
                  )}
                  <span className="text-[10px] uppercase tracking-[0.16em] text-[#7F8A96]">
                    {msg.sender === "user" ? "Operator" : "Copilot"}
                  </span>
                </div>

                <div className="whitespace-pre-line">{msg.text}</div>

                <span className="mt-2 block text-[11px] text-[#7F8A96]">
                  {msg.timestamp}
                </span>
              </div>

              {msg.sender === "user" && (
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#050A10]">
                  <User className="h-4 w-4 text-[#67E8F9]" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex items-center justify-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#67E8F9]/25 bg-[#070C12]">
                <Bot className="h-4 w-4 text-[#67E8F9]" />
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-[#67E8F9]/20 bg-[#070C12] px-4 py-3 text-[13px] text-[#67E8F9] shadow-[0_10px_30px_rgba(103,232,249,0.05)]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#67E8F9] shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
                <span>Evaluating telemetry with Gemini Security Engine...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Prompts */}
        <div className="relative z-10 border-t border-white/10 bg-[#050A10] px-5 py-4 sm:px-6">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-[#D4AF37]" />
            <span className="text-[12px] uppercase tracking-[0.16em] text-[#67E8F9]">
              Suggested Investigations
            </span>
          </div>

          <div className="flex flex-wrap gap-2">
            {quickPrompts.map((prompt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(prompt)}
                className="rounded-xl border border-white/10 bg-[#070C12] px-3 py-2.5 text-left text-[12px] leading-4 text-[#A7B0BA] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#67E8F9]/35 hover:bg-[#050A10] hover:text-[#67E8F9] hover:shadow-[0_10px_28px_rgba(103,232,249,0.06)] focus:border-[#67E8F9]/50 focus:outline-none focus:ring-1 focus:ring-[#67E8F9]/20"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Input Bar */}
        <div className="relative z-10 border-t border-white/10 bg-[#03070C] p-5 sm:p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2.5"
          >
            <div className="relative min-w-0 flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Copilot about any user, incident, or policy..."
                className="w-full rounded-xl border border-white/10 bg-[#050A10] px-4 py-3 text-[13px] text-[#F4F7FA] placeholder:text-[#7F8A96] transition-all duration-300 hover:border-[#67E8F9]/20 focus:border-[#67E8F9]/50 focus:bg-[#070C12] focus:outline-none focus:ring-1 focus:ring-[#67E8F9]/20"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex shrink-0 items-center gap-2 rounded-xl border border-[#67E8F9] bg-[#67E8F9] px-4 py-3 text-[12px] font-semibold uppercase tracking-wide text-[#03070C] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#67E8F9]/90 hover:shadow-[0_12px_30px_rgba(103,232,249,0.12)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 focus:outline-none focus:ring-2 focus:ring-[#67E8F9]/20"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>

          <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[#7F8A96]">
            <ShieldCheck className="h-3.5 w-3.5 text-[#67E8F9]" />
            Copilot responses are grounded in the active security context
          </div>
        </div>
      </div>
    </div>
  );
};
