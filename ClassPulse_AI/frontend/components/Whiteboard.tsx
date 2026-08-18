"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

interface WhiteboardProps {
  roomId: string;
  username: string;
  isHost: boolean;
  ws?: WebSocket | null;
}

// Simple interactive canvas whiteboard that works seamlessly client-side
export default function Whiteboard({ roomId, username, isHost, ws }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#3b82f6"); // default blue
  const [lineWidth, setLineWidth] = useState(3);
  const [mode, setMode] = useState<"draw" | "erase">("draw");

  // Sync incoming draw actions from WebSocket
  useEffect(() => {
    if (!ws) return;
    const handler = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "whiteboard_draw" && data.username !== username && data.roomId === roomId) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.strokeStyle = data.mode === "erase" ? "#0f172a" : data.color;
          ctx.lineWidth = data.lineWidth;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          if (data.action === "start") {
            ctx.beginPath();
            ctx.moveTo(data.x * canvas.width, data.y * canvas.height);
          } else if (data.action === "draw") {
            ctx.lineTo(data.x * canvas.width, data.y * canvas.height);
            ctx.stroke();
          } else if (data.action === "clear") {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      } catch {
        // ignore
      }
    };

    ws.addEventListener("message", handler);
    return () => ws.removeEventListener("message", handler);
  }, [ws, username, roomId]);

  const sendDraw = (action: string, x: number, y: number) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "whiteboard_draw",
        roomId,
        username,
        action,
        x,
        y,
        color,
        lineWidth: mode === "erase" ? 20 : lineWidth,
        mode,
      })
    );
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.strokeStyle = mode === "erase" ? "#0f172a" : color;
      ctx.lineWidth = mode === "erase" ? 20 : lineWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x * canvas.width, y * canvas.height);
    }

    setIsDrawing(true);
    sendDraw("start", x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.lineTo(x * canvas.width, y * canvas.height);
      ctx.stroke();
    }

    sendDraw("draw", x, y);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "whiteboard_draw", roomId, username, action: "clear" }));
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col h-[580px]">
      {/* Whiteboard Toolbar */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
            <span className="text-sm">🖊️</span>
          </div>
          <div>
            <h3 className="text-xs font-bold text-white">Interactive Class Whiteboard</h3>
            <p className="text-[10px] text-slate-400">Live dual-canvas synchronized in real-time</p>
          </div>
        </div>

        {/* Tools */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pen / Eraser Toggle */}
          <div className="flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
            <button
              onClick={() => setMode("draw")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                mode === "draw" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              ✏️ Pen
            </button>
            <button
              onClick={() => setMode("erase")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${
                mode === "erase" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              🧹 Eraser
            </button>
          </div>

          {/* Color pickers */}
          {mode === "draw" && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800">
              {["#3b82f6", "#10b981", "#ef4444", "#f59e0b", "#a855f7", "#ffffff"].map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-4 h-4 rounded-full transition-transform ${
                    color === c ? "scale-125 ring-2 ring-white/50" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          )}

          {/* Stroke Width */}
          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-slate-300 focus:outline-none"
          >
            <option value={2}>Thin (2px)</option>
            <option value={4}>Medium (4px)</option>
            <option value={8}>Bold (8px)</option>
            <option value={14}>Marker (14px)</option>
          </select>

          {/* Clear board */}
          <button
            onClick={clearBoard}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Drawing Canvas */}
      <div className="flex-1 bg-[#0f172a] relative overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          width={1200}
          height={800}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full object-contain block touch-none"
        />
        <div className="absolute bottom-3 right-3 pointer-events-none bg-slate-950/80 backdrop-blur px-3 py-1 rounded-full border border-slate-800 text-[10px] text-slate-400">
          Room {roomId.toUpperCase()} · Live Sync Enabled
        </div>
      </div>
    </div>
  );
}
