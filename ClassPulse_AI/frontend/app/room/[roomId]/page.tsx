"use client";

import { use, useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  FastForward,
  HelpCircle,
  MessageSquare,
  Mic,
  Radio,
  Rewind,
  Send,
  Sparkles,
  User,
  Users,
  Video,
  VideoOff,
  Vote,
  X,
  EyeOff,
  Flame,
  FileText,
  Volume2,
} from "lucide-react";

import PaceGauge, { type PaceTelemetry } from "@/components/PaceGauge";
import LiveCaptions from "@/components/LiveCaptions";
import FlashcardDeck from "@/components/FlashcardDeck";
import VideoGrid from "@/components/VideoGrid";
import NotificationToast, { useToasts } from "@/components/NotificationToast";
import { requestAndSubscribePush, showLocalNotification } from "@/lib/pushNotifications";
import { API_URL, WS_URL } from "@/lib/config";

// Dynamically load Whiteboard and FileSharing
const Whiteboard = dynamic(() => import("@/components/Whiteboard"), { ssr: false });
const FileSharing = dynamic(() => import("@/components/FileSharing"), { ssr: false });
const RaiseHand = dynamic(() => import("@/components/RaiseHand"), { ssr: false });

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

interface PollData {
  id: string | number;
  room_id: string;
  question: string;
  options: string[];
  is_active: boolean;
  votes: Record<string, number>;
  total_votes: number;
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

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]?.toUpperCase() ?? "").slice(0, 2).join("");
}

export default function StudentRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = use(params);

  // User Join State
  const [username, setUsername] = useState("");
  const [hasJoined, setHasJoined] = useState(false);

  // Real-time State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMsg, setInputMsg] = useState("");
  const [isDoubt, setIsDoubt] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const [activePoll, setActivePoll] = useState<PollData | null>(null);
  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [pollDismissed, setPollDismissed] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);

  // Pace Telemetry
  const [userPace, setUserPace] = useState<"too_fast" | "good" | "too_slow" | null>(null);
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

  // Catch Me Up
  const [showCatchUpModal, setShowCatchUpModal] = useState(false);
  const [catchUpLoading, setCatchUpLoading] = useState(false);
  const [catchUpBullets, setCatchUpBullets] = useState<string[]>([]);

  // Active View Tabs: chat | video | whiteboard | files | revision
  const [studentTab, setStudentTab] = useState<"chat" | "video" | "whiteboard" | "files" | "revision">("chat");
  const [showCaptions, setShowCaptions] = useState(false);

  const { toasts, addToast, removeToast } = useToasts();
  const wsRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch initial active poll & messages
  const fetchRoomState = useCallback(async () => {
    try {
      const [pollRes, msgsRes, paceRes] = await Promise.all([
        fetch(`${API_URL}/rooms/${roomId}/polls/active`),
        fetch(`${API_URL}/rooms/${roomId}/messages`),
        fetch(`${API_URL}/rooms/${roomId}/pace`),
      ]);

      if (pollRes.ok) {
        const pData = await pollRes.json();
        if (pData.poll) setActivePoll(pData.poll);
      }
      if (msgsRes.ok) {
        const mData = await msgsRes.json();
        if (mData.messages) setMessages(mData.messages);
      }
      if (paceRes.ok) {
        const pcData = await paceRes.json();
        if (pcData.dominant_pace) setPaceTelemetry(pcData);
      }
    } catch (e) {
      console.warn("Failed fetching room initial state:", e);
    }
  }, [roomId]);

  // Connect WebSocket after joining
  useEffect(() => {
    if (!hasJoined) return;

    fetchRoomState();
    const ws = new WebSocket(`${WS_URL}/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      // Send join event with attendance recording
      ws.send(JSON.stringify({ type: "join", username: username.trim() }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "message" || data.type === "chat") {
          setMessages((prev) => [...prev, data]);
        } else if (data.type === "pace_telemetry") {
          setPaceTelemetry(data);
        } else if (data.type === "poll_created" || data.type === "poll_update") {
          setActivePoll(data.poll);
          if (data.type === "poll_created") {
            setPollDismissed(false);
            setSelectedVote(null);
            addToast({
              type: "info",
              title: "New Poll Broadcasted!",
              body: data.poll.question,
              duration: 6000,
            });
          }
        } else if (data.type === "system") {
          if (data.participants !== undefined) setParticipantCount(data.participants);
        }
      } catch (e) {
        /* ignore */
      }
    };

    ws.onclose = () => setWsConnected(false);

    return () => {
      ws.close();
    };
  }, [hasJoined, roomId, username, fetchRoomState, addToast]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setHasJoined(true);
    // Request push permissions
    requestAndSubscribePush(username.trim(), "student", roomId);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setIsSending(true);
    const payload = {
      type: "message",
      username: username.trim(),
      message: inputMsg.trim(),
      is_doubt: isDoubt,
      is_anonymous: isAnonymous,
    };
    wsRef.current.send(JSON.stringify(payload));
    setInputMsg("");
    setIsDoubt(false);
    setIsSending(false);
  };

  const handlePaceVote = (pace: "too_fast" | "good" | "too_slow") => {
    setUserPace(pace);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "pace_update",
          username: username.trim(),
          pace,
        })
      );
    }
  };

  const handlePollVote = async (option: string) => {
    if (!activePoll || isVoting) return;
    setSelectedVote(option);
    setIsVoting(true);

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "poll_vote",
          poll_id: activePoll.id,
          username: username.trim(),
          selected_option: option,
        })
      );
    }
    setIsVoting(false);
  };

  const handleCatchMeUp = async () => {
    setShowCatchUpModal(true);
    setCatchUpLoading(true);
    try {
      const res = await fetch(`${API_URL}/rooms/${roomId}/catch-up`, { method: "POST" });
      const data = await res.json();
      if (data.summary) {
        setCatchUpBullets(data.summary);
      }
    } catch (e) {
      setCatchUpBullets([
        "The class is currently discussing key lecture concepts.",
        "Students have submitted doubts regarding practical application.",
        "Review the active whiteboard and chat to get up to speed.",
      ]);
    } finally {
      setCatchUpLoading(false);
    }
  };

  // Join Screen
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-tr from-blue-900/10 via-slate-950 to-indigo-900/10" />
        <div className="relative w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-white">ClassPulse Student Portal</h1>
              <p className="text-xs text-slate-400">Room: <span className="text-indigo-400 font-mono font-bold uppercase">{roomId}</span></p>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Your Full Name / Alias
              </label>
              <input
                type="text"
                placeholder="e.g. Alex Johnson"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
              />
            </div>

            <button
              type="submit"
              disabled={!username.trim()}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm font-bold shadow-lg shadow-blue-600/30 transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              <span>Join Live Lecture</span>
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <Link href="/" className="hover:text-slate-200 transition-colors flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" />
              Teacher Command Center
            </Link>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Live Room
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <NotificationToast toasts={toasts} onClose={removeToast} />

      {/* Header Bar */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white">ClassPulse</h1>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 font-mono text-[11px] font-bold uppercase">
                  {roomId}
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {participantCount} online
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleCatchMeUp}
              className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Get a 3-bullet instant summary of recent lecture events"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>Catch Me Up</span>
            </button>

            <button
              onClick={() => setShowCaptions(!showCaptions)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
                showCaptions
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                  : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700"
              }`}
              title="Toggle Live Speech Captions"
            >
              <Radio className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pace Bar Integration for Student */}
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-slate-800/60">
          <PaceGauge
            telemetry={paceTelemetry}
            interactive={true}
            userVote={userPace}
            onVote={handlePaceVote}
            compact={true}
          />
        </div>
      </header>

      {/* Main Grid & Tabs */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-5 flex flex-col gap-4">
        {/* Navigation Switcher Tabs */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setStudentTab("chat")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all flex-shrink-0 ${
              studentTab === "chat"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Chat & Doubts ({messages.length})</span>
          </button>
          <button
            onClick={() => setStudentTab("video")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all flex-shrink-0 ${
              studentTab === "video"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Video className="w-4 h-4" />
            <span>WebRTC Video Grid</span>
          </button>
          <button
            onClick={() => setStudentTab("whiteboard")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all flex-shrink-0 ${
              studentTab === "whiteboard"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Whiteboard</span>
          </button>
          <button
            onClick={() => setStudentTab("files")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all flex-shrink-0 ${
              studentTab === "files"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Shared Files</span>
          </button>
          <button
            onClick={() => setStudentTab("revision")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all flex-shrink-0 ${
              studentTab === "revision"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "text-indigo-400 hover:text-indigo-300"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Revision & Flashcards</span>
          </button>
        </div>

        {/* Live Captions Overlay if open */}
        {showCaptions && (
          <LiveCaptions
            roomId={roomId}
            speakerName={username}
            ws={wsRef.current}
            canBroadcast={false}
          />
        )}

        {/* Tab Content Panes */}
        {studentTab === "chat" && (
          <div className="flex-1 flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden min-h-[500px] shadow-xl">
            {/* Chat Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-center p-6">
                  <MessageSquare className="w-10 h-10 mb-2 text-slate-400" />
                  <p className="text-sm font-semibold">No messages yet</p>
                  <p className="text-xs text-slate-400">Ask a question or submit an anonymous doubt below!</p>
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isOwn = m.username === username || m.raw_username === username;
                  const isDoubtMsg = m.is_doubt;
                  const isAnon = m.is_anonymous;

                  return (
                    <div
                      key={idx}
                      className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[11px] font-semibold text-slate-400">
                          {isAnon ? "Anonymous Whisper" : m.username}
                        </span>
                        {isDoubtMsg && (
                          <span className="px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                            Doubt
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-mono">
                          {m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>

                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm leading-relaxed ${
                          isDoubtMsg
                            ? "bg-amber-950/40 border border-amber-500/40 text-amber-100 shadow-sm"
                            : isOwn
                            ? "bg-blue-600 text-white rounded-tr-none shadow-md shadow-blue-600/20"
                            : "bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-none"
                        }`}
                      >
                        {m.message}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input Controls with Whisper / Doubt Toggles */}
            <div className="p-3 bg-slate-950/90 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDoubt(!isDoubt)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isDoubt
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-500/20"
                        : "bg-slate-900 text-slate-400 hover:text-slate-300 border border-slate-800"
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Doubt Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsAnonymous(!isAnonymous)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isAnonymous
                        ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/50 shadow-sm shadow-indigo-500/20"
                        : "bg-slate-900 text-slate-400 hover:text-slate-300 border border-slate-800"
                    }`}
                  >
                    <EyeOff className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Whisper Anonymously</span>
                  </button>
                </div>

                <RaiseHand ws={wsRef.current} username={username} roomId={roomId} isHost={false} />
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={
                    isDoubt
                      ? "Submit a question or conceptual doubt to the instructor..."
                      : isAnonymous
                      ? "Whisper an anonymous doubt..."
                      : "Type a message to the class..."
                  }
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-400"
                />
                <button
                  type="submit"
                  disabled={!inputMsg.trim() || isSending}
                  className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white transition-all shadow-md shadow-blue-600/30"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        )}

        {studentTab === "video" && (
          <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 min-h-[480px]">
            <VideoGrid
              ws={wsRef.current}
              username={username}
              roomId={roomId}
              isVisible={true}
            />
          </div>
        )}

        {studentTab === "whiteboard" && (
          <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 min-h-[500px]">
            <Whiteboard ws={wsRef.current} roomId={roomId} username={username} isHost={false} />
          </div>
        )}

        {studentTab === "files" && (
          <div className="flex-1 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 min-h-[480px]">
            <FileSharing roomId={roomId} isHost={false} ws={wsRef.current} />
          </div>
        )}

        {studentTab === "revision" && (
          <div className="flex-1">
            <FlashcardDeck roomId={roomId} />
          </div>
        )}
      </main>

      {/* Active Poll Popup Modal */}
      {activePoll && !pollDismissed && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-indigo-500/50 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2 text-indigo-400">
                <Vote className="w-5 h-5 animate-bounce" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Live Classroom Poll
                </h3>
              </div>
              <button
                onClick={() => setPollDismissed(true)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-base font-semibold text-slate-100 mb-4">{activePoll.question}</p>

            <div className="space-y-2 mb-4">
              {activePoll.options.map((opt, idx) => {
                const count = activePoll.votes?.[opt] || 0;
                const total = activePoll.total_votes || 1;
                const pct = Math.round((count / total) * 100);
                const isSelected = selectedVote === opt;

                return (
                  <button
                    key={idx}
                    onClick={() => handlePollVote(opt)}
                    className={`w-full p-3 rounded-xl border text-left text-xs font-medium transition-all relative overflow-hidden flex items-center justify-between ${
                      isSelected
                        ? "bg-indigo-600/30 border-indigo-500 text-indigo-200"
                        : "bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300"
                    }`}
                  >
                    <div
                      className="absolute inset-0 bg-indigo-500/10 pointer-events-none transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                    <span className="relative z-10 flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      {opt}
                    </span>
                    <span className="relative z-10 font-mono text-[11px] text-slate-400 font-bold">
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
              <span>{activePoll.total_votes} total votes submitted</span>
              <button
                onClick={() => setPollDismissed(true)}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Minimize Poll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Click "Catch Me Up" Summary Modal */}
      {showCatchUpModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5 text-indigo-400">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-sm font-bold text-slate-100">AI Catch Me Up</h3>
              </div>
              <button
                onClick={() => setShowCatchUpModal(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {catchUpLoading ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                <span>Reading recent lecture dialogue...</span>
              </div>
            ) : (
              <div className="space-y-3 mb-5">
                <p className="text-xs text-slate-400">Here is what happened in the lecture recently:</p>
                <ul className="space-y-2.5 text-xs text-slate-200">
                  {catchUpBullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-indigo-400 font-bold mt-0.5">•</span>
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => setShowCatchUpModal(false)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-md shadow-indigo-600/30"
            >
              Got It, Back to Class
            </button>
          </div>
        </div>
      )}
    </div>
  );
}