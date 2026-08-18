"use client";
import { useState, useEffect } from "react";
import { UserButton } from "@clerk/nextjs";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

interface RoomStats {
  room_id: string;
  message_count: number;
  student_count: number;
}

interface AdminData {
  rooms: RoomStats[];
  total_rooms: number;
  total_messages: number;
  total_students: number;
  total_polls: number;
  total_schedules: number;
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData>({
    rooms: [],
    total_rooms: 0,
    total_messages: 0,
    total_students: 0,
    total_polls: 0,
    total_schedules: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/admin/stats`)
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setData(d);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="font-bold text-white">ClassPulse AI</span>
            </Link>
            <span className="text-slate-600">/</span>
            <span className="text-sm text-slate-400">Institutional Admin Command Center</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/billing" className="text-xs text-blue-400 hover:text-blue-300 transition">
              ⭐ Manage Subscriptions
            </Link>
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition">
              Dashboard
            </Link>
            <UserButton />
          </div>
        </div>
      </header>


      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Platform Administration</h1>
            <p className="text-slate-400 text-sm mt-1">Multi-tenant telemetry, classroom health, and student engagement overview</p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 transition inline-flex items-center gap-1.5 self-start"
          >
            + Create New Room
          </Link>
        </div>

        {/* Global Statistics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <span className="text-2xl mb-1 block">🏫</span>
            <p className="text-2xl font-bold text-blue-400">{data.total_rooms}</p>
            <p className="text-xs text-slate-500 mt-1">Active / Created Classrooms</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <span className="text-2xl mb-1 block">👥</span>
            <p className="text-2xl font-bold text-emerald-400">{data.total_students}</p>
            <p className="text-xs text-slate-500 mt-1">Unique Student Participants</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <span className="text-2xl mb-1 block">💬</span>
            <p className="text-2xl font-bold text-violet-400">{data.total_messages}</p>
            <p className="text-xs text-slate-500 mt-1">Chat Messages & Doubts Ingested</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <span className="text-2xl mb-1 block">📊</span>
            <p className="text-2xl font-bold text-amber-400">{data.total_polls}</p>
            <p className="text-xs text-slate-500 mt-1">Comprehension Polls Conducted</p>
          </div>
        </div>

        {/* Classrooms Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">All Managed Classrooms</h2>
            <span className="text-xs text-slate-500">{data.rooms.length} registered room(s)</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : data.rooms.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <p className="text-4xl mb-3">🏫</p>
              <p className="text-sm font-medium text-slate-400">No classroom data found</p>
              <p className="text-xs text-slate-600 mt-1">Classrooms will appear here as teachers and students interact</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <th className="px-6 py-3">Room Identifier</th>
                    <th className="px-6 py-3">Students Connected</th>
                    <th className="px-6 py-3">Total Messages</th>
                    <th className="px-6 py-3">Live Video Status</th>
                    <th className="px-6 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-sm">
                  {data.rooms.map((room) => (
                    <tr key={room.room_id} className="hover:bg-slate-800/40 transition">
                      <td className="px-6 py-4">
                        <code className="text-xs font-mono font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-1 rounded-lg">
                          {room.room_id.toUpperCase()}
                        </code>
                      </td>
                      <td className="px-6 py-4 text-slate-300">{room.student_count} students</td>
                      <td className="px-6 py-4 text-slate-300">{room.message_count} messages</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                          LiveKit SFU Ready
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3 text-xs">
                          <Link href={`/?room=${room.room_id}`} className="text-blue-400 hover:text-blue-300 font-medium">
                            Host Command Center
                          </Link>
                          <span className="text-slate-700">·</span>
                          <Link href={`/room/${room.room_id}`} className="text-slate-400 hover:text-white" target="_blank">
                            Student Portal ↗
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
