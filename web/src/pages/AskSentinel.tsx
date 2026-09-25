import { FormEvent, useEffect, useRef, useState } from "react";
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
  response_type?: "llm" | "agent" | "templated";
  templated?: boolean;
  loading?: boolean;
}

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 5, padding: "6px 2px" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#86868b",
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
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<"gemini" | "groq">("gemini");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedKey = localStorage.getItem("sentinel_api_key") || "";
    const savedProvider = (localStorage.getItem("sentinel_provider") as any) || "gemini";
    setApiKey(savedKey);
    setProvider(savedProvider);
  }, []);

  function saveConfig(key: string, prov: "gemini" | "groq") {
    setApiKey(key);
    setProvider(prov);
    if (key.trim()) {
      localStorage.setItem("sentinel_api_key", key.trim());
    } else {
      localStorage.removeItem("sentinel_api_key");
    }
    localStorage.setItem("sentinel_provider", prov);
  }

  async function send(q: string) {
    if (!q.trim() || loading) return;
    setError(null);
    setMessages((m) => [...m, { role: "user", text: q }]);
    setQuestion("");
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", text: "", loading: true }]);

    try {
      const payload: Record<string, any> = { question: q };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
        payload.provider = provider;
      }

      const response = await fetch(`${API_URL}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
          response_type: body.response_type,
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
    <div style={{ maxWidth: 840, margin: "0 auto", paddingBottom: 64 }}>
      {/* Page header */}
      <div className="page-header" style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <span className="apple-badge badge-blue" style={{ marginBottom: 8 }}>
            GROUNDED AGRI-ASSISTANT
          </span>
          <h1 className="apple-title" style={{ margin: "4px 0 0 0" }}>
            Ask Sentinel
          </h1>
          <p style={{ fontSize: 14, color: "#6e6e73", marginTop: 6, fontWeight: 400 }}>
            Real-time agronomic answers grounded in verified Conduit station telemetry. English & Kiswahili supported.
          </p>
        </div>

        <button
          onClick={() => setShowConfig(!showConfig)}
          className="apple-btn apple-btn-secondary"
          style={{ fontSize: 12, height: 36, padding: "0 14px", marginTop: 4 }}
        >
          {showConfig ? "Close Settings" : apiKey ? "AI Settings (Active)" : "AI Settings (Optional)"}
        </button>
      </div>

      {/* Optional AI Configuration Panel */}
      {showConfig && (
        <div className="apple-card" style={{ padding: "20px 24px", marginBottom: 28 }}>
          <p className="apple-subhead" style={{ marginBottom: 8 }}>AI Engine Configuration</p>
          <p style={{ fontSize: 13, color: "#6e6e73", marginBottom: 16, lineHeight: 1.4 }}>
            By default, Sentinel runs its built-in <strong>Telemetry-Grounded Agro-Intelligence Engine</strong> completely offline with zero API keys required. You can optionally paste a Gemini or Groq key below to enable cloud LLM synthesis.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#86868b", display: "block", marginBottom: 4 }}>
                Cloud Provider
              </label>
              <select
                className="input"
                value={provider}
                onChange={(e) => saveConfig(apiKey, e.target.value as any)}
                style={{ height: 38, fontSize: 13, width: "100%" }}
              >
                <option value="gemini">Google Gemini 2.0 Flash</option>
                <option value="groq">Groq (Llama 3.3 70B)</option>
              </select>
            </div>

            <div style={{ flex: "2 1 320px" }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#86868b", display: "block", marginBottom: 4 }}>
                API Key (Optional)
              </label>
              <input
                type="password"
                className="input"
                placeholder={provider === "gemini" ? "AIzaSy..." : "gsk_..."}
                value={apiKey}
                onChange={(e) => saveConfig(e.target.value, provider)}
                style={{ height: 38, fontSize: 13, width: "100%" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ color: apiKey ? "#248a3d" : "#0071e3", fontWeight: 600 }}>
              {apiKey ? `✓ Key configured for ${provider === "gemini" ? "Gemini" : "Groq"}` : "• Currently running Offline Local Agro-Engine"}
            </span>
            {apiKey && (
              <button
                onClick={() => saveConfig("", provider)}
                style={{ background: "none", border: "none", color: "#d70015", cursor: "pointer", fontSize: 11, fontWeight: 600 }}
              >
                Remove Key
              </button>
            )}
          </div>
        </div>
      )}

      {/* Suggestions */}
      {messages.length === 0 && (
        <div className="apple-card" style={{ padding: "24px", marginBottom: 28 }}>
          <p className="apple-subhead" style={{ marginBottom: 12 }}>Suggested Farmer Queries</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                style={{
                  background: "rgba(0, 0, 0, 0.03)",
                  border: "1px solid rgba(0, 0, 0, 0.08)",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#1d1d1f",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  textAlign: "left",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "#ffffff";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 113, 227, 0.4)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = "rgba(0, 0, 0, 0.03)";
                  (e.currentTarget as HTMLElement).style.borderColor = "rgba(0, 0, 0, 0.08)";
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
            background: "rgba(255, 59, 48, 0.08)",
            border: "1px solid rgba(255, 59, 48, 0.2)",
            borderRadius: 10,
            padding: "14px 18px",
            marginBottom: 20,
            fontSize: 13,
            fontWeight: 600,
            color: "#d70015",
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
          gap: 14,
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
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "#1d1d1f",
                  color: "#ffffff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                AI
              </div>
            )}
            <div
              className={msg.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"}
              style={{
                maxWidth: "80%",
                padding: "14px 18px",
              }}
            >
              {msg.response_type === "agent" && (
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#248a3d",
                    background: "rgba(52, 199, 89, 0.12)",
                    border: "1px solid rgba(52, 199, 89, 0.25)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    display: "inline-block",
                    marginBottom: 8,
                  }}
                >
                  Sentinel Agro-Engine · Telemetry Grounded
                </p>
              )}
              {msg.response_type === "llm" && (
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#0071e3",
                    background: "rgba(0, 113, 227, 0.12)",
                    border: "1px solid rgba(0, 113, 227, 0.25)",
                    padding: "2px 8px",
                    borderRadius: 4,
                    display: "inline-block",
                    marginBottom: 8,
                  }}
                >
                  Cloud AI · Telemetry Grounded
                </p>
              )}
              {msg.templated && (
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: "#b25e02",
                    background: "rgba(255, 159, 10, 0.12)",
                    border: "1px solid rgba(255, 159, 10, 0.25)",
                    padding: "2px 6px",
                    borderRadius: 4,
                    display: "inline-block",
                    marginBottom: 8,
                  }}
                >
                  System Template Output
                </p>
              )}
              {msg.loading ? (
                <Dots />
              ) : (
                <pre
                  style={{
                    fontFamily: "inherit",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: msg.role === "user" ? "#ffffff" : "#1d1d1f",
                    fontWeight: 400,
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
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          className="input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about current conditions, rain risk, irrigation, or Swahili advice…"
          disabled={loading}
          style={{ flex: 1, height: 44, fontSize: 14 }}
        />
        <button
          type="submit"
          className="apple-btn apple-btn-primary"
          disabled={loading || !question.trim()}
          style={{ height: 44, padding: "0 22px", fontSize: 13 }}
        >
          {loading ? "Thinking…" : "Send"}
        </button>
      </form>

      {messages.length > 0 && (
        <button
          style={{
            marginTop: 14,
            background: "transparent",
            border: "none",
            color: "#86868b",
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            padding: 0,
          }}
          onClick={() => { setMessages([]); setError(null); }}
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}
