import { FormEvent, useRef, useState } from "react";
import { API_URL } from "../api";

const SUGGESTIONS = [
  "Should I irrigate my maize today?",
  "What is the rain risk in the next 3 hours?",
  "Is it safe to spray pesticides now?",
  "What is the current heat stress level?",
  "Je, ninaweza kumwagilia mazao leo?",
  "Give me a summary of today's conditions.",
];

interface Message {
  role: "user" | "assistant";
  text: string;
  templated?: boolean;
  loading?: boolean;
}

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 4, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#555",
            display: "inline-block",
            animation: `blink 1.2s ${i * 0.2}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`@keyframes blink { 0%,100%{opacity:.2} 50%{opacity:1} }`}</style>
    </span>
  );
}

export function AskSentinel() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", text: "", loading: true }]);

    try {
      const response = await fetch(`${API_URL}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const body = await response.json();
      setMessages((m) => [
        ...m.filter((msg) => !msg.loading),
        {
          role: "assistant",
          text: body.answer,
          templated: body.response_type === "templated",
        },
      ]);
    } catch (err: any) {
      setMessages((m) => m.filter((msg) => !msg.loading));
      setError(err?.message || "Connection failed. Check backend is running.");
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    send(question);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      {/* Page header */}
      <div className="page-header">
        <p className="label-xs" style={{ marginBottom: 8 }}>AI-powered</p>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", color: "#f0f0f0", margin: 0 }}>
          Ask Sentinel
        </h1>
        <p style={{ fontSize: 13, color: "#555", marginTop: 8 }}>
          Answers grounded in live sensor data. English and Swahili supported.
        </p>
      </div>

      {/* Suggestions — only shown when no conversation yet */}
      {messages.length === 0 && (
        <div style={{ marginBottom: 32 }}>
          <p className="label-xs" style={{ marginBottom: 12 }}>Try asking</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                style={{
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 6,
                  padding: "8px 14px",
                  fontSize: 12,
                  color: "#888",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#f0f0f0";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.2)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "#888";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.1)";
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          minHeight: messages.length > 0 ? 200 : 0,
          marginBottom: 24,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              gap: 10,
            }}
          >
            {msg.role === "assistant" && (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "#1a1a1a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  flexShrink: 0,
                  marginTop: 4,
                }}
              >
                S
              </div>
            )}
            <div
              className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}
              style={{
                maxWidth: "78%",
                padding: "12px 16px",
              }}
            >
              {msg.templated && (
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "#f59e0b",
                    marginBottom: 8,
                  }}
                >
                  Template response — AI unavailable
                </p>
              )}
              {msg.loading ? (
                <Dots />
              ) : (
                <pre
                  style={{
                    fontFamily: "inherit",
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "#d0d0d0",
                    whiteSpace: "pre-wrap",
                    margin: 0,
                  }}
                >
                  {msg.text}
                </pre>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10 }}>
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about current conditions, rain risk, irrigation…"
          disabled={loading}
          style={{ flex: 1 }}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || !question.trim()}
        >
          {loading ? "Sending…" : "Send"}
        </button>
      </form>

      {messages.length > 0 && (
        <button
          style={{
            marginTop: 12,
            background: "transparent",
            border: "none",
            color: "#444",
            fontSize: 12,
            cursor: "pointer",
            padding: 0,
            fontFamily: "inherit",
          }}
          onClick={() => { setMessages([]); setError(null); }}
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}
