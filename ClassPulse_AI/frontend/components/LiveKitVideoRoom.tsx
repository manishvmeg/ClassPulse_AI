"use client";

import { useState, useCallback, useEffect } from "react";
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
  CarouselLayout,
  FocusLayout,
  FocusLayoutContainer,
  PreJoin,
  useRemoteParticipants,
  useLocalParticipant,
  type LocalUserChoices,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { API_URL } from "@/lib/config";


// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface LiveKitVideoRoomProps {
  roomId: string;
  username: string;
  isHost?: boolean;
  onDisconnect?: () => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Host Controls Panel (rendered INSIDE LiveKitRoom context)
// ──────────────────────────────────────────────────────────────────────────────

function HostControlsPanel({ roomId }: { roomId: string }) {
  const participants = useRemoteParticipants();
  const [isLocked, setIsLocked] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const post = async (url: string, body?: object) => {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const handleMuteAll = async () => {
    setBusy("mute-all");
    await post(`${API_URL}/rooms/${roomId}/mute-all`);
    setBusy(null);
  };

  const handleToggleLock = async () => {
    setBusy("lock");
    const next = !isLocked;
    await post(`${API_URL}/rooms/${roomId}/lock`, { lock: next });
    setIsLocked(next);
    setBusy(null);
  };

  const handleMute = async (identity: string, trackSid: string) => {
    setBusy(`mute-${identity}`);
    await post(`${API_URL}/rooms/${roomId}/mute-participant`, {
      participant_identity: identity,
      track_sid: trackSid,
    });
    setBusy(null);
  };

  const handleKick = async (identity: string, name: string) => {
    if (!confirm(`Remove "${name}" from the room?`)) return;
    setBusy(`kick-${identity}`);
    await fetch(`${API_URL}/rooms/${roomId}/kick/${encodeURIComponent(identity)}`, { method: "DELETE" });
    setBusy(null);
  };

  return (
    <div className="w-72 flex-shrink-0 bg-slate-950 border-l border-slate-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Host Controls</p>
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={handleMuteAll}
            disabled={busy === "mute-all"}
            className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
          >
            🔇 Mute All
          </button>
          <button
            onClick={handleToggleLock}
            disabled={busy === "lock"}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition disabled:opacity-50 ${
              isLocked
                ? "border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            }`}
          >
            {isLocked ? "🔓 Unlock" : "🔒 Lock"}
          </button>
        </div>
      </div>

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mb-2">
              <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-xs text-slate-500">No students yet</p>
          </div>
        ) : (
          participants.map((p) => {
            const audioPub = p.getTrackPublication(Track.Source.Microphone);
            const displayName = p.name || p.identity;
            return (
              <div key={p.identity} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                    {displayName[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{displayName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {p.isMicrophoneEnabled ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />Mic on
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500">🔇 Muted</span>
                      )}
                      {p.isCameraEnabled && <span className="text-[10px] text-blue-400">📷 Cam</span>}
                      {p.isScreenShareEnabled && <span className="text-[10px] text-violet-400">🖥️ Screen</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {audioPub && p.isMicrophoneEnabled && (
                    <button
                      onClick={() => handleMute(p.identity, audioPub.trackSid)}
                      disabled={busy === `mute-${p.identity}`}
                      className="flex-1 py-1 rounded-lg text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition disabled:opacity-50"
                    >
                      Mute
                    </button>
                  )}
                  <button
                    onClick={() => handleKick(p.identity, displayName)}
                    disabled={busy === `kick-${p.identity}`}
                    className="flex-1 py-1 rounded-lg text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2.5 border-t border-slate-800 flex-shrink-0">
        <p className="text-[11px] text-slate-500">
          {participants.length} student{participants.length !== 1 ? "s" : ""} connected
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Gallery View
// ──────────────────────────────────────────────────────────────────────────────

function GalleryView() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [] }
  );
  return (
    <GridLayout tracks={tracks} style={{ height: "100%", width: "100%" }}>
      <ParticipantTile />
    </GridLayout>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Speaker View (Active speaker large + carousel strip)
// ──────────────────────────────────────────────────────────────────────────────

function SpeakerView() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [] }
  );
  return (
    <FocusLayoutContainer style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CarouselLayout tracks={tracks} style={{ height: 120, minHeight: 120, flexShrink: 0 }}>
        <ParticipantTile />
      </CarouselLayout>
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <FocusLayout />
      </div>
    </FocusLayoutContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Room Recording (Browser MediaRecorder)
// ──────────────────────────────────────────────────────────────────────────────

function RecordingControls() {
  const [recording, setRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [chunks, setChunks] = useState<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
      const c: BlobPart[] = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) c.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(c, { type: "video/webm" });
        const url  = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ClassPulse_Recording_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      mr.start(1000);
      setRecorder(mr);
      setChunks(c);
      setRecording(true);
    } catch {
      // user cancelled or denied
    }
  };

  const stopRecording = () => {
    recorder?.stop();
    recorder?.stream.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setRecorder(null);
  };

  return (
    <button
      onClick={recording ? stopRecording : startRecording}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
        recording
          ? "border-rose-500/40 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 animate-pulse"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
      title={recording ? "Stop recording & download" : "Record session"}
    >
      {recording ? (
        <>
          <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
          Stop REC
        </>
      ) : (
        <>🔴 Record</>
      )}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────────────────────

export default function LiveKitVideoRoom({
  roomId,
  username,
  isHost = false,
  onDisconnect,
}: LiveKitVideoRoomProps) {
  const [token,      setToken]      = useState<string | null>(null);
  const [serverUrl,  setServerUrl]  = useState<string | null>(null);
  const [viewMode,   setViewMode]   = useState<"gallery" | "speaker">("gallery");
  const [showHosts,  setShowHosts]  = useState(true);
  const [prejoin,    setPrejoin]    = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Fetch LiveKit token from backend ───────────────────────────────────────
  const fetchToken = useCallback(
    async (choices: LocalUserChoices) => {
      setConnecting(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/rooms/${roomId}/token`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            participant_name: choices.username || username,
            is_host:          isHost,
          }),
        });
        const data = await res.json();
        if (data.token && data.server_url) {
          setToken(data.token);
          setServerUrl(data.server_url);
        } else {
          setError(data.error || "Failed to get token from server.");
        }
      } catch {
        setError("Could not reach ClassPulse backend.");
      } finally {
        setConnecting(false);
      }
    },
    [roomId, isHost, username]
  );

  // ── Pre-Join screen ────────────────────────────────────────────────────────
  if (!token || !serverUrl) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Join Video — Room {roomId.toUpperCase()}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isHost ? "You're the host — full controls enabled" : "Preview camera & mic before joining"}
            </p>
          </div>
        </div>

        {/* PreJoin widget */}
        <div className="p-5" data-lk-theme="default">
          <PreJoin
            defaults={{ username, videoEnabled: true, audioEnabled: true }}
            onSubmit={(choices) => { setPrejoin(true); fetchToken(choices); }}
            onError={(err) => setError(err.message)}
            joinLabel={connecting ? "Connecting..." : isHost ? "Start Class" : "Join Class"}
          />
          {error && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Live Room ──────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-2xl border border-slate-800 bg-slate-950 overflow-hidden flex flex-col"
      style={{ height: isHost ? "70vh" : "65vh", minHeight: 500 }}
    >
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 flex-shrink-0 bg-slate-900">
        {/* Live badge */}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse inline-block" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">Live</span>
        </div>
        <span className="text-slate-700">·</span>
        <span className="text-xs text-slate-400">Room <strong className="text-white">{roomId.toUpperCase()}</strong></span>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Recording */}
        <RecordingControls />

        {/* View toggle */}
        <div className="flex items-center border border-slate-800 bg-slate-950 rounded-lg overflow-hidden text-[11px]">
          <button
            onClick={() => setViewMode("gallery")}
            className={`px-2.5 py-1.5 font-medium transition ${viewMode === "gallery" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            ⊞ Grid
          </button>
          <button
            onClick={() => setViewMode("speaker")}
            className={`px-2.5 py-1.5 font-medium transition ${viewMode === "speaker" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            ▣ Speaker
          </button>
        </div>

        {/* Host panel toggle */}
        {isHost && (
          <button
            onClick={() => setShowHosts((v) => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition ${
              showHosts ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-400" : "border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            🎛 Controls
          </button>
        )}
      </div>

      {/* LiveKit room */}
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        video
        audio
        onDisconnected={() => {
          setToken(null);
          setServerUrl(null);
          onDisconnect?.();
        }}
        data-lk-theme="default"
        style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
      >
        {/* Main stage + optional host panel */}
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          {/* Video stage */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            {viewMode === "gallery" ? <GalleryView /> : <SpeakerView />}
          </div>

          {/* Host controls sidebar */}
          {isHost && showHosts && <HostControlsPanel roomId={roomId} />}
        </div>

        {/* Bottom control bar (mic, cam, screen share, leave built-in) */}
        <ControlBar
          style={{ flexShrink: 0, padding: "8px 16px" }}
          controls={{
            microphone: true,
            camera: true,
            screenShare: true,
            leave: true,
            chat: false,
          }}
        />

        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}
