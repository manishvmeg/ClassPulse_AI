"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import UserAvatarMenu from "@/components/UserAvatarMenu";
import ScheduleCalendar, { type ScheduleItem } from "@/components/ScheduleCalendar";

import NotificationToast, { useToasts } from "@/components/NotificationToast";
import {
  requestAndSubscribePush,
  getPushStatus,
  showLocalNotification,
} from "@/lib/pushNotifications";

// Dynamically load client-only interactive components
const LiveKitVideoRoom = dynamic(
  () => import("@/components/LiveKitVideoRoom"),
  { ssr: false, loading: () => (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Loading video engine...</p>
      </div>
    </div>
  )}
);

const Whiteboard = dynamic(() => import("@/components/Whiteboard"), { ssr: false });
const BreakoutRooms = dynamic(() => import("@/components/BreakoutRooms"), { ssr: false });
const FileSharing = dynamic(() => import("@/components/FileSharing"), { ssr: false });
const RaiseHand = dynamic(() => import("@/components/RaiseHand"), { ssr: false });

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
const WS_URL  = process.env.NEXT_PUBLIC_WS_URL  ?? "ws://127.0.0.1:8000";


// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-600","bg-indigo-600","bg-violet-600","bg-emerald-600",
  "bg-amber-600","bg-rose-600","bg-cyan-600","bg-pink-600",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");
}

function sentimentConfig(sentiment: string) {
  const map: Record<string, { emoji: string; className: string }> = {
    Confused:   { emoji: "😕", className: "badge-amber" },
    Neutral:    { emoji: "😐", className: "badge-slate" },
    Positive:   { emoji: "😊", className: "badge-emerald" },
    Frustrated: { emoji: "😤", className: "badge-rose" },
    Engaged:    { emoji: "🔥", className: "badge-indigo" },
  };
  return map[sentiment] ?? { emoji: "🤔", className: "badge-slate" };
}

// ──────────────────────────────────────────────────────────────────────────────
// Nav Items with inline SVG icons
// ──────────────────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    label: "Overview",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    label: "Live Class",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    label: "Questions",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    label: "Polls",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    label: "Students",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    label: "Reports",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    label: "Calendar",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    label: "Whiteboard",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  {
    label: "Breakouts",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    label: "Files",
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
    ),
  },
];



// ──────────────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────────────

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");
  const [loading, setLoading] = useState(false);
  const [roomId, setRoomId] = useState("room1");
  const [roomIdInput, setRoomIdInput] = useState("room1");
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [autoPulse, setAutoPulse] = useState(false);
  const [lastAnalyzedCount, setLastAnalyzedCount] = useState(0);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputUser, setInputUser] = useState("Arun");
  const [inputMsg, setInputMsg] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [askQuery, setAskQuery] = useState("");
  const [asking, setAsking] = useState(false);
  const [qaHistory, setQaHistory] = useState<QAItem[]>([]);

  const [activePoll, setActivePoll] = useState<PollData | null>(null);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["Yes, completely", "Somewhat confused", "Not at all"]);
  const [creatingPoll, setCreatingPoll] = useState(false);

  const [report, setReport] = useState<SessionReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  const [students, setStudents] = useState<StudentMetric[]>([]);

  // Video grid visibility toggle
  const [showVideo, setShowVideo] = useState(false);

  // Push notification state
  const [pushStatus, setPushStatus] = useState<"granted" | "denied" | "default" | "unsupported">("default");
  const [subscribingPush, setSubscribingPush] = useState(false);

  // Toast notifications
  const { toasts, addToast, removeToast } = useToasts();

  // Upcoming schedule count (for badge)
  const [upcomingScheduleCount, setUpcomingScheduleCount] = useState(0);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check push permission on mount
  useEffect(() => {
    getPushStatus().then(setPushStatus);
  }, []);

  // Fetch upcoming schedule count on mount
  useEffect(() => {
    fetch(`${API_URL}/schedules?upcoming_only=true`)
      .then((r) => r.json())
      .then((d) => setUpcomingScheduleCount(d.schedules?.length ?? 0))
      .catch(() => {});
  }, []);


  // ── AI Analysis ─────────────────────────────────────────────────────────
  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `${API_URL}/rooms/${roomId}/analyze`;
      const qp = new URLSearchParams();
      if (startTime) qp.append("start_time", startTime);
      if (endTime) qp.append("end_time", endTime);
      if (qp.toString()) url += `?${qp.toString()}`;

      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (data.insights) {
        setInsights(data.insights);
        setLastAnalyzedCount(data.message_count ?? 0);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to backend");
    } finally {
      setLoading(false);
    }
  }, [roomId, startTime, endTime]);

  // ── Fetch active poll ────────────────────────────────────────────────────
  const fetchActivePoll = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/polls/active`);
      const data = await res.json();
      if (data.poll) setActivePoll(data.poll);
    } catch {
      /* silent */
    }
  }, [roomId]);

  // ── Fetch student analytics ──────────────────────────────────────────────
  const fetchStudents = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/students`);
      const data = await res.json();
      if (data.students) setStudents(data.students);
    } catch {
      /* silent */
    }
  }, [roomId]);

  useEffect(() => {
    if (activeTab === "Students") fetchStudents();
  }, [activeTab, fetchStudents]);

  // ── WebSocket connection ─────────────────────────────────────────────────
  useEffect(() => {
    fetchActivePoll();
    setMessages([]);

    const ws = new WebSocket(`${WS_URL}/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "poll_created" || data.type === "poll_update") {
          setActivePoll(data.poll);
        } else if (data.type === "class_scheduled") {
          const s = data.schedule as ScheduleItem;
          setUpcomingScheduleCount((c) => c + 1);
          addToast({
            type: "success",
            title: "New Class Scheduled",
            body: `"${s.title}" on ${new Date(s.scheduled_at).toLocaleString()} · Room ${s.room_id.toUpperCase()}`,
            action: { label: "View Calendar", href: "#" },
            duration: 8000,
          });
          showLocalNotification(
            "ClassPulse AI — Class Scheduled",
            `"${s.title}" starts ${new Date(s.scheduled_at).toLocaleString()}`,
            `/room/${s.room_id}`
          );
        } else if (data.type === "class_reminder") {
          const s = data.schedule as ScheduleItem;
          addToast({
            type: "reminder",
            title: "🔔 Class Starting in 5 Minutes!",
            body: `"${s.title}" — Room ${s.room_id.toUpperCase()}`,
            action: { label: "Join Room", href: `/room/${s.room_id}` },
            duration: 12000,
          });
          showLocalNotification(
            "ClassPulse AI — Class Starting Soon!",
            `"${s.title}" starts in ~5 minutes. Room: ${s.room_id.toUpperCase()}`,
            `/room/${s.room_id}`
          );
        } else if (data.type === "schedule_deleted") {
          setUpcomingScheduleCount((c) => Math.max(0, c - 1));
        } else if (data.type !== "video-offer" && data.type !== "video-answer" &&
                   data.type !== "video-ice-candidate" && data.type !== "video-join" &&
                   data.type !== "video-leave") {
          setMessages((prev) => [...prev, data]);
          if (data.participants !== undefined) setParticipantCount(data.participants);
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => setWsConnected(false);

    return () => ws.close();
  }, [roomId, fetchActivePoll, addToast]);


  // ── Auto-Pulse ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPulse) return;
    const interval = setInterval(() => {
      const count = messages.filter((m) => m.type === "message").length;
      if (count > lastAnalyzedCount) handleAnalyze();
    }, 15000);
    return () => clearInterval(interval);
  }, [autoPulse, messages, lastAnalyzedCount, handleAnalyze]);

  // ── Switch room ──────────────────────────────────────────────────────────
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomIdInput.trim()) {
      setRoomId(roomIdInput.trim().toLowerCase().replace(/\s+/g, "-"));
      setInsights(null);
      setReport(null);
      setActivePoll(null);
    }
  };

  // ── Send message ─────────────────────────────────────────────────────────
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "message",
      username: inputUser.trim() || "Anonymous",
      message: inputMsg.trim(),
    }));
    setInputMsg("");
  };

  // ── Vote ──────────────────────────────────────────────────────────────────
  const handleVote = (option: string) => {
    if (!activePoll || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({
      type: "poll_vote",
      poll_id: activePoll.id,
      username: inputUser.trim() || "Anonymous",
      selected_option: option,
    }));
  };

  // ── Create poll ───────────────────────────────────────────────────────────
  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pollQuestion.trim()) return;
    const filtered = pollOptions.filter((o) => o.trim().length > 0);
    if (filtered.length < 2) { setError("Please provide at least 2 options."); return; }

    setCreatingPoll(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/polls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: pollQuestion.trim(), options: filtered }),
      });
      const data = await res.json();
      if (data.poll) { setActivePoll(data.poll); setPollQuestion(""); }
      else if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create poll");
    } finally {
      setCreatingPoll(false);
    }
  };

  // ── Generate report ───────────────────────────────────────────────────────
  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/report`, { method: "POST" });
      const data = await res.json();
      if (data.report) setReport(data.report);
      else if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report");
    } finally {
      setGeneratingReport(false);
    }
  };

  // ── Export markdown ───────────────────────────────────────────────────────
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
${report.recommended_next_lecture_plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}
`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ClassPulse_Report_${roomId}_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Ask AI ────────────────────────────────────────────────────────────────
  const handleAskAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuery.trim()) return;
    setAsking(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: askQuery.trim(), start_time: startTime || null, end_time: endTime || null }),
      });
      const data = await res.json();
      if (data.answer) {
        setQaHistory((prev) => [...prev, { query: askQuery.trim(), answer: data.answer, timestamp: new Date().toLocaleTimeString() }]);
        setAskQuery("");
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to query AI");
    } finally {
      setAsking(false);
    }
  };

  const userMessages = messages.filter((m) => m.type === "message");

  // ── Subscribe to push notifications ──────────────────────────────────────
  const handleSubscribePush = async () => {
    setSubscribingPush(true);
    const result = await requestAndSubscribePush("Teacher", "teacher", roomId);
    setPushStatus(result.subscribed ? "granted" : (result.reason?.includes("blocked") ? "denied" : "default"));
    if (result.subscribed) {
      addToast({ type: "success", title: "Notifications Enabled", body: "You'll receive alerts when classes are scheduled.", duration: 4000 });
    } else {
      addToast({ type: "warning", title: "Notifications Unavailable", body: result.reason ?? "Unknown error", duration: 6000 });
    }
    setSubscribingPush(false);
  };


  // ──────────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-950 text-white flex">

      {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold gradient-text">ClassPulse AI</h1>
              <p className="text-[10px] text-slate-500 mt-0.5">Teacher Command Center</p>
            </div>
          </div>
        </div>

        {/* Room switcher */}
        <div className="px-4 py-4 border-b border-slate-800">
          <p className="text-[10px] font-semibold uppercase text-slate-500 mb-2 tracking-wider">Active Room</p>
          <form onSubmit={handleJoinRoom} className="flex gap-2">
            <input
              type="text"
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              placeholder="room1"
              className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
            />
            <button
              type="submit"
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-semibold transition"
            >
              Go
            </button>
          </form>
          <div className="mt-2 flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse-dot" : "bg-rose-400"}`} />
            <span className="text-[11px] text-slate-400">
              {wsConnected ? `${roomId.toUpperCase()} · ${participantCount} online` : "Disconnected"}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveTab(item.label)}
              className={`nav-item ${activeTab === item.label ? "active" : ""}`}
            >
              {item.icon}
              {item.label}
              {item.label === "Live Class" && userMessages.length > 0 && (
                <span className="ml-auto badge badge-blue text-[10px] py-0 px-1.5">{userMessages.length}</span>
              )}
              {item.label === "Polls" && activePoll && (
                <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse-dot" />
              )}
              {item.label === "Calendar" && upcomingScheduleCount > 0 && (
                <span className="ml-auto badge badge-indigo text-[10px] py-0 px-1.5">{upcomingScheduleCount}</span>
              )}
            </button>
          ))}
        </nav>


        {/* SaaS Quick Links */}
        <div className="px-3 py-3 border-t border-slate-800 space-y-1">
          <Link
            href="/pricing"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-600/20 to-indigo-600/20 border border-blue-500/30 text-blue-300 hover:from-blue-600/30 hover:to-indigo-600/30 transition"
          >
            <span>⭐</span>
            <span>Upgrade to Pro</span>
            <span className="ml-auto text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded font-bold">14d Free</span>
          </Link>
          <Link
            href="/billing"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          >
            <span>💳</span>
            <span>Billing & Invoices</span>
          </Link>
          <Link
            href="/admin"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
          >
            <span>🛠️</span>
            <span>Admin Console</span>
          </Link>
        </div>

        {/* Auto-pulse toggle */}
        <div className="px-4 py-3 border-t border-slate-800 space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setAutoPulse((v) => !v)}
              className={`relative w-9 h-5 rounded-full transition-colors ${autoPulse ? "bg-blue-600" : "bg-slate-700"}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${autoPulse ? "translate-x-4" : ""}`} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-300">Auto AI Pulse</p>
              <p className="text-[10px] text-slate-500">Every 15s</p>
            </div>
          </label>

          {/* Push Notifications toggle */}
          {pushStatus !== "unsupported" && (
            <button
              onClick={handleSubscribePush}
              disabled={subscribingPush || pushStatus === "granted"}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                pushStatus === "granted"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 cursor-default"
                  : pushStatus === "denied"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400 cursor-not-allowed opacity-60"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {subscribingPush
                ? "Enabling..."
                : pushStatus === "granted"
                ? "Push Enabled ✓"
                : pushStatus === "denied"
                ? "Push Blocked"
                : "Enable Push Alerts"}
            </button>
          )}
        </div>
      </aside>



      {/* ── MAIN CONTENT ──────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col min-w-0">

        {/* Top Bar */}
        <header className="flex items-center justify-between px-8 py-4 border-b border-slate-800 bg-slate-900/60 backdrop-blur-sm sticky top-0 z-10">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wider">Teacher Dashboard</p>
            <h2 className="text-2xl font-bold mt-0.5">{activeTab}</h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Time window filter */}
            <div className="hidden lg:flex items-center gap-2 border border-slate-800 bg-slate-950 rounded-lg px-3 py-1.5 text-xs">
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <input type="text" placeholder="Start ISO" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                className="w-40 bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none" />
              <span className="text-slate-600">→</span>
              <input type="text" placeholder="End ISO" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                className="w-40 bg-transparent text-slate-300 placeholder-slate-600 focus:outline-none" />
              {(startTime || endTime) && (
                <button onClick={() => { setStartTime(""); setEndTime(""); }} className="text-rose-400 hover:text-rose-300 ml-1">✕</button>
              )}
            </div>

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Analyzing...
                </>
              ) : (
                <>⚡ Run AI Pulse</>
              )}
            </button>

            <UserAvatarMenu />
          </div>
        </header>




        {/* Page body */}
        <div className="flex-1 overflow-y-auto p-8">

          {error && (
            <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-400 flex items-start gap-3 animate-fade-in">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-medium">Error</p>
                <p className="text-xs text-rose-400/80 mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="ml-auto text-rose-400/60 hover:text-rose-400">✕</button>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: OVERVIEW
          ════════════════════════════════════════ */}
          {activeTab === "Overview" && (
            <div className="animate-fade-in space-y-6">
              {/* Stat cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    label: "Active Room", value: roomId.toUpperCase(), sub: "Live monitoring",
                    icon: "🟢", accent: "--blue-500", borderColor: "border-blue-500/20",
                    style: { "--card-accent": "linear-gradient(90deg,#2563eb,#6366f1)" } as React.CSSProperties,
                  },
                  {
                    label: "Live Messages", value: userMessages.length, sub: "In this session",
                    icon: "💬", accent: "--indigo-500", borderColor: "border-indigo-500/20",
                    style: { "--card-accent": "linear-gradient(90deg,#6366f1,#8b5cf6)" } as React.CSSProperties,
                  },
                  {
                    label: "Questions Flagged", value: insights?.important_questions.length ?? 0, sub: "By Gemini AI",
                    icon: "❓", accent: "--amber-500", borderColor: "border-amber-500/20",
                    style: { "--card-accent": "linear-gradient(90deg,#d97706,#f59e0b)" } as React.CSSProperties,
                  },
                  {
                    label: "Poll Votes", value: activePoll ? `${activePoll.total_votes}` : "—", sub: activePoll ? "Live polling" : "No active poll",
                    icon: "📊", accent: "--emerald-500", borderColor: "border-emerald-500/20",
                    style: { "--card-accent": "linear-gradient(90deg,#059669,#34d399)" } as React.CSSProperties,
                  },
                ].map((card, i) => (
                  <div key={i} className={`stat-card ${card.borderColor}`} style={card.style}>
                    <div className="flex items-start justify-between">
                      <p className="text-xs text-slate-400 font-medium">{card.label}</p>
                      <span className="text-lg">{card.icon}</span>
                    </div>
                    <p className="mt-3 text-3xl font-bold tracking-tight">{card.value}</p>
                    <p className="mt-1 text-xs text-slate-500">{card.sub}</p>
                  </div>
                ))}
              </div>

              {/* Sentiment + Recommendation */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Sentiment & Summary */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold">Classroom Sentiment</h3>
                    {insights && (
                      <span className={`badge ${sentimentConfig(insights.sentiment).className}`}>
                        {sentimentConfig(insights.sentiment).emoji} {insights.sentiment}
                      </span>
                    )}
                  </div>

                  {insights ? (
                    <>
                      <p className="text-sm text-slate-300 leading-relaxed">{insights.summary}</p>
                      <div className="mt-4 space-y-2">
                        {insights.main_topics.map((t, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                            <span className="text-slate-300">{t}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 italic">Run ⚡ AI Pulse after students send messages to see live sentiment.</p>
                  )}
                </div>

                {/* AI Recommendation */}
                <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/30 to-indigo-950/20 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="text-base font-semibold text-blue-300">AI Teaching Recommendation</h3>
                  </div>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {insights?.recommendation ?? "Live recommendations will appear here once students are active and AI analysis runs."}
                  </p>
                  {insights && (
                    <div className="mt-4 space-y-1.5">
                      {insights.action_items.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
                          <span className="text-blue-500 mt-0.5 flex-shrink-0">→</span>
                          {a}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Top concerns */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <h3 className="text-base font-semibold">Top Student Concerns</h3>
                  {insights?.top_concerns.length ? (
                    <span className="badge badge-rose ml-auto">{insights.top_concerns.length} flagged</span>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {insights && insights.top_concerns.length > 0 ? (
                    insights.top_concerns.map((c, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 animate-fade-in" style={{ animationDelay: `${i * 75}ms` }}>
                        <span className="text-sm text-slate-200">{c}</span>
                        <span className="badge badge-rose">High Friction</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 italic">No concerns detected yet. Run AI Pulse after students send messages.</p>
                  )}
                </div>
              </div>

              {/* Important questions */}
              {insights && insights.important_questions.length > 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 animate-fade-in">
                  <h3 className="text-base font-semibold mb-4">Important Unanswered Questions</h3>
                  <div className="space-y-2">
                    {insights.important_questions.map((q, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                        <span className="text-amber-400 font-bold text-sm flex-shrink-0">Q{i + 1}</span>
                        <p className="text-sm text-slate-200">{q}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: LIVE CLASS
          ════════════════════════════════════════ */}
          {activeTab === "Live Class" && (
            <div className="animate-fade-in space-y-5">
              {/* Room header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-300">
                    Room: <span className="text-white">{roomId.toUpperCase()}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Share <code className="text-blue-400">/room/{roomId}</code> with students · SFU video — scales to 500+ participants
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                  <span className="text-xs text-emerald-400 font-medium">LiveKit Cloud · 0 lag</span>
                </div>
              </div>

              {/* LiveKit SFU Video Room (teacher = host) */}
              <LiveKitVideoRoom
                roomId={roomId}
                username={inputUser || "Teacher"}
                isHost={true}
                onDisconnect={() => setShowVideo(false)}
              />

              <div className="grid gap-5 lg:grid-cols-3">
                {/* Chat panel */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 flex flex-col" style={{ height: "560px" }}>
                  <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2 flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${wsConnected ? "bg-emerald-400 animate-pulse-dot" : "bg-rose-400"}`} />
                    <span className="text-sm font-medium">Live Room Stream</span>
                    <span className="ml-auto text-xs text-slate-500">{userMessages.length} messages</span>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                          <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </div>
                        <p className="text-sm text-slate-500">No messages yet — students can join via <code className="text-blue-400 text-xs">/room/{roomId}</code></p>
                      </div>
                    ) : (
                      messages.map((m, i) => (
                        <div key={i} className="text-sm animate-fade-in">
                          {m.type === "system" ? (
                            <div className="chat-bubble-system py-1 mx-auto w-fit px-4 text-xs">
                              ⚙️ {m.message}
                              <span className="text-slate-600 ml-2">{new Date(m.timestamp).toLocaleTimeString()}</span>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2.5">
                              <div className={`avatar avatar-sm ${getAvatarColor(m.username ?? "?")} flex-shrink-0 mt-0.5`}>
                                {getInitials(m.username ?? "?")}
                              </div>
                              <div className="chat-bubble-other px-3.5 py-2.5 max-w-lg">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-semibold text-blue-400">{m.username}</span>
                                  <span className="text-[10px] text-slate-600">{new Date(m.timestamp).toLocaleTimeString()}</span>
                                  {m.message.includes("?") && (
                                    <span className="badge badge-amber text-[9px] py-0 px-1">Question</span>
                                  )}
                                </div>
                                <p className="text-slate-200 text-sm leading-relaxed">{m.message}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Send form */}
                  <form onSubmit={handleSendMessage} className="flex gap-2 p-4 border-t border-slate-800 flex-shrink-0">
                    <select
                      value={inputUser}
                      onChange={(e) => setInputUser(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                    >
                      {["Arun", "Priya", "Rahul", "Sneha", "Kiran"].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={inputMsg}
                      onChange={(e) => setInputMsg(e.target.value)}
                      placeholder="Simulate a student message..."
                      className="input-field flex-1"
                    />
                    <button type="submit" className="btn-primary py-2 px-4 text-sm">Send</button>
                  </form>
                </div>

                {/* Sidebar info */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-5">
                  <div>
                    <h3 className="text-sm font-semibold mb-3">Quick Guide</h3>
                    <ol className="space-y-2.5 text-xs text-slate-400 leading-relaxed">
                      <li className="flex gap-2"><span className="text-blue-400 font-bold">1.</span>Enable <strong className="text-slate-300">Auto AI Pulse</strong> in the sidebar for continuous intelligence.</li>
                      <li className="flex gap-2"><span className="text-blue-400 font-bold">2.</span>Students join at <code className="text-blue-400">/room/{roomId}</code> and chat in real-time.</li>
                      <li className="flex gap-2"><span className="text-blue-400 font-bold">3.</span>Launch comprehension polls via the <strong className="text-slate-300">Polls</strong> tab.</li>
                      <li className="flex gap-2"><span className="text-blue-400 font-bold">4.</span>Check individual metrics in the <strong className="text-slate-300">Students</strong> tab.</li>
                    </ol>
                  </div>

                  <div className="section-divider" />

                  {/* Live audience doubts & raised hands queue */}
                  <RaiseHand
                    isHost={true}
                    username={inputUser || "Teacher"}
                    roomId={roomId}
                    ws={wsRef.current}
                  />

                  <button onClick={handleAnalyze} disabled={loading} className="btn-primary w-full justify-center mt-auto">
                    {loading ? "Analyzing..." : "⚡ Analyze Room Now"}
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* ════════════════════════════════════════
              TAB: QUESTIONS (Ask AI Copilot)
          ════════════════════════════════════════ */}
          {activeTab === "Questions" && (
            <div className="animate-fade-in rounded-2xl border border-slate-800 bg-slate-900 flex flex-col" style={{ height: "660px" }}>
              <div className="px-6 py-5 border-b border-slate-800 flex-shrink-0">
                <h3 className="text-base font-semibold">Ask ClassPulse AI Copilot</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Query anything about your class — students, topics, confusion points, timestamps.
                </p>
                {/* Suggested prompts */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {[
                    "Who had doubts about Dijkstra's algorithm?",
                    "What topics confused students most?",
                    "Summarize all questions asked after 3PM",
                  ].map((p) => (
                    <button key={p} onClick={() => setAskQuery(p)}
                      className="text-[11px] rounded-full border border-slate-700 bg-slate-800 hover:bg-slate-700 px-3 py-1 text-slate-300 transition">
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {qaHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600/20 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center">
                      <svg className="w-7 h-7 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-300">No queries yet</p>
                      <p className="text-xs text-slate-500 mt-1">Try one of the suggested prompts above</p>
                    </div>
                  </div>
                ) : (
                  qaHistory.map((item, i) => (
                    <div key={i} className="space-y-2 animate-fade-in">
                      <div className="flex justify-end">
                        <div className="chat-bubble-self px-4 py-3 max-w-xl">
                          <p className="text-[10px] font-semibold text-blue-300 mb-0.5">Your Query</p>
                          <p className="text-sm text-white">{item.query}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                          </svg>
                        </div>
                        <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 max-w-2xl">
                          <p className="text-[10px] font-semibold text-emerald-400 mb-1">ClassPulse Copilot · {item.timestamp}</p>
                          <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{item.answer}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAskAI} className="flex gap-3 p-5 border-t border-slate-800 flex-shrink-0">
                <input
                  type="text"
                  value={askQuery}
                  onChange={(e) => setAskQuery(e.target.value)}
                  placeholder="Ask anything about the class discussion..."
                  className="input-field flex-1"
                />
                <button type="submit" disabled={asking || !askQuery.trim()} className="btn-primary px-6">
                  {asking ? (
                    <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : "Ask AI"}
                </button>
              </form>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: POLLS
          ════════════════════════════════════════ */}
          {activeTab === "Polls" && (
            <div className="animate-fade-in grid gap-6 lg:grid-cols-2">
              {/* Active Poll Display */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-base font-semibold">Active Classroom Poll</h3>
                  {activePoll && (
                    <span className="badge badge-emerald">
                      <span className="animate-pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      Live · {activePoll.total_votes} votes
                    </span>
                  )}
                </div>

                {activePoll ? (
                  <div>
                    <p className="text-base font-medium text-slate-100 mb-5">{activePoll.question}</p>
                    <div className="space-y-4">
                      {activePoll.options.map((opt, i) => {
                        const count = activePoll.votes[opt] ?? 0;
                        const pct = activePoll.total_votes > 0
                          ? Math.round((count / activePoll.total_votes) * 100)
                          : 0;
                        return (
                          <div key={i} className="space-y-1.5">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-200">{opt}</span>
                              <span className="font-semibold text-slate-400">{count} ({pct}%)</span>
                            </div>
                            <div className="poll-bar">
                              <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Vote simulator */}
                    <div className="mt-6 pt-5 border-t border-slate-800">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-slate-400">Simulate vote as:</p>
                        <select value={inputUser} onChange={(e) => setInputUser(e.target.value)}
                          className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none">
                          {["Arun", "Priya", "Rahul", "Sneha", "Kiran"].map((n) => <option key={n}>{n}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {activePoll.options.map((opt, i) => (
                          <button key={i} onClick={() => handleVote(opt)}
                            className="btn-secondary text-xs py-1.5 px-3 flex-1">
                            Vote &ldquo;{opt}&rdquo;
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                      <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-slate-500">No active poll. Launch one using the form →</p>
                  </div>
                )}
              </div>

              {/* Create Poll Form */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="text-base font-semibold mb-1">Launch New Poll</h3>
                <p className="text-xs text-slate-500 mb-5">
                  Broadcast an instant comprehension check to all participants in {roomId.toUpperCase()}.
                </p>

                <form onSubmit={handleCreatePoll} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5 tracking-wider">Question Prompt</label>
                    <input type="text" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="e.g. Can Dijkstra's algorithm work with negative edge weights?"
                      className="input-field" />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5 tracking-wider">Answer Choices</label>
                    <div className="space-y-2">
                      {pollOptions.map((opt, i) => (
                        <div key={i} className="flex gap-2">
                          <input type="text" value={opt}
                            onChange={(e) => {
                              const n = [...pollOptions];
                              n[i] = e.target.value;
                              setPollOptions(n);
                            }}
                            placeholder={`Option ${i + 1}`}
                            className="input-field flex-1 py-2" />
                          {pollOptions.length > 2 && (
                            <button type="button" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                              className="border border-slate-800 rounded-lg px-3 text-rose-400 hover:bg-rose-500/10 transition text-sm">✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                    {pollOptions.length < 6 && (
                      <button type="button" onClick={() => setPollOptions([...pollOptions, ""])}
                        className="mt-2 text-xs text-blue-400 hover:text-blue-300 transition">
                        + Add option
                      </button>
                    )}
                  </div>

                  <button type="submit" disabled={creatingPoll || !pollQuestion.trim()} className="btn-primary w-full justify-center">
                    {creatingPoll ? "Broadcasting..." : "🚀 Broadcast Poll to Class"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: STUDENTS
          ════════════════════════════════════════ */}
          {activeTab === "Students" && (
            <div className="animate-fade-in space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold">Student Participation & Activity</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Live engagement tracking for room {roomId.toUpperCase()}</p>
                </div>
                <button onClick={fetchStudents} className="btn-secondary text-xs py-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>

              {students.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 py-16 text-center">
                  <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-400">No student interactions recorded yet</p>
                  <p className="text-xs text-slate-600 mt-1">Messages sent via the student portal will appear here</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="border-b border-slate-800 bg-slate-950/50">
                      <tr>
                        {["Student", "Badge", "Messages", "Questions", "Poll Vote", "Last Active"].map((h) => (
                          <th key={h} className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {students.map((s, i) => {
                        const badgeClass = {
                          Inquisitive: "badge-amber",
                          "Highly Active": "badge-blue",
                          "Engaged Voter": "badge-emerald",
                          Observer: "badge-slate",
                        }[s.badge] ?? "badge-slate";

                        return (
                          <tr key={i} className="hover:bg-slate-800/30 transition-colors animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2.5">
                                <div className={`avatar ${getAvatarColor(s.username)}`}>{getInitials(s.username)}</div>
                                <span className="font-medium text-white">{s.username}</span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`badge ${badgeClass}`}>{s.badge}</span>
                            </td>
                            <td className="px-5 py-4 font-semibold text-slate-200">{s.message_count}</td>
                            <td className="px-5 py-4">
                              {s.questions_asked.length > 0 ? (
                                <span className="text-amber-400 font-medium">{s.questions_asked.length} question(s)</span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              {s.voted ? (
                                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                  Voted
                                </span>
                              ) : (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-5 py-4 text-xs text-slate-500">{new Date(s.last_active).toLocaleTimeString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: REPORTS
          ════════════════════════════════════════ */}
          {activeTab === "Reports" && (
            <div className="animate-fade-in space-y-6">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">End-of-Lecture Executive Report</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Synthesize chat, student questions, and poll metrics into an exportable digest.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={handleGenerateReport} disabled={generatingReport} className="btn-primary">
                    {generatingReport ? (
                      <>
                        <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Generating...
                      </>
                    ) : "⚡ Generate Session Report"}
                  </button>
                  {report && (
                    <button onClick={handleExportMarkdown} className="btn-secondary">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download .MD
                    </button>
                  )}
                </div>
              </div>

              {report ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 space-y-6 animate-slide-up">
                  <div className="border-b border-slate-800 pb-5">
                    <span className="text-xs font-bold uppercase tracking-widest text-blue-400">ClassPulse Lecture Digest</span>
                    <h2 className="mt-2 text-2xl font-bold text-white">{report.title}</h2>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Executive Summary</p>
                    <p className="text-sm leading-relaxed text-slate-200">{report.executive_summary}</p>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Topics Covered</p>
                      <ul className="space-y-1.5">
                        {report.topics_covered.map((t, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                            <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                            {t}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Comprehension & Poll Breakdown</p>
                      <p className="text-sm leading-relaxed text-slate-300">{report.comprehension_breakdown}</p>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-3">Unresolved Questions</p>
                      {report.unresolved_questions.length > 0 ? (
                        <ul className="space-y-2">
                          {report.unresolved_questions.map((q, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
                              <span className="text-amber-400 font-bold flex-shrink-0">•</span>
                              {q}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No unresolved questions flagged.</p>
                      )}
                    </div>
                    <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-3">Recommended Next Lecture Plan</p>
                      <ol className="space-y-2">
                        {report.recommended_next_lecture_plan.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-slate-200">
                            <span className="text-blue-400 font-bold flex-shrink-0">{i + 1}.</span>
                            {s}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-400">No report generated yet</p>
                  <p className="text-xs text-slate-600 mt-1">Click &ldquo;⚡ Generate Session Report&rdquo; above to create a structured post-lecture summary.</p>
                </div>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: CALENDAR
          ════════════════════════════════════════ */}
          {activeTab === "Calendar" && (
            <div className="animate-fade-in">
              <ScheduleCalendar
                createdBy={inputUser || "Teacher"}
                role="teacher"
                defaultRoomId={roomId}
                onScheduleCreated={(s) => {
                  setUpcomingScheduleCount((c) => c + 1);
                  addToast({
                    type: "success",
                    title: "Class Scheduled!",
                    body: `"${s.title}" on ${new Date(s.scheduled_at).toLocaleString()} · Room ${s.room_id.toUpperCase()}`,
                    duration: 7000,
                  });
                }}
              />
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: WHITEBOARD
          ════════════════════════════════════════ */}
          {activeTab === "Whiteboard" && (
            <div className="animate-fade-in space-y-4">
              <Whiteboard
                roomId={roomId}
                username={inputUser || "Teacher"}
                isHost={true}
                ws={wsRef.current}
              />
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: BREAKOUTS
          ════════════════════════════════════════ */}
          {activeTab === "Breakouts" && (
            <div className="animate-fade-in space-y-4">
              <BreakoutRooms
                roomId={roomId}
                username={inputUser || "Teacher"}
                isHost={true}
                ws={wsRef.current}
                allParticipants={students.map((s) => s.username)}
              />
            </div>
          )}

          {/* ════════════════════════════════════════
              TAB: FILES
          ════════════════════════════════════════ */}
          {activeTab === "Files" && (
            <div className="animate-fade-in space-y-4">
              <FileSharing
                roomId={roomId}
                isHost={true}
                ws={wsRef.current}
              />
            </div>
          )}

        </div>
      </section>


      {/* ── Global toast notification stack (bottom-right) ─────────────── */}
      <NotificationToast toasts={toasts} onClose={removeToast} />

    </main>
  );
}