"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL } from "@/lib/config";


// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export interface ScheduleItem {
  id: number;
  room_id: string;
  title: string;
  description: string;
  scheduled_at: string; // ISO
  duration_minutes: number;
  created_by: string;
  role: string;
  created_at: string;
}

interface ScheduleCalendarProps {
  createdBy?: string;
  role?: string;
  defaultRoomId?: string;
  /** Called when a new schedule is created */
  onScheduleCreated?: (schedule: ScheduleItem) => void;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
const DAY_NAMES   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const DURATION_OPTIONS = [
  { value: 30,  label: "30 minutes" },
  { value: 60,  label: "1 hour"     },
  { value: 90,  label: "1.5 hours"  },
  { value: 120, label: "2 hours"    },
  { value: 180, label: "3 hours"    },
];

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

const roleColor = (role: string) => ({
  teacher: "badge-blue",
  admin:   "badge-indigo",
  student: "badge-emerald",
})[role] ?? "badge-slate";

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export default function ScheduleCalendar({
  createdBy = "Teacher",
  role = "teacher",
  defaultRoomId = "room1",
  onScheduleCreated,
}: ScheduleCalendarProps) {
  const today = new Date();

  // ── Calendar State ─────────────────────────────────────────────────────────
  const [viewDate,      setViewDate]      = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay,   setSelectedDay]   = useState<Date | null>(today);
  const [schedules,     setSchedules]     = useState<ScheduleItem[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [viewMode,      setViewMode]      = useState<"month" | "list">("month");

  // ── Form State ─────────────────────────────────────────────────────────────
  const [showForm,      setShowForm]      = useState(false);
  const [formTitle,     setFormTitle]     = useState("");
  const [formDesc,      setFormDesc]      = useState("");
  const [formRoomId,    setFormRoomId]    = useState(defaultRoomId);
  const [formDate,      setFormDate]      = useState(today.toISOString().slice(0, 10));
  const [formTime,      setFormTime]      = useState("09:00");
  const [formDuration,  setFormDuration]  = useState(60);
  const [submitting,    setSubmitting]    = useState(false);

  // ── Fetch all schedules ────────────────────────────────────────────────────
  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`${API_URL}/schedules`);
      const data = await res.json();
      if (data.schedules) setSchedules(data.schedules);
    } catch {
      setError("Failed to load schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  // ── Add external schedule (e.g. from WebSocket broadcast) ─────────────────
  const addExternalSchedule = useCallback((s: ScheduleItem) => {
    setSchedules((prev) => {
      if (prev.find((x) => x.id === s.id)) return prev;
      return [...prev, s].sort((a, b) =>
        new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    });
  }, []);

  const removeExternalSchedule = useCallback((id: number) => {
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // Expose for parent
  (ScheduleCalendar as unknown as Record<string, unknown>).addExternal    = addExternalSchedule;
  (ScheduleCalendar as unknown as Record<string, unknown>).removeExternal = removeExternalSchedule;

  // ── Calendar grid computation ─────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const year  = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);

    const days: (Date | null)[] = [];
    // Leading blank cells
    for (let i = 0; i < first.getDay(); i++) days.push(null);
    // Day cells
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(year, month, d));
    // Trailing blank cells to complete the grid row
    while (days.length % 7 !== 0) days.push(null);

    return days;
  }, [viewDate]);

  const schedulesInMonth = useMemo(() =>
    schedules.filter((s) => {
      const d = new Date(s.scheduled_at);
      return d.getFullYear() === viewDate.getFullYear() && d.getMonth() === viewDate.getMonth();
    }),
  [schedules, viewDate]);

  const schedulesForDay = useCallback((day: Date) =>
    schedules.filter((s) => isSameDay(new Date(s.scheduled_at), day)),
  [schedules]);

  const selectedDaySchedules = useMemo(() =>
    selectedDay ? schedulesForDay(selectedDay) : [],
  [selectedDay, schedulesForDay]);

  const upcomingSchedules = useMemo(() =>
    schedules.filter((s) => new Date(s.scheduled_at) >= new Date())
             .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
  [schedules]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const goToToday = () => { setViewDate(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDay(today); };

  // ── Create Schedule ────────────────────────────────────────────────────────
  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    // Build ISO datetime string
    const localDt    = new Date(`${formDate}T${formTime}:00`);
    const scheduledAt = localDt.toISOString();

    setSubmitting(true);
    setError(null);
    try {
      const res  = await fetch(`${API_URL}/schedules`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          room_id:          formRoomId.trim(),
          title:            formTitle.trim(),
          description:      formDesc.trim(),
          scheduled_at:     scheduledAt,
          duration_minutes: formDuration,
          created_by:       createdBy,
          role,
        }),
      });
      const data = await res.json();
      if (data.schedule) {
        setSchedules((prev) =>
          [...prev, data.schedule].sort((a, b) =>
            new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
          )
        );
        onScheduleCreated?.(data.schedule);
        setShowForm(false);
        setFormTitle("");
        setFormDesc("");
        // Navigate calendar to the scheduled month
        const newDt = new Date(data.schedule.scheduled_at);
        setViewDate(new Date(newDt.getFullYear(), newDt.getMonth(), 1));
        setSelectedDay(newDt);
      } else {
        setError(data.error || "Failed to create schedule.");
      }
    } catch {
      setError("Network error while creating schedule.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Delete Schedule ────────────────────────────────────────────────────────
  const handleDeleteSchedule = async (id: number) => {
    if (!confirm("Delete this scheduled class?")) return;
    try {
      await fetch(`${API_URL}/schedules/${id}`, { method: "DELETE" });
      setSchedules((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError("Failed to delete schedule.");
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in space-y-5">

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-rose-400/60 hover:text-rose-400 transition">✕</button>
        </div>
      )}

      {/* ── Header bar ────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Class Schedule Calendar</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {upcomingSchedules.length} upcoming classes across all rooms
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border border-slate-800 bg-slate-950 rounded-lg overflow-hidden text-xs">
            <button
              onClick={() => setViewMode("month")}
              className={`px-3 py-2 transition ${viewMode === "month" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              Month
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-2 transition ${viewMode === "list" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              List
            </button>
          </div>

          <button onClick={goToToday} className="btn-secondary text-xs py-1.5 px-3">Today</button>

          <button onClick={() => setShowForm(true)} className="btn-primary text-xs py-2 px-4">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Schedule Class
          </button>
        </div>
      </div>

      {/* ── MONTH VIEW ────────────────────────────────────────────────────── */}
      {viewMode === "month" && (
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Calendar Grid */}
          <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-5">
              <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-800 transition text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h4 className="text-base font-bold">
                {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
              </h4>
              <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-800 transition text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day name header */}
            <div className="grid grid-cols-7 mb-1">
              {DAY_NAMES.map((d) => (
                <div key={d} className="text-center text-[11px] font-semibold text-slate-500 py-1.5">
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-px bg-slate-800 rounded-xl overflow-hidden">
              {calendarDays.map((day, i) => {
                if (!day) return <div key={i} className="bg-slate-950 min-h-[72px]" />;

                const daySchedules = schedulesForDay(day);
                const isToday      = isSameDay(day, today);
                const isSelected   = selectedDay ? isSameDay(day, selectedDay) : false;
                const isPast       = day < new Date(today.getFullYear(), today.getMonth(), today.getDate());

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(day)}
                    className={`min-h-[72px] p-1.5 text-left flex flex-col transition ${
                      isSelected
                        ? "bg-blue-600/20"
                        : isPast
                        ? "bg-slate-950/80 hover:bg-slate-900"
                        : "bg-slate-950 hover:bg-slate-900"
                    }`}
                  >
                    <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                      isToday
                        ? "bg-blue-600 text-white"
                        : isSelected
                        ? "text-blue-400"
                        : isPast
                        ? "text-slate-600"
                        : "text-slate-300"
                    }`}>
                      {day.getDate()}
                    </span>

                    {/* Event chips */}
                    <div className="space-y-0.5 flex-1">
                      {daySchedules.slice(0, 2).map((s, j) => (
                        <div
                          key={j}
                          className={`rounded px-1 py-0.5 text-[9px] font-medium truncate ${
                            new Date(s.scheduled_at) < today
                              ? "bg-slate-700 text-slate-400"
                              : "bg-blue-600/30 text-blue-300"
                          }`}
                        >
                          {formatTime(s.scheduled_at)} {s.title}
                        </div>
                      ))}
                      {daySchedules.length > 2 && (
                        <p className="text-[9px] text-slate-500 pl-1">+{daySchedules.length - 2} more</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Month summary */}
            <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-blue-600/30 inline-block" /> Upcoming
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-slate-700 inline-block" /> Past
              </span>
              <span className="ml-auto">{schedulesInMonth.length} in {MONTH_NAMES[viewDate.getMonth()]}</span>
            </div>
          </div>

          {/* Selected Day Detail Panel */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-semibold text-slate-300">
                {selectedDay
                  ? selectedDay.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                  : "Select a day"}
              </h4>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedDaySchedules.length === 0 ? "No classes scheduled" : `${selectedDaySchedules.length} class(es)`}
              </p>
            </div>

            <div className="flex-1 space-y-2">
              {selectedDaySchedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center">
                    <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-xs text-slate-500">No classes on this day</p>
                  <button onClick={() => { setFormDate(selectedDay?.toISOString().slice(0, 10) ?? ""); setShowForm(true); }}
                    className="text-xs text-blue-400 hover:text-blue-300 transition">
                    + Schedule one
                  </button>
                </div>
              ) : (
                selectedDaySchedules.map((s) => (
                  <ScheduleCard key={s.id} s={s} onDelete={handleDeleteSchedule} />
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
      {viewMode === "list" && (
        <div className="space-y-4">
          {/* Upcoming */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Upcoming Classes</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
                <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Loading schedules...
              </div>
            ) : upcomingSchedules.length === 0 ? (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 py-12 text-center">
                <p className="text-sm text-slate-500">No upcoming classes scheduled.</p>
                <button onClick={() => setShowForm(true)} className="mt-3 btn-primary text-xs py-2">
                  Schedule First Class
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingSchedules.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 flex items-start gap-4 animate-fade-in">
                    {/* Date block */}
                    <div className="text-center flex-shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 min-w-[52px]">
                      <p className="text-[10px] font-bold text-blue-400 uppercase">{new Date(s.scheduled_at).toLocaleDateString("en-US", { month: "short" })}</p>
                      <p className="text-xl font-bold text-white leading-none mt-0.5">{new Date(s.scheduled_at).getDate()}</p>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-white truncate">{s.title}</h4>
                        <span className={`badge ${roleColor(s.role)} text-[10px] py-0 px-1.5`}>{s.role}</span>
                        <span className="text-[10px] text-slate-500">Room: {s.room_id.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {formatDateTime(s.scheduled_at)} · {s.duration_minutes} min
                      </p>
                      {s.description && <p className="text-xs text-slate-500 mt-1 truncate">{s.description}</p>}
                      <p className="text-[11px] text-slate-600 mt-1">Scheduled by {s.created_by}</p>
                    </div>

                    <button
                      onClick={() => handleDeleteSchedule(s.id)}
                      className="flex-shrink-0 text-slate-600 hover:text-rose-400 transition p-1"
                      title="Delete schedule"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Past classes */}
          {schedules.filter((s) => new Date(s.scheduled_at) < new Date()).length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-600 mb-3">Past Classes</p>
              <div className="space-y-2">
                {schedules.filter((s) => new Date(s.scheduled_at) < new Date())
                           .sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime())
                           .map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-800/60 bg-slate-900/40 px-4 py-3 flex items-center gap-4 opacity-60">
                    <div className="text-center flex-shrink-0 rounded-lg border border-slate-800 px-2.5 py-1.5 min-w-[48px]">
                      <p className="text-[9px] font-bold text-slate-500 uppercase">{new Date(s.scheduled_at).toLocaleDateString("en-US", { month: "short" })}</p>
                      <p className="text-lg font-bold text-slate-400">{new Date(s.scheduled_at).getDate()}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-400 truncate">{s.title}</p>
                      <p className="text-[11px] text-slate-600">{formatDateTime(s.scheduled_at)} · Room {s.room_id.toUpperCase()}</p>
                    </div>
                    <button onClick={() => handleDeleteSchedule(s.id)} className="text-slate-700 hover:text-rose-400 transition p-1" title="Delete">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Schedule Form Modal ──────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />

          {/* Modal */}
          <div className="relative w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl animate-slide-up p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold">Schedule a Class</h3>
                <p className="text-xs text-slate-500 mt-0.5">Students will be notified automatically</p>
              </div>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 transition">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-400">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateSchedule} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1.5 tracking-wider">Class Title *</label>
                <input type="text" required value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Introduction to Graph Algorithms"
                  className="input-field" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1.5 tracking-wider">Room ID *</label>
                  <input type="text" required value={formRoomId} onChange={(e) => setFormRoomId(e.target.value)}
                    placeholder="room1"
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1.5 tracking-wider">Duration</label>
                  <select value={formDuration} onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="input-field">
                    {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1.5 tracking-wider">Date *</label>
                  <input type="date" required value={formDate} onChange={(e) => setFormDate(e.target.value)}
                    min={today.toISOString().slice(0, 10)}
                    className="input-field" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1.5 tracking-wider">Time *</label>
                  <input type="time" required value={formTime} onChange={(e) => setFormTime(e.target.value)}
                    className="input-field" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-slate-500 mb-1.5 tracking-wider">Description</label>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Topics covered, prerequisites, special instructions..."
                  rows={2}
                  className="input-field resize-none" />
              </div>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center text-sm">
                  Cancel
                </button>
                <button type="submit" disabled={submitting || !formTitle.trim()} className="btn-primary flex-1 justify-center text-sm">
                  {submitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Scheduling...
                    </>
                  ) : "📅 Schedule Class"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Schedule Card (used inside the day detail panel)
// ──────────────────────────────────────────────────────────────────────────────

function ScheduleCard({ s, onDelete }: { s: ScheduleItem; onDelete: (id: number) => void }) {
  const isPast = new Date(s.scheduled_at) < new Date();
  return (
    <div className={`rounded-xl border px-3 py-3 text-sm ${isPast ? "border-slate-800/60 bg-slate-950/40 opacity-60" : "border-blue-500/20 bg-blue-950/20"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm truncate">{s.title}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {formatTime(s.scheduled_at)} · {s.duration_minutes} min · Room {s.room_id.toUpperCase()}
          </p>
          {s.description && <p className="text-[11px] text-slate-500 mt-1 truncate">{s.description}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`badge ${roleColor(s.role)} text-[9px] py-0 px-1`}>{s.role}</span>
            <span className="text-[10px] text-slate-600">by {s.created_by}</span>
          </div>
        </div>
        <button onClick={() => onDelete(s.id)} className="text-slate-600 hover:text-rose-400 transition flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
