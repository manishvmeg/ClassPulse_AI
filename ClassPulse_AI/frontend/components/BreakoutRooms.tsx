"use client";
import { useState, useEffect } from "react";

interface BreakoutRoom {
  id: string;
  name: string;
  participants: string[];
}

interface BreakoutRoomsProps {
  roomId: string;
  username: string;
  isHost: boolean;
  ws: WebSocket | null;
  allParticipants: string[];
}

export default function BreakoutRooms({ roomId, username, isHost, ws, allParticipants }: BreakoutRoomsProps) {
  const [rooms, setRooms] = useState<BreakoutRoom[]>([]);
  const [myBreakout, setMyBreakout] = useState<string | null>(null);
  const [roomCount, setRoomCount] = useState(2);
  const [timer, setTimer] = useState(10); // minutes
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [active, setActive] = useState(false);

  // Receive breakout events from server
  useEffect(() => {
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "breakout_started") {
          setRooms(data.rooms);
          setActive(true);
          setTimeLeft(data.timer_minutes * 60);
          const myRoom = data.rooms.find((r: BreakoutRoom) => r.participants.includes(username));
          if (myRoom) setMyBreakout(myRoom.id);
        } else if (data.type === "breakout_ended") {
          setRooms([]);
          setActive(false);
          setMyBreakout(null);
          setTimeLeft(null);
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, username]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  const startBreakouts = () => {
    if (!ws || !isHost) return;
    const participantsList = allParticipants.length > 0 ? allParticipants : [username, "Student 1", "Student 2"];
    const shuffled = [...participantsList].sort(() => Math.random() - 0.5);
    const newRooms: BreakoutRoom[] = Array.from({ length: roomCount }, (_, i) => ({
      id: `breakout-${roomId}-${i + 1}`,
      name: `Group ${i + 1}`,
      participants: [],
    }));
    shuffled.forEach((p, i) => newRooms[i % roomCount].participants.push(p));
    setRooms(newRooms);
    setActive(true);
    ws.send(
      JSON.stringify({
        type: "breakout_start",
        rooms: newRooms,
        timer_minutes: timer,
        room_id: roomId,
      })
    );
  };

  const endBreakouts = () => {
    if (!ws || !isHost) return;
    ws.send(JSON.stringify({ type: "breakout_end", room_id: roomId }));
    setRooms([]);
    setActive(false);
    setTimeLeft(null);
  };

  const formatTime = (secs: number) =>
    `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Breakout Sub-Rooms</h3>
            <p className="text-[11px] text-slate-400">Collaborative peer discussions with automated timer</p>
          </div>
        </div>
        {active && timeLeft !== null && (
          <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-400 animate-pulse">
            ⏱ {formatTime(timeLeft)} Remaining
          </span>
        )}
      </div>

      {!active && isHost && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">Number of groups</label>
              <select
                value={roomCount}
                onChange={(e) => setRoomCount(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} Groups
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block font-medium">Session Duration</label>
              <select
                value={timer}
                onChange={(e) => setTimer(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {[5, 10, 15, 20, 30].map((n) => (
                  <option key={n} value={n}>
                    {n} Minutes
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={startBreakouts}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition"
          >
            🚀 Broadcast & Launch Breakout Groups
          </button>
        </div>
      )}

      {active && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rooms.map((room) => (
              <div
                key={room.id}
                className={`rounded-xl border p-3.5 transition ${
                  myBreakout === room.id
                    ? "border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/10"
                    : "border-slate-800 bg-slate-800/40"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                    {room.name}
                  </span>
                  {myBreakout === room.id && (
                    <span className="text-[10px] bg-amber-500 text-black px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                      Assigned Here
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {room.participants.length > 0 ? (
                    room.participants.map((p) => (
                      <span key={p} className="text-[11px] bg-slate-700/60 border border-slate-600/40 text-slate-300 px-2 py-0.5 rounded-lg">
                        {p}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-slate-500 italic">No participants</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {isHost && (
            <button
              onClick={endBreakouts}
              className="w-full mt-3 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-bold hover:bg-rose-500/20 transition"
            >
              End Breakout Sessions & Return All to Main Stage
            </button>
          )}
        </div>
      )}
    </div>
  );
}
