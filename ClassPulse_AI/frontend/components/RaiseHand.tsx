"use client";
import { useState, useEffect, useCallback } from "react";

interface Reaction {
  username: string;
  emoji: string;
  id: string;
}

interface RaiseHandProps {
  username: string;
  roomId: string;
  isHost: boolean;
  ws?: WebSocket | null;
}

const REACTIONS = [
  { emoji: "👍", label: "Understood" },
  { emoji: "❓", label: "Question" },
  { emoji: "🎉", label: "Bravo" },
  { emoji: "😕", label: "Confused" },
  { emoji: "⏩", label: "Speed up" },
  { emoji: "⏸️", label: "Slow down" },
];

export default function RaiseHand({ username, roomId, isHost, ws }: RaiseHandProps) {
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<string[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const send = useCallback(
    (msg: object) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    [ws]
  );

  // Handle incoming WS events
  useEffect(() => {
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "hand_raised") {
          setRaisedHands((prev) => (prev.includes(data.username) ? prev : [...prev, data.username]));
        } else if (data.type === "hand_lowered") {
          setRaisedHands((prev) => prev.filter((u) => u !== data.username));
        } else if (data.type === "reaction") {
          const reaction: Reaction = {
            username: data.username,
            emoji: data.emoji,
            id: `${Date.now()}-${Math.random()}`,
          };
          setReactions((prev) => [...prev, reaction]);
          setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.id !== reaction.id));
          }, 3500);
        }
      } catch {
        // ignore
      }
    };

    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws]);

  const toggleHand = () => {
    const next = !handRaised;
    setHandRaised(next);
    send({ type: next ? "hand_raised" : "hand_lowered", username, room_id: roomId });
  };

  const sendReaction = (emoji: string) => {
    send({ type: "reaction", emoji, username, room_id: roomId });
    setShowPicker(false);
  };

  return (
    <div className="relative">
      {/* Floating live reaction overlay */}
      <div className="fixed bottom-24 right-8 pointer-events-none z-50 flex flex-col items-end gap-2">
        {reactions.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-slate-700 shadow-2xl animate-bounce-in"
          >
            <span className="text-xl">{r.emoji}</span>
            <span className="text-xs text-slate-300 font-semibold">{r.username}</span>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">✋</span>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live Interaction & Queue</h3>
          </div>
          {raisedHands.length > 0 && (
            <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              {raisedHands.length} hand(s) up
            </span>
          )}
        </div>

        {/* Student actions */}
        {!isHost && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={toggleHand}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition border flex items-center justify-center gap-2 ${
                handRaised
                  ? "border-amber-500/50 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/20"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
              }`}
            >
              <span>{handRaised ? "✋" : "🖐️"}</span>
              <span>{handRaised ? "Hand Raised (Click to Lower)" : "Raise Hand for Doubt"}</span>
            </button>

            <div className="relative">
              <button
                onClick={() => setShowPicker((v) => !v)}
                className="px-3 py-2.5 rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition text-sm"
                title="Send Live Reaction"
              >
                😊
              </button>

              {showPicker && (
                <div className="absolute bottom-full mb-2 right-0 bg-slate-900 border border-slate-700 rounded-2xl p-2 grid grid-cols-3 gap-1.5 shadow-2xl z-50 min-w-[150px]">
                  {REACTIONS.map(({ emoji, label }) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      title={label}
                      className="p-2 rounded-xl hover:bg-slate-800 text-xl transition flex flex-col items-center gap-0.5"
                    >
                      <span>{emoji}</span>
                      <span className="text-[8px] text-slate-500 font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Instructor Raised Hands Queue */}
        {isHost && (
          <div>
            {raisedHands.length === 0 ? (
              <p className="text-xs text-slate-500 italic py-1">No active questions in queue</p>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {raisedHands.map((u) => (
                  <div
                    key={u}
                    className="flex items-center justify-between rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-amber-400">✋</span>
                      <span className="text-xs font-semibold text-white">{u}</span>
                      <span className="text-[10px] text-amber-400/80">(Requests speech)</span>
                    </div>
                    <button
                      onClick={() => {
                        setRaisedHands((prev) => prev.filter((h) => h !== u));
                        send({ type: "hand_lowered", username: u, room_id: roomId });
                      }}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-2 py-1 rounded-lg transition"
                    >
                      Dismiss
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quick Reaction Bar */}
        <div className="flex gap-1.5 pt-2 border-t border-slate-800/80 justify-between">
          {REACTIONS.map(({ emoji, label }) => (
            <button
              key={emoji}
              onClick={() => sendReaction(emoji)}
              className="text-base p-1.5 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition hover:scale-110"
              title={label}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
