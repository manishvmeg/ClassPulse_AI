"use client";

import { useState, useEffect, useRef } from "react";

interface AIInsights {
  summary: string;
  main_topics: string[];
  sentiment: string;
  important_questions: string[];
  top_concerns: string[];
  action_items: string[];
  recommendation: string;
}

interface ChatMessage {
  type: string;
  username?: string;
  message: string;
  timestamp: string;
  participants?: number;
}

interface QAItem {
  query: string;
  answer: string;
  timestamp: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(false);
  const [roomId, setRoomId] = useState("room1");
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  // WebSocket Live Chat States
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputUser, setInputUser] = useState("Arun");
  const [inputMsg, setInputMsg] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Ask AI States
  const [askQuery, setAskQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAItem[]>([]);

  // Connect to WebSocket room
  useEffect(() => {
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [...prev, data]);
        if (data.participants !== undefined) {
          setParticipantCount(data.participants);
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [roomId]);

  // Send message over WebSocket
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      username: inputUser.trim() || "Anonymous",
      message: inputMsg.trim(),
    };

    wsRef.current.send(JSON.stringify(payload));
    setInputMsg("");
  };

  // Trigger real-time AI analysis from FastAPI backend
  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    try {
      let res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/analyze`, {
        method: "POST",
      });

      let data = await res.json();

      if (data.insights) {
        setInsights(data.insights);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect to backend";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Ask ClassPulse AI custom question
  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuery.trim()) return;

    setAsking(true);
    setError(null);

    try {
      const res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: askQuery.trim() }),
      });

      const data = await res.json();

      if (data.answer) {
        setQaHistory((prev) => [
          ...prev,
          {
            query: askQuery.trim(),
            answer: data.answer,
            timestamp: new Date().toLocaleTimeString(),
          },
        ]);
        setAskQuery("");
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to query AI";
      setError(errorMessage);
    } finally {
      setAsking(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900 p-5">
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">ClassPulse AI</h1>
            <p className="mt-1 text-sm text-slate-400">
              Live Conversation Intelligence
            </p>
          </div>

          <nav className="space-y-2">
            {["Overview", "Live Class", "Questions", "Polls", "Students", "Reports"].map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setActiveTab(item)}
                  className={`w-full rounded-lg px-4 py-3 text-left transition ${
                    activeTab === item
                      ? "bg-blue-600 font-medium text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </nav>
        </aside>

        {/* Main Content Area */}
        <section className="flex-1 p-8">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Teacher Dashboard</p>
              <h2 className="mt-1 text-3xl font-bold">{activeTab}</h2>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`rounded-full px-4 py-2 text-sm font-medium border ${
                  wsConnected
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}
              >
                ● {wsConnected ? `Room ${roomId.toUpperCase()} Online (${participantCount} Active)` : "Disconnected"}
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {loading ? "Analyzing with Gemini..." : "⚡ Run AI Pulse"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              ⚠️ {error}
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === "Overview" && (
            <>
              {/* Quick Metrics */}
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Active Room</p>
                  <p className="mt-2 text-3xl font-bold uppercase">{roomId}</p>
                  <p className="mt-2 text-sm text-blue-400">Live monitoring</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Detected Questions</p>
                  <p className="mt-2 text-3xl font-bold">
                    {insights ? insights.important_questions.length : 0}
                  </p>
                  <p className="mt-2 text-sm text-amber-400">Extracted by Gemini</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Classroom Sentiment</p>
                  <p className="mt-2 text-3xl font-bold">
                    {insights ? insights.sentiment : "Pending"}
                  </p>
                  <p className="mt-2 text-sm text-indigo-400">Real-time tone</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <p className="text-sm text-slate-400">Primary Topics</p>
                  <p className="mt-2 text-3xl font-bold">
                    {insights ? insights.main_topics.length : 0}
                  </p>
                  <p className="mt-2 text-sm text-emerald-400">Identified concepts</p>
                </div>
              </div>

              {/* Detailed Intelligence Cards */}
              <div className="mt-6 grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                  <h3 className="text-xl font-semibold">Top Student Concerns</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Core friction points identified across messages
                  </p>

                  <div className="mt-5 space-y-3">
                    {insights && insights.top_concerns.length > 0 ? (
                      insights.top_concerns.map((concern, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3.5"
                        >
                          <span className="font-medium text-slate-200">{concern}</span>
                          <span className="rounded bg-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-400 border border-rose-500/30">
                            High Attention
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500 italic">
                        Send live messages in &ldquo;Live Class&rdquo; and click &ldquo;⚡ Run AI Pulse&rdquo;.
                      </p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                  <h3 className="text-xl font-semibold">AI Teaching Recommendation</h3>

                  <div className="mt-5 rounded-lg border border-blue-500/20 bg-blue-500/10 p-5">
                    <p className="font-medium text-blue-300">Actionable Teacher Guidance</p>
                    <p className="mt-2 text-sm leading-relaxed text-slate-300">
                      {insights
                        ? insights.recommendation
                        : "Live recommendations will generate based on active student confusion patterns."}
                    </p>
                  </div>

                  {insights && (
                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Live Session Summary
                      </p>
                      <p className="mt-1 text-sm text-slate-300 leading-relaxed">
                        {insights.summary}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Unanswered & Key Questions */}
              <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-xl font-semibold">Important Unanswered Questions</h3>
                <div className="mt-4 space-y-2">
                  {insights && insights.important_questions.length > 0 ? (
                    insights.important_questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3"
                      >
                        <span className="text-blue-400 font-bold">Q{idx + 1}:</span>
                        <span className="text-slate-200 text-sm">{q}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      No pending questions detected yet.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 2: LIVE CLASS (CHAT SIMULATOR) */}
          {activeTab === "Live Class" && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col h-[600px]">
                <h3 className="text-xl font-semibold mb-2">Live Room Stream</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Incoming WebSocket messages for {roomId.toUpperCase()}
                </p>

                {/* Message Log */}
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 border border-slate-800/80 rounded-lg p-4 bg-slate-950/50">
                  {messages.length === 0 ? (
                    <p className="text-sm text-slate-500 italic text-center mt-10">
                      No messages yet. Send a message below to test live conversation flow.
                    </p>
                  ) : (
                    messages.map((m, idx) => (
                      <div key={idx} className="text-sm">
                        {m.type === "system" ? (
                          <div className="text-xs text-slate-500 italic py-1 border-b border-slate-800/50">
                            ⚙️ {m.message} ({new Date(m.timestamp).toLocaleTimeString()})
                          </div>
                        ) : (
                          <div className="rounded-lg bg-slate-900 border border-slate-800 p-3">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-blue-400">{m.username}</span>
                              <span className="text-xs text-slate-500">
                                {new Date(m.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <p className="text-slate-200">{m.message}</p>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Send Message Form */}
                <form onSubmit={handleSendMessage} className="mt-4 flex gap-3">
                  <select
                    value={inputUser}
                    onChange={(e) => setInputUser(e.target.value)}
                    className="rounded-lg border border-slate-800 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Arun">Arun</option>
                    <option value="Priya">Priya</option>
                    <option value="Rahul">Rahul</option>
                    <option value="Sneha">Sneha</option>
                    <option value="Kiran">Kiran</option>
                  </select>

                  <input
                    type="text"
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    placeholder="Type a student message/question..."
                    className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />

                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-700 transition"
                  >
                    Send
                  </button>
                </form>
              </div>

              {/* Quick Info Panel */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold">How to Test Real-Time Flow</h3>
                  <ol className="mt-4 list-decimal list-inside space-y-3 text-sm text-slate-300 leading-relaxed">
                    <li>Select different student names from the dropdown.</li>
                    <li>Send 3-4 messages expressing questions or confusion about a topic.</li>
                    <li>Switch to the <strong>Questions</strong> tab to ask natural language questions.</li>
                    <li>Click <strong>⚡ Run AI Pulse</strong> on Overview to view the full classroom synthesis.</li>
                  </ol>
                </div>

                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className="w-full mt-6 rounded-lg bg-emerald-600 px-5 py-3 text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition"
                >
                  {loading ? "Analyzing..." : "⚡ Analyze Active Room Now"}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: QUESTIONS (ASK CLASSPULSE AI COPILOT) */}
          {activeTab === "Questions" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col h-[650px]">
              <div>
                <h3 className="text-xl font-semibold">Ask ClassPulse AI</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Query anything about this room&rsquo;s conversations, student questions, or specific topics.
                </p>
              </div>

              {/* Q&A Chat Display */}
              <div className="mt-6 flex-1 overflow-y-auto space-y-4 pr-2 border border-slate-800/80 rounded-lg p-5 bg-slate-950/60">
                {qaHistory.length === 0 ? (
                  <div className="text-center mt-20">
                    <p className="text-slate-400 font-medium">No inquiries yet.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try asking: &ldquo;What did students ask about Dijkstra?&rdquo; or &ldquo;Who had questions regarding slide 3?&rdquo;
                    </p>
                  </div>
                ) : (
                  qaHistory.map((item, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm max-w-lg text-white">
                          <p className="font-semibold text-xs text-blue-200 mb-0.5">Teacher Query</p>
                          {item.query}
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm max-w-2xl text-slate-200">
                          <p className="font-semibold text-xs text-emerald-400 mb-1">ClassPulse Copilot</p>
                          <div className="whitespace-pre-wrap leading-relaxed">{item.answer}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Question Input Form */}
              <form onSubmit={handleAskAI} className="mt-4 flex gap-3">
                <input
                  type="text"
                  value={askQuery}
                  onChange={(e) => setAskQuery(e.target.value)}
                  placeholder="Ask anything about the class discussion..."
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={asking || !askQuery.trim()}
                  className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  {asking ? "Thinking..." : "Ask AI"}
                </button>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}