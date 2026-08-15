"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface AIInsights {
  summary: string;
  main_topics: string[];
  sentiment: string;
  important_questions: string[];
  top_concerns: string[];
  action_items: string[];
  recommendation: string;
}

interface SessionReport {
  title: string;
  executive_summary: string;
  topics_covered: string[];
  comprehension_breakdown: string;
  unresolved_questions: string[];
  recommended_next_lecture_plan: string[];
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

interface PollData {
  id: number;
  room_id: string;
  question: string;
  options: string[];
  is_active: boolean;
  votes: Record<string, number>;
  total_votes: number;
}

interface StudentMetric {
  username: string;
  message_count: number;
  questions_asked: string[];
  voted: boolean;
  badge: string;
  last_active: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(false);
  const [roomId, setRoomId] = useState("room1");
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Time-window filters
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Auto-pulse state
  const [autoPulse, setAutoPulse] = useState(false);
  const [lastAnalyzedCount, setLastAnalyzedCount] = useState(0);

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

  // Poll States
  const [activePoll, setActivePoll] = useState<PollData | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["Yes, completely", "Somewhat confused", "Not at all"]);
  const [creatingPoll, setCreatingPoll] = useState(false);

  // Session Report State
  const [report, setReport] = useState<SessionReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  // Student Analytics State
  const [students, setStudents] = useState<StudentMetric[]>([]);

  // Trigger real-time AI analysis from FastAPI backend
  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `http://127.0.0.1:8000/rooms/${roomId}/analyze`;
      const queryParams = new URLSearchParams();
      if (startTime) queryParams.append("start_time", startTime);
      if (endTime) queryParams.append("end_time", endTime);
      if (queryParams.toString()) {
        url += `?${queryParams.toString()}`;
      }

      let res = await fetch(url, { method: "POST" });
      let data = await res.json();

      if (data.insights) {
        setInsights(data.insights);
        setLastAnalyzedCount(data.message_count || 0);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to connect to backend";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [roomId, startTime, endTime]);

  // Fetch active poll on mount
  const fetchActivePoll = useCallback(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/polls/active`);
      const data = await res.json();
      if (data.poll) {
        setActivePoll(data.poll);
      }
    } catch (err) {
      console.error("Failed to fetch active poll:", err);
    }
  }, [roomId]);

  // Fetch student engagement data
  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/students`);
      const data = await res.json();
      if (data.students) {
        setStudents(data.students);
      }
    } catch (err) {
      console.error("Failed to fetch student analytics:", err);
    }
  }, [roomId]);

  useEffect(() => {
    if (activeTab === "Students") {
      fetchStudents();
    }
  }, [activeTab, fetchStudents]);

  // Connect to WebSocket room
  useEffect(() => {
    fetchActivePoll();
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "poll_created" || data.type === "poll_update") {
          setActivePoll(data.poll);
        } else {
          setMessages((prev) => [...prev, data]);
          if (data.participants !== undefined) {
            setParticipantCount(data.participants);
          }
        }
      } catch (err) {
        console.error("Failed to parse WS message:", err);
      }
    };

    ws.onclose = () => setWsConnected(false);

    return () => {
      ws.close();
    };
  }, [roomId, fetchActivePoll]);

  // Auto-Pulse interval handler
  useEffect(() => {
    if (!autoPulse) return;

    const interval = setInterval(() => {
      const userMessages = messages.filter((m) => m.type === "message");
      if (userMessages.length > lastAnalyzedCount) {
        handleAnalyze();
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [autoPulse, messages, lastAnalyzedCount, handleAnalyze]);

  // Send message over WebSocket
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      type: "message",
      username: inputUser.trim() || "Anonymous",
      message: inputMsg.trim(),
    };

    wsRef.current.send(JSON.stringify(payload));
    setInputMsg("");
  };

  // Submit a poll vote over WebSocket
  const handleVote = (option: string) => {
    if (!activePoll || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      type: "poll_vote",
      poll_id: activePoll.id,
      username: inputUser.trim() || "Anonymous",
      selected_option: option,
    };

    wsRef.current.send(JSON.stringify(payload));
  };

  // Create new poll
  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion.trim()) return;

    const filteredOptions = pollOptions.filter((opt) => opt.trim().length > 0);
    if (filteredOptions.length < 2) {
      setError("Please provide at least 2 options for the poll.");
      return;
    }

    setCreatingPoll(true);
    setError(null);

    try {
      const res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: pollQuestion.trim(),
          options: filteredOptions,
        }),
      });

      const data = await res.json();
      if (data.poll) {
        setActivePoll(data.poll);
        setPollQuestion("");
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create poll";
      setError(errorMessage);
    } finally {
      setCreatingPoll(false);
    }
  };

  // Generate End-of-Session Report
  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setError(null);
    try {
      const res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/report`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate report";
      setError(errorMessage);
    } finally {
      setGeneratingReport(false);
    }
  };

  // Download Report as Markdown File
  const handleExportMarkdown = () => {
    if (!report) return;

    const content = `# ${report.title}
*Generated by ClassPulse AI • Room: ${roomId.toUpperCase()}*

## Executive Summary
${report.executive_summary}

## Topics Covered
${report.topics_covered.map((t) => `- ${t}`).join("\n")}

## Comprehension Breakdown
${report.comprehension_breakdown}

## Unresolved Student Questions
${report.unresolved_questions.map((q) => `- ${q}`).join("\n")}

## Recommended Next Lecture Plan
${report.recommended_next_lecture_plan.map((step, idx) => `${idx + 1}. ${step}`).join("\n")}
`;

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ClassPulse_Report_${roomId}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
        body: JSON.stringify({
          query: askQuery.trim(),
          start_time: startTime || null,
          end_time: endTime || null,
        }),
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

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPulse}
                  onChange={(e) => setAutoPulse(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-0"
                />
                Auto AI Pulse (15s)
              </label>

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

          {/* Time Window Filter */}
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/60 p-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="font-semibold text-slate-300">⏱️ Time-Window Filter:</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Start Time:</label>
              <input
                type="text"
                placeholder="e.g. 2026-08-15T14:00:00"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">End Time:</label>
              <input
                type="text"
                placeholder="e.g. 2026-08-15T15:00:00"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200"
              />
            </div>
            {(startTime || endTime) && (
              <button
                onClick={() => {
                  setStartTime("");
                  setEndTime("");
                }}
                className="text-xs text-rose-400 hover:underline"
              >
                Clear Filter
              </button>
            )}
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
              ⚠️ {error}
            </div>
          )}

          {/* TAB 1: OVERVIEW */}
          {activeTab === "Overview" && (
            <>
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
                  <p className="text-sm text-slate-400">Active Poll Status</p>
                  <p className="mt-2 text-3xl font-bold">
                    {activePoll ? `${activePoll.total_votes} Votes` : "None"}
                  </p>
                  <p className="mt-2 text-sm text-emerald-400">
                    {activePoll ? "Live student polling" : "No active poll"}
                  </p>
                </div>
              </div>

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

          {/* TAB 2: LIVE CLASS */}
          {activeTab === "Live Class" && (
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col h-[600px]">
                <h3 className="text-xl font-semibold mb-2">Live Room Stream</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Incoming WebSocket messages for {roomId.toUpperCase()}
                </p>

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

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Live Class Guide</h3>
                  <ol className="mt-4 list-decimal list-inside space-y-3 text-sm text-slate-300 leading-relaxed">
                    <li>Enable <strong>Auto AI Pulse</strong> above for continuous intelligence.</li>
                    <li>Simulate student queries from different usernames.</li>
                    <li>Launch quick comprehension polls in the <strong>Polls</strong> tab.</li>
                    <li>Check individual student metrics in the <strong>Students</strong> tab.</li>
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

          {/* TAB 3: QUESTIONS */}
          {activeTab === "Questions" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col h-[650px]">
              <div>
                <h3 className="text-xl font-semibold">Ask ClassPulse AI</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Query anything about this room&rsquo;s conversations, student questions, or specific topics.
                </p>
              </div>

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

          {/* TAB 4: POLLS */}
          {activeTab === "Polls" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold">Active Classroom Poll</h3>
                    {activePoll && (
                      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                        Live ({activePoll.total_votes} votes)
                      </span>
                    )}
                  </div>

                  {activePoll ? (
                    <div className="mt-6">
                      <p className="text-lg font-medium text-slate-100 mb-5">
                        {activePoll.question}
                      </p>

                      <div className="space-y-4">
                        {activePoll.options.map((opt, idx) => {
                          const voteCount = activePoll.votes[opt] || 0;
                          const percent = activePoll.total_votes > 0
                            ? Math.round((voteCount / activePoll.total_votes) * 100)
                            : 0;

                          return (
                            <div key={idx} className="space-y-1.5">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-200">{opt}</span>
                                <span className="font-semibold text-slate-400">
                                  {voteCount} ({percent}%)
                                </span>
                              </div>
                              <div className="h-3 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                <div
                                  className="h-full bg-blue-500 transition-all duration-500"
                                  style={{ width: `${percent}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-8 border-t border-slate-800 pt-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Cast a Vote (Simulating as {inputUser})
                          </p>
                          <select
                            value={inputUser}
                            onChange={(e) => setInputUser(e.target.value)}
                            className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300"
                          >
                            <option value="Arun">Arun</option>
                            <option value="Priya">Priya</option>
                            <option value="Rahul">Rahul</option>
                            <option value="Sneha">Sneha</option>
                            <option value="Kiran">Kiran</option>
                          </select>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {activePoll.options.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleVote(opt)}
                              className="rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-blue-600 hover:border-blue-500 transition"
                            >
                              Vote &ldquo;{opt}&rdquo;
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-12 text-center text-slate-500 italic">
                      No active poll running. Launch a new poll using the form.
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-xl font-semibold mb-1">Launch New Poll</h3>
                <p className="text-sm text-slate-400 mb-6">
                  Broadcast an instant comprehension check to all participants in {roomId.toUpperCase()}.
                </p>

                <form onSubmit={handleCreatePoll} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Question Prompt
                    </label>
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="e.g. Can Dijkstra's algorithm work with negative edge weights?"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                      Poll Choices
                    </label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const newOpts = [...pollOptions];
                              newOpts[idx] = e.target.value;
                              setPollOptions(newOpts);
                            }}
                            placeholder={`Option ${idx + 1}`}
                            className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                          />
                          {pollOptions.length > 2 && (
                            <button
                              type="button"
                              onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                              className="rounded-lg border border-slate-800 px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {pollOptions.length < 5 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions([...pollOptions, ""])}
                        className="mt-2 text-xs font-medium text-blue-400 hover:underline"
                      >
                        + Add another option
                      </button>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={creatingPoll || !pollQuestion.trim()}
                    className="w-full mt-4 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {creatingPoll ? "Launching..." : "🚀 Broadcast Poll to Class"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: STUDENTS (PARTICIPATION & ENGAGEMENT METRICS) */}
          {activeTab === "Students" && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <h3 className="text-xl font-semibold">Student Participation & Activity</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Live engagement tracking, question counts, and voting status for {roomId.toUpperCase()}.
                  </p>
                </div>
                <button
                  onClick={fetchStudents}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  🔄 Refresh Metrics
                </button>
              </div>

              {students.length === 0 ? (
                <div className="py-12 text-center text-slate-500 italic">
                  No individual student interactions recorded yet. Messages sent via student portal will appear here.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="border-b border-slate-800 bg-slate-950/50 text-xs font-semibold uppercase text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Student Name</th>
                        <th className="px-4 py-3">Engagement Badge</th>
                        <th className="px-4 py-3">Messages</th>
                        <th className="px-4 py-3">Questions Flagged</th>
                        <th className="px-4 py-3">Poll Voted</th>
                        <th className="px-4 py-3">Last Active</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {students.map((s, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-4 py-3.5 font-medium text-white">{s.username}</td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                                s.badge === "Inquisitive"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                  : s.badge === "Highly Active"
                                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                  : s.badge === "Engaged Voter"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                  : "bg-slate-800 text-slate-400 border-slate-700"
                              }`}
                            >
                              {s.badge}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-slate-200">{s.message_count}</td>
                          <td className="px-4 py-3.5">
                            {s.questions_asked.length > 0 ? (
                              <span className="text-amber-400 font-medium">
                                {s.questions_asked.length} question(s)
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {s.voted ? (
                              <span className="text-emerald-400 font-semibold">✓ Yes</span>
                            ) : (
                              <span className="text-slate-500">✗ No</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-400">
                            {new Date(s.last_active).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: REPORTS */}
          {activeTab === "Reports" && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
                <div>
                  <h3 className="text-xl font-semibold">End-of-Lecture Executive Report</h3>
                  <p className="mt-1 text-sm text-slate-400">
                    Synthesize chat discussions, unanswered student questions, and poll metrics into an exportable digest.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleGenerateReport}
                    disabled={generatingReport}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    {generatingReport ? "Generating Digest with Gemini..." : "⚡ Generate Session Report"}
                  </button>

                  {report && (
                    <button
                      onClick={handleExportMarkdown}
                      className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold hover:bg-slate-700 text-slate-200 transition"
                    >
                      📥 Download .MD
                    </button>
                  )}
                </div>
              </div>

              {report ? (
                <div className="space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-8">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      ClassPulse Lecture Digest
                    </span>
                    <h2 className="mt-1 text-2xl font-bold text-white">{report.title}</h2>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-5">
                    <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Executive Summary
                    </h4>
                    <p className="text-sm leading-relaxed text-slate-200">
                      {report.executive_summary}
                    </p>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Topics Covered
                      </h4>
                      <ul className="list-disc list-inside space-y-1.5 text-sm text-slate-300">
                        {report.topics_covered.map((topic, i) => (
                          <li key={i}>{topic}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Comprehension & Poll Breakdown
                      </h4>
                      <p className="text-sm leading-relaxed text-slate-300">
                        {report.comprehension_breakdown}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-3">
                        Unresolved Questions
                      </h4>
                      {report.unresolved_questions.length > 0 ? (
                        <ul className="space-y-2 text-sm text-slate-300">
                          {report.unresolved_questions.map((q, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-amber-400 font-semibold">•</span>
                              <span>{q}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No unresolved questions flagged.</p>
                      )}
                    </div>

                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-5">
                      <h4 className="text-sm font-semibold uppercase tracking-wider text-blue-300 mb-3">
                        Recommended Next Lecture Plan
                      </h4>
                      <ol className="list-decimal list-inside space-y-2 text-sm text-slate-200">
                        {report.recommended_next_lecture_plan.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-12 text-center">
                  <p className="text-slate-400 font-medium">No report generated for this session yet.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Click &ldquo;⚡ Generate Session Report&rdquo; above to create a structured post-lecture summary.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}