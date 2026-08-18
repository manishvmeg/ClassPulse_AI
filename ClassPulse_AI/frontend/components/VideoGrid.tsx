"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ──────────────────────────────────────────────────────────────────────────────
// WebRTC Configuration
// ──────────────────────────────────────────────────────────────────────────────

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface RemotePeer {
  username: string;
  stream: MediaStream | null;
  connection: RTCPeerConnection;
}

interface VideoGridProps {
  /** WebSocket instance (already connected to the room) */
  ws: WebSocket | null;
  /** Local username */
  username: string;
  /** Room ID (for logging/display only) */
  roomId: string;
  /** Whether the grid panel is visible */
  isVisible: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────
// Avatar helpers
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
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// ──────────────────────────────────────────────────────────────────────────────
// VideoGrid Component
// ──────────────────────────────────────────────────────────────────────────────

export default function VideoGrid({ ws, username, roomId, isVisible }: VideoGridProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map());
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [hasJoinedVideo, setHasJoinedVideo] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RemotePeer>>(new Map());

  // Keep peersRef in sync with state for use in callbacks
  useEffect(() => {
    peersRef.current = remotePeers;
  }, [remotePeers]);

  // ── Clean up on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((peer) => peer.connection.close());
    };
  }, []);

  // ── Assign local stream to video element ─────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // ── Create RTCPeerConnection for a remote peer ────────────────────────────
  const createPeerConnection = useCallback(
    (remoteUsername: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(RTC_CONFIG);

      // Add local tracks
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      // Receive remote tracks
      pc.ontrack = (e) => {
        const [remoteStream] = e.streams;
        setRemotePeers((prev) => {
          const next = new Map(prev);
          const existing = next.get(remoteUsername);
          if (existing) {
            next.set(remoteUsername, { ...existing, stream: remoteStream });
          } else {
            next.set(remoteUsername, { username: remoteUsername, stream: remoteStream, connection: pc });
          }
          return next;
        });
      };

      // Forward ICE candidates via WebSocket
      pc.onicecandidate = (e) => {
        if (e.candidate && ws?.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "video-ice-candidate",
              target: remoteUsername,
              from: username,
              candidate: e.candidate.toJSON(),
            })
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          setRemotePeers((prev) => {
            const next = new Map(prev);
            next.delete(remoteUsername);
            return next;
          });
        }
      };

      return pc;
    },
    [ws, username]
  );

  // ── Handle incoming WebRTC signaling messages ─────────────────────────────
  useEffect(() => {
    if (!ws) return;

    const handleMessage = async (event: MessageEvent) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      const { type } = data;

      // A new peer joined video — we initiate an offer
      if (type === "video-join") {
        const peerName = data.username as string;
        if (peerName === username || !localStreamRef.current) return;

        const pc = createPeerConnection(peerName);
        setRemotePeers((prev) => {
          const next = new Map(prev);
          next.set(peerName, { username: peerName, stream: null, connection: pc });
          return next;
        });

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(
            JSON.stringify({
              type: "video-offer",
              target: peerName,
              from: username,
              sdp: pc.localDescription,
            })
          );
        } catch (err) {
          console.error("[VideoGrid] Failed to create offer:", err);
        }
      }

      // We received an offer — create an answer
      else if (type === "video-offer") {
        const peerName = data.from as string;
        if (peerName === username) return;

        const pc = createPeerConnection(peerName);
        setRemotePeers((prev) => {
          const next = new Map(prev);
          next.set(peerName, { username: peerName, stream: null, connection: pc });
          return next;
        });

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          ws.send(
            JSON.stringify({
              type: "video-answer",
              target: peerName,
              from: username,
              sdp: pc.localDescription,
            })
          );
        } catch (err) {
          console.error("[VideoGrid] Failed to create answer:", err);
        }
      }

      // We received an answer — complete the handshake
      else if (type === "video-answer") {
        const peerName = data.from as string;
        const peer = peersRef.current.get(peerName);
        if (!peer) return;

        try {
          await peer.connection.setRemoteDescription(
            new RTCSessionDescription(data.sdp as RTCSessionDescriptionInit)
          );
        } catch (err) {
          console.error("[VideoGrid] Failed to set remote description:", err);
        }
      }

      // ICE candidate from a peer
      else if (type === "video-ice-candidate") {
        const peerName = data.from as string;
        const peer = peersRef.current.get(peerName);
        if (!peer || !data.candidate) return;

        try {
          await peer.connection.addIceCandidate(new RTCIceCandidate(data.candidate as RTCIceCandidateInit));
        } catch (err) {
          console.error("[VideoGrid] Failed to add ICE candidate:", err);
        }
      }

      // A peer left video
      else if (type === "video-leave") {
        const peerName = data.username as string;
        setRemotePeers((prev) => {
          const next = new Map(prev);
          const peer = next.get(peerName);
          peer?.connection.close();
          next.delete(peerName);
          return next;
        });
      }
    };

    ws.addEventListener("message", handleMessage);
    return () => ws.removeEventListener("message", handleMessage);
  }, [ws, username, createPeerConnection]);

  // ── Join the video call ───────────────────────────────────────────────────
  const joinVideo = async () => {
    if (!username || !ws) return;
    setIsJoining(true);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 48000 },
      });

      localStreamRef.current = stream;
      setLocalStream(stream);
      setHasJoinedVideo(true);

      // Announce our presence to the room
      ws.send(JSON.stringify({ type: "video-join", username }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Camera access denied";
      setCameraError(msg);
      console.error("[VideoGrid] getUserMedia failed:", err);
    } finally {
      setIsJoining(false);
    }
  };

  // ── Mic toggle ───────────────────────────────────────────────────────────
  const toggleMic = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setMicEnabled((v) => !v);
  };

  // ── Camera toggle ─────────────────────────────────────────────────────────
  const toggleCamera = () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setCameraEnabled((v) => !v);
  };

  if (!isVisible) return null;

  const remotePeerList = Array.from(remotePeers.values());
  const totalTiles = 1 + remotePeerList.length; // self + remotes

  return (
    <div className="animate-fade-in rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Camera icon SVG */}
          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span className="text-sm font-semibold text-slate-200">Video Conference</span>
          {hasJoinedVideo && (
            <span className="badge badge-emerald">
              <span className="animate-pulse-dot inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Live · {totalTiles} {totalTiles === 1 ? "participant" : "participants"}
            </span>
          )}
        </div>

        {/* Controls (only shown once joined) */}
        {hasJoinedVideo && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMic}
              title={micEnabled ? "Mute microphone" : "Unmute microphone"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                micEnabled
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-400"
              }`}
            >
              {micEnabled ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              )}
              {micEnabled ? "Mic On" : "Muted"}
            </button>

            <button
              onClick={toggleCamera}
              title={cameraEnabled ? "Disable camera" : "Enable camera"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border ${
                cameraEnabled
                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                  : "border-rose-500/40 bg-rose-500/10 text-rose-400"
              }`}
            >
              {cameraEnabled ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
              {cameraEnabled ? "Camera On" : "Camera Off"}
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="p-4">
        {!hasJoinedVideo ? (
          /* Pre-join screen */
          <div className="flex flex-col items-center justify-center py-10 gap-4">
            <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-200">Start Video</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Join with camera & microphone for live collaboration
              </p>
            </div>

            {cameraError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-400 max-w-xs text-center">
                ⚠️ {cameraError}
              </div>
            )}

            <button
              onClick={joinVideo}
              disabled={isJoining || !username}
              className="btn-primary"
            >
              {isJoining ? (
                <>
                  <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Requesting Access...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Enable Camera & Mic
                </>
              )}
            </button>
          </div>
        ) : (
          /* Video tile grid */
          <div className="video-grid">
            {/* Self view tile */}
            <div className="video-tile animate-fade-in" style={{ "--card-accent": "#2563eb" } as React.CSSProperties}>
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted  /* Muted to prevent audio feedback on self-view */
                className={`w-full h-full object-cover ${!cameraEnabled ? "opacity-0" : ""}`}
              />
              {/* Placeholder when camera is off */}
              {!cameraEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
                  <div className={`avatar avatar-lg ${getAvatarColor(username)}`}>
                    {getInitials(username)}
                  </div>
                </div>
              )}
              <div className="video-tile-badge">
                {username} (You)
              </div>
              <div className="video-tile-controls">
                {!micEnabled && (
                  <span className="badge badge-rose text-[10px] py-0.5 px-1.5">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17.3 11c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                    </svg>
                  </span>
                )}
              </div>
            </div>

            {/* Remote peer tiles */}
            {remotePeerList.map((peer) => (
              <RemoteVideoTile key={peer.username} peer={peer} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Remote Video Tile (sub-component to manage its own video ref)
// ──────────────────────────────────────────────────────────────────────────────

function RemoteVideoTile({ peer }: { peer: RemotePeer }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  const hasVideo = peer.stream && peer.stream.getVideoTracks().length > 0;

  return (
    <div className="video-tile animate-fade-in">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
          {peer.stream ? (
            <div className={`avatar avatar-lg ${getAvatarColor(peer.username)}`}>
              {getInitials(peer.username)}
            </div>
          ) : (
            /* Connecting skeleton */
            <div className="flex flex-col items-center gap-2">
              <div className={`avatar avatar-lg ${getAvatarColor(peer.username)}`}>
                {getInitials(peer.username)}
              </div>
              <span className="text-[10px] text-slate-500">Connecting...</span>
            </div>
          )}
        </div>
      )}
      <div className="video-tile-badge">{peer.username}</div>
    </div>
  );
}
