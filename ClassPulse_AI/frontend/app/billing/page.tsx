"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import UserAvatarMenu from "@/components/UserAvatarMenu";


import { API_URL } from "@/lib/config";


export default function BillingPage() {
  const [plan, setPlan] = useState<string>("Free");
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [stats, setStats] = useState({
    roomsHosted: 12,
    aiAnalysesMonth: 48,
    storageUsedMB: 180,
    storageLimitMB: 1024,
  });

  const handleManageBilling = async () => {
    setLoadingPortal(true);
    try {
      const res = await fetch(`${API_URL}/api/stripe/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_id: "customer_id_default",
          return_url: window.location.href,
        }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      alert("Billing portal is available once Stripe customer is configured.");
    } finally {
      setLoadingPortal(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
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
            <span className="text-sm text-slate-400">Subscription & Billing</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition">
              Dashboard
            </Link>
            <UserAvatarMenu />
          </div>
        </div>
      </header>



      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Subscription & Billing</h1>
          <p className="text-slate-400 text-sm mt-1">Manage your active plan, usage quotas, and invoices</p>
        </div>

        {/* Current Plan Overview Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 mb-8 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Current Plan</span>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                  {plan} Tier Active
                </span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-1">
                {plan === "Free" ? "$0 / month" : plan === "Pro" ? "$19 / month" : "$79 / month"}
              </h2>
              <p className="text-xs text-slate-400">
                {plan === "Free"
                  ? "Standard classroom access with LiveKit SFU video & 40-min group sessions."
                  : "Unlimited classroom duration, AI analysis, recording, and breakout rooms."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/pricing"
                className="rounded-xl bg-blue-600 hover:bg-blue-500 px-5 py-2.5 text-center text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition"
              >
                Upgrade to Pro →
              </Link>
              <button
                onClick={handleManageBilling}
                disabled={loadingPortal}
                className="rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:text-white transition disabled:opacity-50"
              >
                {loadingPortal ? "Loading..." : "Manage in Stripe Portal"}
              </button>
            </div>
          </div>
        </div>

        {/* Usage Quotas */}
        <h2 className="text-base font-bold text-white mb-4">Current Billing Cycle Usage</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-medium">Classrooms Hosted</span>
              <span className="text-xs font-bold text-blue-400">{stats.roomsHosted}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.roomsHosted}</p>
            <p className="text-[11px] text-slate-500 mt-1">Unlimited rooms allowed</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-medium">Gemini AI Pulse Runs</span>
              <span className="text-xs font-bold text-indigo-400">{stats.aiAnalysesMonth}</span>
            </div>
            <p className="text-2xl font-bold text-white">{stats.aiAnalysesMonth}</p>
            <p className="text-[11px] text-slate-500 mt-1">Real-time friction & sentiment telemetry</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-slate-400 font-medium">File Storage</span>
              <span className="text-xs font-bold text-cyan-400">
                {((stats.storageUsedMB / stats.storageLimitMB) * 100).toFixed(0)}%
              </span>
            </div>
            <p className="text-2xl font-bold text-white">
              {stats.storageUsedMB} MB <span className="text-sm text-slate-500 font-normal">/ 1 GB</span>
            </p>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full"
                style={{ width: `${(stats.storageUsedMB / stats.storageLimitMB) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Invoices History */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Payment & Invoice History</h2>
            <span className="text-xs text-slate-500">Auto-billed via Stripe</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-6 py-3">Date</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                <tr>
                  <td className="px-6 py-4 font-mono text-xs text-slate-300">INV-2026-001</td>
                  <td className="px-6 py-4 text-slate-400">Aug 01, 2026</td>
                  <td className="px-6 py-4 font-medium text-white">$0.00</td>
                  <td className="px-6 py-4">
                    <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 text-xs text-emerald-400">
                      Paid
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
