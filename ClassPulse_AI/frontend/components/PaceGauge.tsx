"use client";

import { useState } from "react";
import { Gauge, FastForward, CheckCircle2, Rewind, Activity } from "lucide-react";

export interface PaceTelemetry {
  too_fast: number;
  good: number;
  too_slow: number;
  total_votes: number;
  too_fast_pct: number;
  good_pct: number;
  too_slow_pct: number;
  dominant_pace: "too_fast" | "good" | "too_slow";
}

interface PaceGaugeProps {
  /** Real-time telemetry data */
  telemetry: PaceTelemetry;
  /** Whether the user can vote (e.g. in student mode) */
  interactive?: boolean;
  /** Currently selected vote by the user */
  userVote?: "too_fast" | "good" | "too_slow" | null;
  /** Callback triggered when student votes */
  onVote?: (pace: "too_fast" | "good" | "too_slow") => void;
  /** Compact widget view or full dashboard view */
  compact?: boolean;
}

export default function PaceGauge({
  telemetry,
  interactive = false,
  userVote = null,
  onVote,
  compact = false,
}: PaceGaugeProps) {
  const [hoverPace, setHoverPace] = useState<string | null>(null);

  const total = telemetry.total_votes || 0;
  const dominant = telemetry.dominant_pace || "good";

  const getDominantLabel = () => {
    if (dominant === "too_fast") return { label: "Lecture Pacing: Too Fast", color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/30" };
    if (dominant === "too_slow") return { label: "Lecture Pacing: Too Slow", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" };
    return { label: "Lecture Pacing: Optimal", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" };
  };

  const status = getDominantLabel();

  if (compact) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-slate-900/90 border border-slate-800 rounded-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
            <span className="text-xs font-semibold text-slate-300">Live Pace Radar</span>
          </div>
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${status.bg} ${status.color}`}>
            {dominant === "too_fast" ? "Fast" : dominant === "too_slow" ? "Slow" : "Optimal"}
          </span>
        </div>

        {/* Multi-segmented distribution progress bar */}
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${telemetry.too_fast_pct}%` }}
            title={`Too Fast: ${telemetry.too_fast_pct}%`}
          />
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${telemetry.good_pct}%` }}
            title={`Just Right: ${telemetry.good_pct}%`}
          />
          <div
            className="bg-amber-500 transition-all duration-500"
            style={{ width: `${telemetry.too_slow_pct}%` }}
            title={`Too Slow: ${telemetry.too_slow_pct}%`}
          />
        </div>

        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span className="text-rose-400">Fast: {telemetry.too_fast_pct}%</span>
          <span className="text-emerald-400">Good: {telemetry.good_pct}%</span>
          <span className="text-amber-400">Slow: {telemetry.too_slow_pct}%</span>
        </div>

        {interactive && onVote && (
          <div className="grid grid-cols-3 gap-1.5 mt-1 pt-2 border-t border-slate-800/80">
            <button
              onClick={() => onVote("too_fast")}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                userVote === "too_fast"
                  ? "bg-rose-500/20 border border-rose-500/50 text-rose-300 shadow-sm shadow-rose-500/20"
                  : "bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
              }`}
            >
              <FastForward className="w-3 h-3 text-rose-400" />
              <span>Fast</span>
            </button>
            <button
              onClick={() => onVote("good")}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                userVote === "good"
                  ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-500/20"
                  : "bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
              }`}
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>Good</span>
            </button>
            <button
              onClick={() => onVote("too_slow")}
              className={`py-1.5 px-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                userVote === "too_slow"
                  ? "bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-sm shadow-amber-500/20"
                  : "bg-slate-800/60 hover:bg-slate-800 text-slate-300 border border-slate-700/50"
              }`}
            >
              <Rewind className="w-3 h-3 text-amber-400" />
              <span>Slow</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Gauge className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              Classroom Pace Radar
              <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Live
              </span>
            </h3>
            <p className="text-xs text-slate-400">Real-time aggregate feedback on lecture velocity</p>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${status.bg} ${status.color} flex items-center gap-1.5`}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          {status.label}
        </div>
      </div>

      {/* Progress Bar Distribution */}
      <div className="space-y-2 mb-5">
        <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex p-0.5 border border-slate-800">
          <div
            className="bg-gradient-to-r from-rose-600 to-rose-500 rounded-l-full transition-all duration-700 relative group"
            style={{ width: `${telemetry.too_fast_pct}%` }}
          />
          <div
            className="bg-gradient-to-r from-emerald-600 to-emerald-500 transition-all duration-700 relative group"
            style={{ width: `${telemetry.good_pct}%` }}
          />
          <div
            className="bg-gradient-to-r from-amber-600 to-amber-500 rounded-r-full transition-all duration-700 relative group"
            style={{ width: `${telemetry.too_slow_pct}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-rose-500/5 border border-rose-500/10">
            <div className="text-[11px] text-rose-400/80 font-medium">Too Fast</div>
            <div className="text-lg font-bold text-rose-400">{telemetry.too_fast_pct}%</div>
            <div className="text-[10px] text-slate-400">{telemetry.too_fast} votes</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
            <div className="text-[11px] text-emerald-400/80 font-medium">Just Right</div>
            <div className="text-lg font-bold text-emerald-400">{telemetry.good_pct}%</div>
            <div className="text-[10px] text-slate-400">{telemetry.good} votes</div>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-500/5 border border-amber-500/10">
            <div className="text-[11px] text-amber-400/80 font-medium">Too Slow</div>
            <div className="text-lg font-bold text-amber-400">{telemetry.too_slow_pct}%</div>
            <div className="text-[10px] text-slate-400">{telemetry.too_slow} votes</div>
          </div>
        </div>
      </div>

      {interactive && onVote && (
        <div className="pt-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 font-medium mb-3">Submit your pacing feedback to the instructor:</p>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => onVote("too_fast")}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                userVote === "too_fast"
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30 ring-2 ring-rose-400"
                  : "bg-slate-800/80 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 border border-slate-700/60"
              }`}
            >
              <FastForward className="w-4 h-4" />
              <span>Too Fast</span>
            </button>
            <button
              onClick={() => onVote("good")}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                userVote === "good"
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400"
                  : "bg-slate-800/80 hover:bg-emerald-500/20 text-slate-200 hover:text-emerald-300 border border-slate-700/60"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Just Right</span>
            </button>
            <button
              onClick={() => onVote("too_slow")}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all transform active:scale-95 ${
                userVote === "too_slow"
                  ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30 ring-2 ring-amber-400"
                  : "bg-slate-800/80 hover:bg-amber-500/20 text-slate-200 hover:text-amber-300 border border-slate-700/60"
              }`}
            >
              <Rewind className="w-4 h-4" />
              <span>Too Slow</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
