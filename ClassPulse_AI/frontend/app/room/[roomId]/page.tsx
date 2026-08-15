"use client";

import { use, useEffect, useRef, useState } from "react";

interface ChatMessage {
  type: string;
  username?: string;
  message: string;
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
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch current active poll
  const fetchActivePoll = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/rooms/${roomId}/polls/active`);
      const data = await res.json();
      if (data.poll) {
        setActivePoll(data.poll);
      }
    } catch (err) {
      console.error("Error fetching poll:", err);
    }
  };

  // Connect WebSocket once user joins
  useEffect(() => {
    if (!hasJoined) return;

    fetchActivePoll();
    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "poll_created" || data.type === "poll_update") {
          setActivePoll(data.poll);
        } else if (data.type === "message" || data.type === "system") {
          setMessages((prev) => [...prev, data]);
        }
      } catch (err) {
        console.error("Failed to parse WS event:", err);
      }
    };

    ws.onclose = () => setWsConnected(false);

    return () => {
      ws.close();
    };
  }, [hasJoined, roomId]);

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload = {
      type: "message",
      username: username.trim(),
      message: inputMsg.trim(),
    };

    wsRef.current.send(JSON.stringify(payload));
    setInputMsg("");
  };

  // Cast vote
  const handleVote = (option: string) => {
    if (!activePoll || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    setSelectedVote(option);

    const payload = {
      type: "poll_vote",
      poll_id: activePoll.id,
      username: username.trim(),
      selected_option: option,
    };

    wsRef.current.send(JSON.stringify(payload));
  };

  if (!hasJoined) {
    return (
      <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-white">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
          <h1 className="text-2xl font-bold">Join Classroom</h1>
          <p className="text-sm text-slate-400 mt-1">
            Room: <span className="text-blue-400 font-semibold uppercase">{roomId}</span>
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (username.trim()) setHasJoined(true);
            }}
            className="mt-6 space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Arun Kumar"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold hover:bg-blue-700 transition"
            >
              Enter Classroom
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col max-w-3xl mx-auto p-4">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
        <div>
          <h1 className="text-xl font-bold">ClassPulse Student View</h1>
          <p className="text-xs text-slate-400">
            Room: <span className="font-semibold uppercase text-blue-400">{roomId}</span> • Student: <span className="text-slate-200">{username}</span>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium border ${
            wsConnected
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
              : "bg-rose-500/10 text-rose-400 border-rose-500/20"
          }`}
        >
          ● {wsConnected ? "Connected" : "Reconnecting"}
        </span>
      </header>

      {/* Active Poll Card (if present) */}
      {activePoll && (
        <section className="mb-4 rounded-xl border border-blue-500/30 bg-blue-950/20 p-5">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
              Live Classroom Poll
            </span>
            <span className="text-xs text-slate-400">{activePoll.total_votes} votes cast</span>
          </div>

          <p className="text-sm font-semibold text-slate-100 mb-3">{activePoll.question}</p>

          <div className="grid gap-2 sm:grid-cols-2">
            {activePoll.options.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => handleVote(opt)}
                className={`rounded-lg border px-4 py-2.5 text-xs font-medium text-left transition ${
                  selectedVote === opt
                    ? "bg-blue-600 border-blue-400 text-white"
                    : "border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Live Chat Stream */}
      <section className="flex-1 flex flex-col rounded-xl border border-slate-800 bg-slate-900 overflow-hidden h-[450px]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <p className="text-center text-xs text-slate-500 italic mt-20">
              No questions asked yet. Be the first to ask!
            </p>
          ) : (
            messages.map((m, idx) => (
              <div key={idx} className="text-xs">
                {m.type === "system" ? (
                  <div className="text-slate-500 italic text-center py-1">
                    {m.message}
                  </div>
                ) : (
                  <div
                    className={`rounded-lg p-3 max-w-[85%] ${
                      m.username === username
                        ? "ml-auto bg-blue-600/20 border border-blue-500/30"
                        : "bg-slate-950 border border-slate-800"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1 text-[11px]">
                      <span className="font-semibold text-blue-400">{m.username}</span>
                      <span className="text-slate-500">
                        {new Date(m.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-200 text-sm">{m.message}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Message Input Form */}
        <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 border-t border-slate-800 flex gap-2">
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            placeholder="Ask a question or share feedback..."
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={!inputMsg.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            Send
          </button>
        </form>
      </section>
    </main>
  );
}