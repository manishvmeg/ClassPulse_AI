"use client";
import React, { useEffect, useState } from "react";


// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

export type ToastType = "info" | "success" | "warning" | "error" | "reminder";

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  body?: string;
  action?: { label: string; href: string };
  duration?: number; // ms, default 6000
}

// ──────────────────────────────────────────────────────────────────────────────
// Single Toast Card
// ──────────────────────────────────────────────────────────────────────────────

const TOAST_STYLES: Record<ToastType, { border: string; bg: string; icon: React.ReactNode; iconColor: string }> = {

  info: {
    border: "border-blue-500/30",
    bg: "bg-blue-950/60",
    iconColor: "text-blue-400",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  success: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-950/60",
    iconColor: "text-emerald-400",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    border: "border-amber-500/30",
    bg: "bg-amber-950/60",
    iconColor: "text-amber-400",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  error: {
    border: "border-rose-500/30",
    bg: "bg-rose-950/60",
    iconColor: "text-rose-400",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  reminder: {
    border: "border-indigo-500/30",
    bg: "bg-indigo-950/60",
    iconColor: "text-indigo-400",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
};

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const { border, bg, icon, iconColor } = TOAST_STYLES[toast.type];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setVisible(true));

    // Auto-dismiss
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, toast.duration ?? 6000);

    return () => clearTimeout(t);
  }, [toast.id, toast.duration, onClose]);

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 min-w-[320px] max-w-[400px] rounded-2xl border ${border} ${bg} backdrop-blur-xl px-4 py-3.5 shadow-2xl transition-all duration-300 ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-6"
      }`}
    >
      <div className={`flex-shrink-0 mt-0.5 ${iconColor}`}>{icon}</div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-snug">{toast.title}</p>
        {toast.body && <p className="text-xs text-slate-400 mt-0.5 leading-snug">{toast.body}</p>}
        {toast.action && (
          <a
            href={toast.action.href}
            className="inline-block mt-2 text-xs font-semibold text-blue-400 hover:text-blue-300 transition"
          >
            {toast.action.label} →
          </a>
        )}
      </div>

      <button
        onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
        className="flex-shrink-0 text-slate-500 hover:text-slate-300 transition mt-0.5"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Toast Container (render in page corner)
// ──────────────────────────────────────────────────────────────────────────────

interface NotificationToastProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export default function NotificationToast({ toasts, onClose }: NotificationToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: useToasts hook
// ──────────────────────────────────────────────────────────────────────────────

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (toast: Omit<Toast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, addToast, removeToast };
}
