"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FastForward,
  FileDown,
  FileText,
  Flame,
  Gauge,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  MessageSquare,
  Mic,
  PieChart,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Sparkles,
  UserCheck,
  Users,
  Video,
  Vote,
  X,
  Zap,
} from "lucide-react";

import PaceGauge, { type PaceTelemetry } from "@/components/PaceGauge";
import VideoGrid from "@/components/VideoGrid";
import LiveCaptions from "@/components/LiveCaptions";
import UserAvatarMenu from "@/components/UserAvatarMenu";
import ScheduleCalendar, { type ScheduleItem } from "@/components/ScheduleCalendar";
import NotificationToast, { useToasts } from "@/components/NotificationToast";
import {
  requestAndSubscribePush,
  getPushStatus,
  showLocalNotification,
} from "@/lib/pushNotifications";
import { API_URL, WS_URL } from "@/lib/config";

// Dynamically loaded components
const Whiteboard = dynamic(() => import("@/components/Whiteboard"), { ssr: false });
const BreakoutRooms = dynamic(() => import("@/components/BreakoutRooms"), { ssr: false });
const FileSharing = dynamic(() => import("@/components/FileSharing"), { ssr: false });
const RaiseHand = dynamic(() => import("@/components/RaiseHand"), { ssr: false });

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
  report_markdown?: string;
}

interface ChatMessage {
  type: string;
  id?: number;
  username?: string;
  raw_username?: string;
  message: string;
  is_doubt?: boolean;
  is_anonymous?: boolean;
  timestamp: string;
  participants?: number;
}

interface QAItem {
  query: string;
  answer: string;
  timestamp: string;
}

interface PollData {
  id: string | number;
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
  doubt_count?: number;
  questions_asked: string[];
  polls_voted: number;
  voted: boolean;
  badge: "Inquisitive" | "Highly Active" | "Engaged Voter" | "Observer" | string;
  is_online?: boolean;
  joined_at?: string;
}

const AVATAR_COLORS = [
  "bg-blue-600", "bg-indigo-600", "bg-violet-600", "bg-emerald-600",
  "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-pink-600",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getBadgeStyle(badge: string) {
  switch (badge) {
    case "Inquisitive":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "Highly Active":
      return "bg-indigo-500/15 text-indigo-300 border-indigo-500/30";
    case "Engaged Voter":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    default:
      return "bg-slate-800 text-slate-400 border-slate-700";
  }
}

export default function TeacherCommandCenter() {
  // Navigation
  const [activeTab, setActiveTab] = useState<
    "Overview" | "Live Class" | "Questions" | "Polls" | "Students" | "Reports" | "Calendar" | "Whiteboard" | "Breakouts" | "Files"
  >("Overview");

  const [roomId, setRoomId] = useState("room1");
  const [roomIdInput, setRoomIdInput] = useState("room1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Telemetry
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [autoPulse, setAutoPulse] = useState(false);
  const [lastAnalyzedCount, setLastAnalyzedCount] = useState(0);

  const [paceTelemetry, setPaceTelemetry] = useState<PaceTelemetry>({
    too_fast: 0,
    good: 1,
    too_slow: 0,
    total_votes: 1,
    too_fast_pct: 0,
    good_pct: 100,
    too_slow_pct: 0,
    dominant_pace: "good",
  });

  // Chat & Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);

  // Copilot & Q&A
  const [askQuery, setAskQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAItem[]>([]);

  // Polls
  const [activePoll, setActivePoll] = useState<PollData | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState([
    "Yes, completely clear",
    "Somewhat confused on the formula",
    "Need a live example",
    "Not at all",
  ]);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [generatingAIPoll, setGeneratingAIPoll] = useState(false);

  // Students & Reports
  const [students, setStudents] = useState<StudentMetric[]>([]);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const { toasts, addToast, removeToast } = useToasts();
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch initial room data
  const fetchRoomData = useCallback(async () => {
    try {
      const [msgsRes, pollRes, paceRes, studsRes] = await Promise.all([
        fetch(`${API_URL}/rooms/${roomId}/messages`),
        fetch(`${API_URL}/rooms/${roomId}/polls/active`),
        fetch(`${API_URL}/rooms/${roomId}/pace`),
        fetch(`${API_URL}/rooms/${roomId}/students`),
      ]);

      if (msgsRes.ok) {
        const m = await msgsRes.json();
        if (m.messages) setMessages(m.messages);
      }
      if (pollRes.ok) {
        const p = await pollRes.json();
        if (p.poll) setActivePoll(p.poll);
      }
      if (paceRes.ok) {
        const pc = await paceRes.json();
        if (pc.dominant_pace) setPaceTelemetry(pc);
      }
      if (studsRes.ok) {
        const s = await studsRes.json();
        if (s.students) setStudents(s.students);
      }
    } catch (err) {
      console.warn("Initial data load error:", err);
    }
  }, [roomId]);

  // WebSocket Connection
  useEffect(() => {
    fetchRoomData();
    const ws = new WebSocket(`${WS_URL}/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      ws.send(JSON.stringify({ type: "join", username: "Instructor" }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "message" || data.type === "chat") {
          setMessages((prev) => [...prev, data]);
          // Refresh students if tab is open
          fetch(`${API_URL}/rooms/${roomId}/students`)
            .then((r) => r.json())
            .then((d) => d.students && setStudents(d.students))
            .catch(() => {});
        } else if (data.type === "pace_telemetry") {
          setPaceTelemetry(data);
        } else if (data.type === "poll_created" || data.type === "poll_update") {
          setActivePoll(data.poll);
        } else if (data.type === "system") {
          if (data.participants !== undefined) setParticipantCount(data.participants);
        }
      } catch (e) {}
    };

    ws.onclose = () => setWsConnected(false);

    return () => {
      ws.close();
    };
  }, [roomId, fetchRoomData]);

  // AI Telemetry Analysis Trigger
  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/analyze`, { method: "POST" });
      const data = await res.json();
      if (data.insights) {
        setInsights(data.insights);
        setLastAnalyzedCount(data.message_count ?? messages.length);
        addToast({
          type: "success",
          title: "AI Pulse Updated",
          body: `Analyzed ${data.message_count ?? messages.length} messages. Sentiment: ${data.insights.sentiment}`,
          duration: 4000,
        });
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message || "Failed running AI Pulse");
    } finally {
      setLoading(false);
    }
  }, [roomId, messages.length, addToast]);

  // Auto-Pulse interval (every 15s)
  useEffect(() => {
    if (!autoPulse) return;
    const timer = setInterval(() => {
      if (messages.length > lastAnalyzedCount) {
        handleAnalyze();
      }
    }, 15000);
    return () => clearInterval(timer);
  }, [autoPulse, messages.length, lastAnalyzedCount, handleAnalyze]);

  // Room Switch
  const handleRoomSwitch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) return;
    const cleanId = roomIdInput.trim().toLowerCase().replace(/\s+/g, "-");
    setRoomId(cleanId);
    setInsights(null);
    setReport(null);
    setActivePoll(null);
  };

  // Send Teacher Message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "message",
        username: "Instructor",
        message: inputMsg.trim(),
      })
    );
    setInputMsg("");
  };

  // 1-Click AI Auto-Poll Generator
  const handleGenerateAIPoll = async () => {
    setGeneratingAIPoll(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/generate-poll`, { method: "POST" });
      const data = await res.json();
      if (data.generated_poll) {
        setPollQuestion(data.generated_poll.question);
        setPollOptions(data.generated_poll.options || []);
        addToast({
          type: "info",
          title: "AI Auto-Poll Ready",
          body: "Generated comprehension check from recent chat. Click 'Broadcast Poll' to launch.",
          duration: 5000,
        });
      }
    } catch (e: any) {
      addToast({
        type: "error",
        title: "Poll Generation Failed",
        body: e.message || "Error reaching Gemini",
        duration: 4000,
      });
    } finally {
      setGeneratingAIPoll(false);
    }
  };

  // Broadcast Custom/AI Poll
  const handleBroadcastPoll = async () => {
    if (!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2) return;
    setCreatingPoll(true);

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: pollQuestion.trim(),
          options: pollOptions.filter((o) => o.trim()),
        }),
      });
      const data = await res.json();
      if (data.poll) {
        setActivePoll(data.poll);
        addToast({
          type: "success",
          title: "Poll Live!",
          body: "Poll pushed to all connected student screens.",
          duration: 4000,
        });
      }
    } catch (e) {
      console.warn("Poll broadcast error:", e);
    } finally {
      setCreatingPoll(false);
    }
  };

  // Ask AI Copilot
  const handleAskCopilot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuery.trim() || asking) return;
    const query = askQuery.trim();
    setAsking(true);
    setAskQuery("");

    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      setQaHistory((prev) => [
        { query, answer: data.answer || "No response received", timestamp: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    } catch (e: any) {
      setQaHistory((prev) => [
        { query, answer: `Error: ${e.message || "Failed to query Copilot"}`, timestamp: new Date().toLocaleTimeString() },
        ...prev,
      ]);
    } finally {
      setAsking(false);
    }
  };

  // Generate End-of-Lecture Executive Report
  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/report`, { method: "POST" });
      const data = await res.json();
      if (data.report) {
        setReport(data.report);
      }
    } catch (e) {
      console.warn("Report generation error:", e);
    } finally {
      setGeneratingReport(false);
    }
  };

  // Download Markdown Report
  const handleDownloadMarkdown = () => {
    if (!report) return;
    const markdownContent =
      report.report_markdown ||
      `# ${report.title}\n\n## Executive Summary\n${report.executive_summary}\n\n## Topics Covered\n${report.topics_covered.join(
        "\n"
      )}\n\n## Comprehension\n${report.comprehension_breakdown}\n`;

    const blob = new Blob([markdownContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ClassPulse_Report_${roomId}_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const unansweredDoubts = messages.filter((m) => m.is_doubt);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-500 selection:text-white">
      <NotificationToast toasts={toasts} onClose={removeToast} />

      {/* Top Cockpit Header */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-start">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                  ClassPulse AI
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Teacher Cockpit
                  </span>
                </h1>
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    ROOM: <span className="font-mono uppercase">{roomId}</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span>{participantCount} Active</span>
                </p>
              </div>
            </div>

            {/* Room Switcher */}
            <form onSubmit={handleRoomSwitch} className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="room1"
                className="w-20 px-2 py-1 text-xs bg-transparent text-slate-200 focus:outline-none font-mono"
              />
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors"
              >
                Go
              </button>
            </form>
          </div>

          {/* Action Bar & Controls */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            {/* Auto-Pulse Toggle */}
            <label className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 cursor-pointer hover:border-slate-700 transition-colors">
              <input
                type="checkbox"
                checked={autoPulse}
                onChange={(e) => setAutoPulse(e.target.checked)}
                className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-0 w-3.5 h-3.5"
              />
              <span>Auto-Pulse (15s)</span>
            </label>

            {/* Manual Pulse Trigger */}
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-all transform active:scale-95 disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>{loading ? "Analyzing..." : "⚡ Run Real-Time AI Pulse"}</span>
            </button>

            {/* Student View Link */}
            <Link
              href={`/room/${roomId}`}
              target="_blank"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1 transition-colors border border-slate-700"
            >
              <span>Student View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>

            <UserAvatarMenu />
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-4">
        <div className="max-w-7xl mx-auto flex items-center gap-1 overflow-x-auto scrollbar-none py-2">
          {[
            { id: "Overview", label: "Overview", icon: LayoutDashboard },
            { id: "Live Class", label: "Live Class", icon: Video },
            { id: "Questions", label: `Questions & Doubts (${unansweredDoubts.length})`, icon: HelpCircle },
            { id: "Polls", label: "Polls", icon: Vote },
            { id: "Students", label: `Students (${students.length})`, icon: Users },
            { id: "Reports", label: "Executive Reports", icon: FileText },
            { id: "Calendar", label: "Schedule", icon: Calendar },
            { id: "Whiteboard", label: "Whiteboard", icon: Activity },
            { id: "Breakouts", label: "Breakouts", icon: Flame },
            { id: "Files", label: "Materials", icon: BookOpen },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all flex-shrink-0 ${
                  isActive
                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tab Content Display */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 flex flex-col gap-6">
        {/* ========================================================================= */}
        {/* TAB 1: OVERVIEW */}
        {/* ========================================================================= */}
        {activeTab === "Overview" && (
          <div className="space-y-6">
            {/* Real-time Pace Gauge Bar */}
            <PaceGauge telemetry={paceTelemetry} interactive={false} />

            {/* AI Insights & Radar Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: Sentiment & Summary */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Class Sentiment</span>
                    <span className="px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
                      {insights?.sentiment || "Neutral"}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 mb-2">Lecture Synthesis</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {insights?.summary ||
                      "Run AI Pulse to analyze live chat conversation, doubts, and comprehension telemetry."}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Tracked messages: {messages.length}</span>
                  <button onClick={handleAnalyze} className="text-blue-400 hover:underline flex items-center gap-1 font-semibold">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
              </div>

              {/* Card 2: Confusion Hotspots & Doubts */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> Friction Radar
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {unansweredDoubts.length} Doubts
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 mb-2">Top Confusion Hotspots</h3>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {insights?.top_concerns && insights.top_concerns.length > 0 ? (
                      insights.top_concerns.map((concern, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{concern}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-400 italic">No significant friction detected.</li>
                    )}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setActiveTab("Questions")}
                    className="w-full text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center justify-between"
                  >
                    <span>View Doubt Resolution Board</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card 3: AI Recommendation & Action Items */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                      <Lightbulb className="w-3.5 h-3.5" /> Instructor Guidance
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                      High Yield
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-100 mb-2">Pedagogical Recommendation</h3>
                  <p className="text-xs text-slate-200 leading-relaxed mb-3">
                    {insights?.recommendation ||
                      "Encourage student questions and launch a quick poll to assess conceptual grasp."}
                  </p>

                  {insights?.action_items && insights.action_items.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-[11px] font-semibold text-slate-400">Quick Actions:</span>
                      <ul className="text-xs text-slate-300 space-y-1">
                        {insights.action_items.slice(0, 2).map((act, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800">
                  <button
                    onClick={() => setActiveTab("Polls")}
                    className="w-full py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 text-xs font-semibold border border-blue-500/30 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Vote className="w-3.5 h-3.5" />
                    <span>Create / Generate Poll</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: LIVE CLASS (SPLIT VIEW) */}
        {/* ========================================================================= */}
        {activeTab === "Live Class" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[600px]">
            {/* Left: WebRTC Video Mesh & Captions */}
            <div className="lg:col-span-8 flex flex-col gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl flex-1 flex flex-col">
                <VideoGrid
                  ws={wsRef.current}
                  username="Instructor"
                  roomId={roomId}
                  isVisible={true}
                />
              </div>

              <LiveCaptions
                roomId={roomId}
                speakerName="Instructor"
                ws={wsRef.current}
                canBroadcast={true}
              />
            </div>

            {/* Right: Synchronized Chat & Doubts Stream */}
            <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col shadow-xl overflow-hidden h-[680px]">
              <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold text-slate-200">Live Chat & Doubts</span>
                </div>
                <span className="text-[11px] font-mono text-slate-400">{messages.length} messages</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs text-center p-4">
                    <MessageSquare className="w-8 h-8 mb-2 text-slate-400" />
                    <span>Chat stream is currently idle.</span>
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl text-xs ${
                        m.is_doubt
                          ? "bg-amber-950/40 border border-amber-500/40 text-amber-200"
                          : m.username === "Instructor"
                          ? "bg-blue-600/20 border border-blue-500/30 text-blue-200"
                          : "bg-slate-950 border border-slate-800 text-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-semibold text-slate-300">
                          {m.is_anonymous ? "Anonymous Student" : m.username}
                        </span>
                        {m.is_doubt && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                            Doubt
                          </span>
                        )}
                        <span className="font-mono">
                          {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <p className="leading-relaxed">{m.message}</p>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type an announcement or answer..."
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                />
                <button
                  type="submit"
                  disabled={!inputMsg.trim()}
                  className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: QUESTIONS & AI COPILOT */}
        {/* ========================================================================= */}
        {activeTab === "Questions" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Unanswered Doubt Board */}
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">Doubt Resolution Board</h3>
                    <p className="text-xs text-slate-400">Questions submitted by students during the session</p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 text-xs font-bold">
                  {unansweredDoubts.length} Active Doubts
                </span>
              </div>

              <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px]">
                {unansweredDoubts.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    <span>No outstanding doubts! Class is fully aligned.</span>
                  </div>
                ) : (
                  unansweredDoubts.map((doubt, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-semibold text-amber-300">
                          {doubt.is_anonymous ? "Anonymous Student" : doubt.username}
                        </span>
                        <span className="font-mono text-[11px]">
                          {doubt.timestamp ? new Date(doubt.timestamp).toLocaleTimeString() : ""}
                        </span>
                      </div>
                      <p className="text-xs text-slate-100 font-medium">{doubt.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* In-Session AI Copilot */}
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-slate-800">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">In-Session Lecture Copilot</h3>
                    <p className="text-xs text-slate-400">Ask natural language questions citing student names and timestamps</p>
                  </div>
                </div>

                <form onSubmit={handleAskCopilot} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    placeholder="e.g. 'Who asked about gradient descent and what was their exact doubt?'"
                    value={askQuery}
                    onChange={(e) => setAskQuery(e.target.value)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!askQuery.trim() || asking}
                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 transition-all flex items-center gap-1.5"
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${asking ? "animate-spin" : ""}`} />
                    <span>{asking ? "Querying..." : "Ask"}</span>
                  </button>
                </form>

                <div className="space-y-3 overflow-y-auto max-h-[380px]">
                  {qaHistory.length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs">
                      <span>Ask the Copilot anything about the ongoing lecture dialogue.</span>
                    </div>
                  ) : (
                    qaHistory.map((item, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                        <div className="text-xs font-semibold text-indigo-300 flex items-center justify-between">
                          <span>Q: {item.query}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{item.timestamp}</span>
                        </div>
                        <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                          {item.answer}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: POLLS */}
        {/* ========================================================================= */}
        {activeTab === "Polls" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Active Poll Live Distribution */}
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Vote className="w-5 h-5" />
                    <h3 className="text-sm font-bold text-slate-100">Live Active Poll</h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                    {activePoll?.total_votes || 0} Votes Submitted
                  </span>
                </div>

                {activePoll ? (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-100">{activePoll.question}</h4>
                    <div className="space-y-2.5">
                      {activePoll.options.map((opt, idx) => {
                        const count = activePoll.votes?.[opt] || 0;
                        const total = activePoll.total_votes || 1;
                        const pct = Math.round((count / total) * 100);

                        return (
                          <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 relative overflow-hidden">
                            <div
                              className="absolute inset-0 bg-blue-600/15 transition-all duration-700 pointer-events-none"
                              style={{ width: `${pct}%` }}
                            />
                            <div className="relative z-10 flex items-center justify-between text-xs">
                              <span className="font-medium text-slate-200">{opt}</span>
                              <span className="font-mono text-slate-400 font-bold">{count} votes ({pct}%)</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    <span>No active poll broadcasted yet. Create one or generate with AI below!</span>
                  </div>
                )}
              </div>
            </div>

            {/* Create / Generate Poll Form */}
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-blue-400">
                  <Plus className="w-5 h-5" />
                  <h3 className="text-sm font-bold text-slate-100">Broadcast New Poll</h3>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAIPoll}
                  disabled={generatingAIPoll}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-indigo-400 ${generatingAIPoll ? "animate-spin" : ""}`} />
                  <span>{generatingAIPoll ? "Synthesizing..." : "⚡ Generate Poll from Recent Discussion"}</span>
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Poll Question</label>
                  <input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="e.g. How confident are you with backpropagation?"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Options</label>
                  <div className="space-y-2">
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-800 text-slate-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => {
                            const copy = [...pollOptions];
                            copy[idx] = e.target.value;
                            setPollOptions(copy);
                          }}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBroadcastPoll}
                  disabled={creatingPoll || !pollQuestion.trim()}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-600/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Vote className="w-4 h-4" />
                  <span>{creatingPoll ? "Broadcasting..." : "Broadcast Poll to Students"}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 5: STUDENTS */}
        {/* ========================================================================= */}
        {activeTab === "Students" && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  Student Participation & Engagement Roster
                </h3>
                <p className="text-xs text-slate-400">Live attendance telemetry, questions, and assigned engagement personas</p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`${API_URL}/rooms/${roomId}/export-attendance`}
                  download
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </a>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-mono border-b border-slate-800">
                  <tr>
                    <th className="p-3">Student</th>
                    <th className="p-3">Persona / Badge</th>
                    <th className="p-3">Messages</th>
                    <th className="p-3">Doubts / Questions</th>
                    <th className="p-3">Poll Status</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {students.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No student telemetry recorded yet.
                      </td>
                    </tr>
                  ) : (
                    students.map((st, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-semibold text-slate-100 flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${getAvatarColor(st.username)} text-white text-[10px] font-bold flex items-center justify-center`}>
                            {st.username.slice(0, 2).toUpperCase()}
                          </div>
                          {st.username}
                        </td>
                        <td className="p-3">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getBadgeStyle(st.badge)}`}>
                            {st.badge}
                          </span>
                        </td>
                        <td className="p-3 font-mono">{st.message_count}</td>
                        <td className="p-3 font-mono">{st.doubt_count || st.questions_asked.length}</td>
                        <td className="p-3 font-mono">
                          {st.voted ? (
                            <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                              <CheckCircle2 className="w-3 h-3" /> Voted
                            </span>
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 6: REPORTS */}
        {/* ========================================================================= */}
        {activeTab === "Reports" && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  Full-Session AI Executive Digest
                </h3>
                <p className="text-xs text-slate-400">End-of-lecture synthesis, comprehension breakdowns, and next lecture roadmap</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleGenerateReport}
                  disabled={generatingReport}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className={`w-3.5 h-3.5 ${generatingReport ? "animate-spin" : ""}`} />
                  <span>{generatingReport ? "Generating Report..." : "Generate AI Digest"}</span>
                </button>

                {report && (
                  <button
                    onClick={handleDownloadMarkdown}
                    className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .MD</span>
                  </button>
                )}

                <a
                  href={`${API_URL}/rooms/${roomId}/export-attendance`}
                  download
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>Export Attendance .CSV</span>
                </a>
              </div>
            </div>

            {generatingReport ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Synthesizing full session transcript and poll metrics...</p>
              </div>
            ) : report ? (
              <div className="space-y-6 text-xs sm:text-sm text-slate-200">
                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-500/30">
                  <h4 className="text-base font-bold text-indigo-300 mb-2">{report.title}</h4>
                  <p className="leading-relaxed text-slate-200">{report.executive_summary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h5 className="font-bold text-slate-100 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-blue-400" /> Topics Covered
                    </h5>
                    <ul className="space-y-1 text-slate-300">
                      {report.topics_covered.map((t, idx) => (
                        <li key={idx} className="flex items-center gap-1.5">
                          <span className="text-blue-400 font-bold">•</span>
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h5 className="font-bold text-slate-100 flex items-center gap-1.5">
                      <BarChart3 className="w-4 h-4 text-emerald-400" /> Comprehension Breakdown
                    </h5>
                    <p className="text-slate-300 leading-relaxed">{report.comprehension_breakdown}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h5 className="font-bold text-slate-100 flex items-center gap-1.5">
                      <HelpCircle className="w-4 h-4 text-amber-400" /> Unresolved Doubts
                    </h5>
                    <ul className="space-y-1 text-slate-300">
                      {report.unresolved_questions.length > 0 ? (
                        report.unresolved_questions.map((q, idx) => (
                          <li key={idx} className="flex items-center gap-1.5">
                            <span className="text-amber-400 font-bold">•</span>
                            <span>{q}</span>
                          </li>
                        ))
                      ) : (
                        <li className="text-slate-400 italic">All questions were answered!</li>
                      )}
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                    <h5 className="font-bold text-slate-100 flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4 text-indigo-400" /> Recommended Next Lecture Plan
                    </h5>
                    <ol className="space-y-1 text-slate-300 list-decimal list-inside">
                      {report.recommended_next_lecture_plan.map((p, idx) => (
                        <li key={idx}>{p}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-400 text-xs">
                <span>Click "Generate AI Digest" to synthesize the entire lecture into an executive summary report.</span>
              </div>
            )}
          </div>
        )}

        {/* Other Management Tools */}
        {activeTab === "Calendar" && <ScheduleCalendar defaultRoomId={roomId} role="teacher" createdBy="Instructor" />}
        {activeTab === "Whiteboard" && <Whiteboard ws={wsRef.current} roomId={roomId} username="Instructor" isHost={true} />}
        {activeTab === "Breakouts" && (
          <BreakoutRooms
            ws={wsRef.current}
            roomId={roomId}
            username="Instructor"
            isHost={true}
            allParticipants={students.map((s) => s.username)}
          />
        )}
        {activeTab === "Files" && <FileSharing roomId={roomId} isHost={true} ws={wsRef.current} />}
      </main>
    </div>
  );
}