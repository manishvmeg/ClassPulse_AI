"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import NotificationToast, { useToasts } from "@/components/NotificationToast";
import { requestAndSubscribePush, showLocalNotification } from "@/lib/pushNotifications";
import type { ScheduleItem } from "@/components/ScheduleCalendar";

// LiveKit must be loaded client-side only (no SSR)
const LiveKitVideoRoom = dynamic(
  () => import("@/components/LiveKitVideoRoom"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 flex items-center justify-center h-48">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400">Loading video...</p>
        </div>
      </div>
    ),
  }
);

const RaiseHand = dynamic(() => import("@/components/RaiseHand"), { ssr: false });
const Whiteboard = dynamic(() => import("@/components/Whiteboard"), { ssr: false });
const FileSharing = dynamic(() => import("@/components/FileSharing"), { ssr: false });

import { API_URL, WS_URL } from "@/lib/config";




// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  type: string;
  username?: string;
  message: string;
  timestamp: string;
  participants?: number;
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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-600", "bg-indigo-600", "bg-violet-600", "bg-emerald-600",
  "bg-amber-600", "bg-rose-600", "bg-cyan-600", "bg-pink-600",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────────────

export default function StudentRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);

  const [username, setUsername] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [activePoll, setActivePoll] = useState<PollData | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [pollDismissed, setPollDismissed] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [studentTab, setStudentTab] = useState<"chat" | "whiteboard" | "files">("chat");

  // ── New: Notifications + Schedule state ──────────────────────────────────
  const { toasts, addToast, removeToast } = useToasts();
  const [upcomingClasses, setUpcomingClasses] = useState<ScheduleItem[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Reset poll dismissed state when a new poll arrives
  useEffect(() => {
    if (activePoll) setPollDismissed(false);
  }, [activePoll?.id]);

  // ── Fetch current active poll ─────────────────────────────────────────────
  const fetchActivePoll = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/polls/active`);
      const data = await res.json();
      if (data.poll) setActivePoll(data.poll);
    } catch {
      /* silent */
    }
  }, [roomId]);

  // ── Connect WebSocket once user joins ─────────────────────────────────────
  useEffect(() => {
    if (!hasJoined) return;

    fetchActivePoll();
    const ws = new WebSocket(`${WS_URL}/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "poll_created" || data.type === "poll_update") {
          setActivePoll(data.poll);
          setSelectedVote(null);
        } else if (data.type === "class_scheduled") {
          const s = data.schedule as ScheduleItem;
          setUpcomingClasses((prev) =>
            prev.find((x) => x.id === s.id) ? prev : [...prev, s]
          );
          addToast({
            type: "success",
            title: "New Class Scheduled",
            body: `"${s.title}" on ${new Date(s.scheduled_at).toLocaleString()} · Room ${s.room_id.toUpperCase()}`,
            duration: 8000,
          });
          showLocalNotification(
            "ClassPulse AI — New Class",
            `"${s.title}" on ${new Date(s.scheduled_at).toLocaleString()}`
          );
        } else if (data.type === "class_reminder") {
          const s = data.schedule as ScheduleItem;
          addToast({
            type: "reminder",
            title: "🔔 Class starts in 5 minutes!",
            body: `"${s.title}" — Room ${s.room_id.toUpperCase()}`,
            action: { label: "Get Ready", href: "#" },
            duration: 12000,
          });
          showLocalNotification(
            "ClassPulse AI — Class Starting Soon!",
            `"${s.title}" starts in ~5 minutes!`
          );
        } else if (data.type === "schedule_deleted") {
          setUpcomingClasses((prev) =>
            prev.filter((s) => s.id !== data.schedule_id)
          );
        } else if (
          data.type !== "video-offer" &&
          data.type !== "video-answer" &&
          data.type !== "video-ice-candidate" &&
          data.type !== "video-join" &&
          data.type !== "video-leave"
        ) {
          setMessages((prev) => [...prev, data]);
          if (data.participants !== undefined) setParticipantCount(data.participants);
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => setWsConnected(false);

    return () => ws.close();
  }, [hasJoined, roomId, fetchActivePoll, addToast]);

  // ── After joining: fetch schedule + subscribe to push ────────────────────
  useEffect(() => {
    if (!hasJoined || !username) return;

    // Fetch upcoming classes for this room
    fetch(`${API_URL}/rooms/${roomId}/schedules?upcoming_only=true`)
      .then((r) => r.json())
      .then((d) => setUpcomingClasses(d.schedules ?? []))
      .catch(() => {});

    // Auto-subscribe to browser push notifications
    requestAndSubscribePush(username.trim(), "student", roomId).then((result) => {
      if (result.subscribed) setPushEnabled(true);
    });
  }, [hasJoined, username, roomId]);



  // ── Send message ──────────────────────────────────────────────────────────
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setIsSending(true);
    wsRef.current.send(JSON.stringify({
      type: "message",
      username: username.trim(),
      message: inputMsg.trim(),
    }));
    setInputMsg("");
    setTimeout(() => setIsSending(false), 300);
  };

  // ── Cast vote ─────────────────────────────────────────────────────────────
  const handleVote = (option: string) => {
    if (!activePoll || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setSelectedVote(option);
    wsRef.current.send(JSON.stringify({
      type: "poll_vote",
      poll_id: activePoll.id,
      username: username.trim(),
      selected_option: option,
    }));
    // Auto-dismiss poll card after voting
    setTimeout(() => setPollDismissed(true), 1200);
  };

  // ──────────────────────────────────────────────────────────────────────────
  // JOIN SCREEN
  // ──────────────────────────────────────────────────────────────────────────
  if (!hasJoined) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white relative overflow-hidden">
        {/* Background gradient glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-950/20 via-slate-950 to-indigo-950/20 pointer-events-none" />
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-md animate-slide-up">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-2xl mx-auto mb-4 animate-pulse-glow">
              <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold gradient-text">ClassPulse AI</h1>
            <p className="text-sm text-slate-400 mt-1">Real-Time Classroom Intelligence</p>
          </div>

          <div className="glass-strong rounded-2xl p-8 shadow-2xl">
            <div className="mb-6">
              <h2 className="text-lg font-bold">Join Classroom</h2>
              <p className="text-sm text-slate-400 mt-1">
                Room: <span className="text-blue-400 font-semibold uppercase">{roomId}</span>
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (username.trim()) setHasJoined(true);
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-400 mb-2 tracking-wider">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. Arun Kumar"
                  className="input-field"
                />
              </div>

              <button type="submit" disabled={!username.trim()} className="btn-primary w-full justify-center py-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
                Enter Classroom
              </button>
            </form>

            <p className="text-center text-[11px] text-slate-600 mt-5">
              Your name will be visible to the instructor and other participants.
            </p>
          </div>
        </div>
      </main>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // STUDENT CLASSROOM VIEW
  // ──────────────────────────────────────────────────────────────────────────

  const showPollCard = activePoll && !pollDismissed;

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col max-w-2xl mx-auto p-4 pb-6 relative">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between py-3 px-1 mb-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">ClassPulse AI</p>
            <p className="text-[11px] text-slate-500">
              Room <span className="text-blue-400 font-medium uppercase">{roomId}</span>
              {participantCount > 0 && <span className="ml-1 text-slate-600">· {participantCount} online</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Video toggle */}
          <button
            onClick={() => setShowVideo((v) => !v)}
            className={`btn-secondary text-xs py-1.5 px-3 ${showVideo ? "border-blue-500/40 text-blue-400" : ""}`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Video
          </button>

          {/* Connection status */}
          <span className={`badge ${wsConnected ? "badge-emerald" : "badge-rose"} text-[11px]`}>
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${wsConnected ? "bg-emerald-400 animate-pulse-dot" : "bg-rose-400"}`} />
            {wsConnected ? "Live" : "Connecting..."}
          </span>
        </div>
      </header>

      {/* ── MY IDENTITY CARD ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 mb-4 animate-fade-in delay-75">
        <div className={`avatar ${getAvatarColor(username)}`}>{getInitials(username)}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{username}</p>
          <p className="text-[11px] text-slate-500">Your classroom identity</p>
        </div>
        {pushEnabled && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 flex-shrink-0">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            Alerts On
          </span>
        )}
      </div>

      {/* ── UPCOMING CLASSES BANNER ─────────────────────────────────────────── */}
      {upcomingClasses.length > 0 && (
        <div className="rounded-xl border border-indigo-500/25 bg-indigo-950/20 px-4 py-3 mb-4 animate-fade-in">
          <p className="text-xs font-semibold text-indigo-300 mb-2 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upcoming Classes ({upcomingClasses.length})
          </p>
          <div className="space-y-1.5">
            {upcomingClasses.slice(0, 3).map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                <span className="text-xs text-slate-300 truncate flex-1">{s.title}</span>
                <span className="text-[10px] text-slate-500 flex-shrink-0 tabular-nums">
                  {new Date(s.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" · "}
                  {new Date(s.scheduled_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── VIDEO GRID ─────────────────────────────────────────────────────── */}
      {/* ── VIDEO ROOM (LiveKit SFU) ─────────────────────────────────────── */}
      {showVideo && (
        <div className="mb-4 animate-slide-up">
          <LiveKitVideoRoom
            roomId={roomId}
            username={username}
            isHost={false}
            onDisconnect={() => setShowVideo(false)}
          />
        </div>
      )}

      {/* ── ACTIVE POLL POPUP (slide-up overlay) ───────────────────────────── */}
      {showPollCard && (
        <div className="mb-4 animate-bounce-in">
          <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 to-indigo-950/20 p-5 relative">
            {/* Dismiss button */}
            <button
              onClick={() => setPollDismissed(true)}
              className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex items-center gap-2 mb-3">
              <span className="badge badge-blue text-[11px]">
                <span className="animate-pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-blue-400" />
                Live Classroom Poll
              </span>
              <span className="text-[11px] text-slate-500">{activePoll.total_votes} votes cast</span>
            </div>

            <p className="text-sm font-semibold text-slate-100 mb-3">{activePoll.question}</p>

            {selectedVote ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-center animate-bounce-in">
                <p className="text-emerald-400 text-sm font-semibold">
                  ✓ Vote submitted: &ldquo;{selectedVote}&rdquo;
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Results are visible to the instructor</p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {activePoll.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleVote(opt)}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium text-left transition ${
                      selectedVote === opt
                        ? "bg-blue-600 border-blue-400 text-white"
                        : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:border-slate-600"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Live vote bars */}
            {activePoll.total_votes > 0 && (
              <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
                {activePoll.options.map((opt, i) => {
                  const pct = activePoll.total_votes > 0
                    ? Math.round(((activePoll.votes[opt] ?? 0) / activePoll.total_votes) * 100)
                    : 0;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-0.5">
                        <span>{opt}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="poll-bar">
                        <div className="poll-bar-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── INTERACTION & DOUBTS WIDGET ─────────────────────────────────── */}
      <div className="mb-4 animate-fade-in">
        <RaiseHand
          username={username}
          roomId={roomId}
          isHost={false}
          ws={wsRef.current}
        />
      </div>

      {/* ── TAB SELECTOR (Discussion / Whiteboard / Files) ───────────────────── */}
      <div className="flex gap-2 mb-4 bg-slate-900 border border-slate-800 p-1 rounded-xl">
        <button
          onClick={() => setStudentTab("chat")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
            studentTab === "chat"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          💬 Live Chat
        </button>
        <button
          onClick={() => setStudentTab("whiteboard")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
            studentTab === "whiteboard"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          🖊️ Whiteboard
        </button>
        <button
          onClick={() => setStudentTab("files")}
          className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
            studentTab === "files"
              ? "bg-blue-600 text-white shadow-md shadow-blue-500/20"
              : "text-slate-400 hover:text-white"
          }`}
        >
          📁 Shared Files
        </button>
      </div>

      {/* ── WHITEBOARD VIEW ─────────────────────────────────────────────────── */}
      {studentTab === "whiteboard" && (
        <div className="mb-4 animate-fade-in">
          <Whiteboard
            roomId={roomId}
            username={username}
            isHost={false}
            ws={wsRef.current}
          />
        </div>
      )}

      {/* ── SHARED FILES VIEW ───────────────────────────────────────────────── */}
      {studentTab === "files" && (
        <div className="mb-4 animate-fade-in">
          <FileSharing
            roomId={roomId}
            isHost={false}
            ws={wsRef.current}
          />
        </div>
      )}

      {/* ── CHAT STREAM ────────────────────────────────────────────────────── */}
      {studentTab === "chat" && (
        <div className="flex-1 flex flex-col rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden animate-fade-in delay-150" style={{ minHeight: "380px" }}>
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 flex-shrink-0">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-medium">Class Discussion</span>
            <span className="ml-auto text-[11px] text-slate-500">{messages.filter(m => m.type === "message").length} messages</span>
          </div>


        {/* Messages scroll area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-slate-500">Class hasn&apos;t started yet.</p>
              <p className="text-xs text-slate-600">Be the first to ask a question!</p>
            </div>
          ) : (
            messages.map((m, i) => {
              const isMine = m.username === username;
              return (
                <div key={i} className="animate-fade-in" style={{ animationDelay: `${Math.min(i * 30, 200)}ms` }}>
                  {m.type === "system" ? (
                    <div className="chat-bubble-system mx-auto w-fit">
                      {m.message}
                    </div>
                  ) : (
                    <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                      {!isMine && (
                        <div className={`avatar avatar-sm flex-shrink-0 ${getAvatarColor(m.username ?? "?")}`}>
                          {getInitials(m.username ?? "?")}
                        </div>
                      )}
                      <div className={`${isMine ? "chat-bubble-self ml-auto" : "chat-bubble-other"} px-3.5 py-2.5 max-w-[80%]`}>
                        {!isMine && (
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[11px] font-semibold text-blue-400">{m.username}</span>
                            {m.message.includes("?") && (
                              <span className="badge badge-amber text-[9px] py-0 px-1">Question</span>
                            )}
                          </div>
                        )}
                        <p className="text-sm text-slate-100 leading-relaxed">{m.message}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 text-right">
                          {new Date(m.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 flex gap-2 flex-shrink-0 bg-slate-950/60">
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder="Ask a question or share feedback..."
            className="input-field flex-1 py-2.5"
          />
          <button
            type="submit"
            disabled={!inputMsg.trim() || isSending}
            className="btn-primary py-2.5 px-4 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
      )}

      {/* ── BOTTOM STATUS ──────────────────────────────────────────────────── */}

      <p className="text-center text-[11px] text-slate-600 mt-3">
        Your instructor can see your messages in real-time via the ClassPulse AI dashboard.
      </p>

      {/* ── Global toast notification stack ─────────────────────────────────── */}
      <NotificationToast toasts={toasts} onClose={removeToast} />

    </main>
  );
}