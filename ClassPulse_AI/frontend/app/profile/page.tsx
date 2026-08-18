"use client";
import { UserProfile, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function ProfilePage() {
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
            <span className="text-sm text-slate-400">User Profile & Credentials</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/billing" className="text-xs text-blue-400 hover:text-blue-300 transition">
              ⭐ Billing
            </Link>
            <Link href="/" className="text-xs text-slate-400 hover:text-white transition">
              Dashboard
            </Link>
            <UserButton />
          </div>
        </div>
      </header>


      <div className="max-w-4xl mx-auto px-6 py-10 flex justify-center">
        <UserProfile
          appearance={{
            elements: {
              rootBox: "w-full shadow-2xl",
              card: "bg-slate-900 border border-slate-800 rounded-2xl",
              navbar: "border-r border-slate-800 bg-slate-950",
              navbarButton: "text-slate-400 hover:text-white",
              headerTitle: "text-white text-lg font-bold",
              headerSubtitle: "text-slate-400 text-xs",
              profileSectionTitleText: "text-white text-sm font-semibold",
              userPreviewMainIdentifier: "text-white font-medium",
              userPreviewSecondaryIdentifier: "text-slate-400 text-xs",
              formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold",
              formFieldInput: "bg-slate-800 border-slate-700 text-white text-sm",
              formFieldLabel: "text-slate-300 text-xs",
            },
          }}
          routing="path"
          path="/profile"
        />
      </div>
    </main>
  );
}
