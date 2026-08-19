"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Radio, Volume2, Sparkles, Copy, Check } from "lucide-react";

interface LiveCaptionsProps {
  /** Room ID */
  roomId?: string;
  /** Local speaker username */
  speakerName?: string;
  /** WebSocket instance to optionally broadcast captions */
  ws?: WebSocket | null;
  /** Whether the user is instructor/allowed to broadcast */
  canBroadcast?: boolean;
}

// Window type extension for Web Speech API
interface IWindow extends Window {
  webkitSpeechRecognition?: any;
  SpeechRecognition?: any;
}

export default function LiveCaptions({
  roomId,
  speakerName = "Instructor",
  ws,
  canBroadcast = false,
}: LiveCaptionsProps) {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscripts, setFinalTranscripts] = useState<
    Array<{ speaker: string; text: string; time: string }>
  >([]);
  const [isSupported, setIsSupported] = useState(true);
  const [copied, setCopied] = useState(false);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const win = window as IWindow;
      const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        setIsSupported(false);
        return;
      }

      const recognition = new SpeechRecognitionClass();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        let currentInterim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcriptPiece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            const finalPiece = transcriptPiece.trim();
            if (finalPiece) {
              const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              setFinalTranscripts((prev) => [...prev.slice(-30), { speaker: speakerName, text: finalPiece, time: now }]);

              // Broadcast over WebSocket if connected
              if (ws && ws.readyState === WebSocket.OPEN && canBroadcast) {
                ws.send(
                  JSON.stringify({
                    type: "captions_broadcast",
                    speaker: speakerName,
                    transcript: finalPiece,
                    is_final: true,
                  })
                );
              }
            }
          } else {
            currentInterim += transcriptPiece;
          }
        }
        setInterimTranscript(currentInterim);
      };

      recognition.onerror = (event: any) => {
        console.warn("[LiveCaptions] Speech recognition error:", event.error);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setIsListening(false);
        }
      };

      recognition.onend = () => {
        // Auto-restart if user still wants it running
        if (isListening && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            // Already started or terminated
          }
        }
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [speakerName, ws, canBroadcast]);

  // Listen to remote caption broadcasts from WebSocket
  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "captions_broadcast" && data.transcript) {
          const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          setFinalTranscripts((prev) => [
            ...prev.slice(-30),
            { speaker: data.speaker || "Instructor", text: data.transcript, time: now },
          ]);
        }
      } catch (e) {}
    };

    ws.addEventListener("message", handleMessage);
    return () => {
      ws.removeEventListener("message", handleMessage);
    };
  }, [ws]);

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [finalTranscripts, interimTranscript]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.warn("Speech recognition already running");
        setIsListening(true);
      }
    }
  };

  const copyTranscript = () => {
    const fullText = finalTranscripts.map((t) => `[${t.time}] ${t.speaker}: ${t.text}`).join("\n");
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isSupported) {
    return (
      <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-center gap-2">
        <MicOff className="w-4 h-4 text-slate-400" />
        <span>Speech Recognition is not supported in this browser (Chrome / Edge recommended).</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col h-64">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl ${isListening ? "bg-rose-500/20 text-rose-400 animate-pulse" : "bg-slate-800 text-slate-400"}`}>
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              Live AI Transcription
              {isListening && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </h4>
            <p className="text-[11px] text-slate-400">Web Speech API speech-to-text</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {finalTranscripts.length > 0 && (
            <button
              onClick={copyTranscript}
              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-colors"
              title="Copy transcript"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={toggleListening}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              isListening
                ? "bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30"
                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Start Captions</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transcript Log */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs scrollbar-thin scrollbar-thumb-slate-800"
      >
        {finalTranscripts.length === 0 && !interimTranscript && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
            <Volume2 className="w-6 h-6 mb-1.5 text-slate-400" />
            <p className="text-xs">
              {isListening
                ? "Listening to audio... speak clearly into your microphone."
                : "Click 'Start Captions' to begin real-time speech transcription."}
            </p>
          </div>
        )}

        {finalTranscripts.map((t, idx) => (
          <div key={idx} className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/60">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span className="font-semibold text-indigo-400">{t.speaker}</span>
              <span className="font-mono">{t.time}</span>
            </div>
            <p className="text-slate-200 leading-relaxed">{t.text}</p>
          </div>
        ))}

        {interimTranscript && (
          <div className="p-2 rounded-lg bg-indigo-950/30 border border-indigo-500/30 animate-pulse">
            <div className="text-[10px] text-indigo-400 font-semibold mb-1">Transcribing...</div>
            <p className="text-indigo-200 italic leading-relaxed">{interimTranscript}</p>
          </div>
        )}
      </div>
    </div>
  );
}
