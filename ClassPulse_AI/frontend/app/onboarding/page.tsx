"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState<"teacher" | "student">("teacher");
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Computer Science & Programming");
  const [classSize, setClassSize] = useState("21-50 students");

  const handleFinish = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem("classpulse_role", role);
      localStorage.setItem("classpulse_user_name", name);
      localStorage.setItem("classpulse_subject", subject);
      localStorage.setItem("classpulse_class_size", classSize);
    }
    router.push("/");
  };

  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">ClassPulse AI</span>
          </div>
          <p className="text-slate-400 text-sm">Welcome! Let&apos;s set up your classroom profile</p>
        </div>

        {/* Progress bar */}
        <div className="flex items-center justify-between gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                s <= step ? "bg-blue-600" : "bg-slate-800"
              }`}
            />
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          {/* Step 1: Role and Name */}
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Tell us about yourself</h2>
                <p className="text-xs text-slate-400">Choose how you plan to use ClassPulse AI</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Your Full Name / Display Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Prof. Sarah Jenkins"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  I am joining as:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRole("teacher")}
                    className={`rounded-xl border p-4 text-left transition ${
                      role === "teacher"
                        ? "border-blue-500 bg-blue-600/10 text-white"
                        : "border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-2xl mb-2 block">👨‍🏫</span>
                    <p className="font-bold text-sm text-white">Instructor / Teacher</p>
                    <p className="text-xs text-slate-500 mt-1">Host classes, run AI insights & polls</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole("student")}
                    className={`rounded-xl border p-4 text-left transition ${
                      role === "student"
                        ? "border-blue-500 bg-blue-600/10 text-white"
                        : "border-slate-800 bg-slate-800/50 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-2xl mb-2 block">🎓</span>
                    <p className="font-bold text-sm text-white">Student / Learner</p>
                    <p className="text-xs text-slate-500 mt-1">Join sessions, participate in polls & chat</p>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <Link href="/" className="text-xs text-slate-500 hover:text-slate-400">
                  Skip setup
                </Link>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Subject and Class Size */}
          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">Classroom Preferences</h2>
                <p className="text-xs text-slate-400">Help the AI tailor real-time insights to your domain</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Primary Subject / Field
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option>Computer Science & Programming</option>
                  <option>Data Science & Machine Learning</option>
                  <option>Mathematics & Statistics</option>
                  <option>Physics & Engineering</option>
                  <option>Business, Finance & Economics</option>
                  <option>Medicine & Health Sciences</option>
                  <option>Humanities & Social Sciences</option>
                  <option>Language & Literature</option>
                  <option>Other / General</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Typical Classroom Size
                </label>
                <select
                  value={classSize}
                  onChange={(e) => setClassSize(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                  <option>1-10 students (Small seminar)</option>
                  <option>11-30 students (Standard class)</option>
                  <option>31-100 students (Large lecture)</option>
                  <option>100+ students (Webinar / Auditorium)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 transition"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirmation */}
          {step === 3 && (
            <div className="text-center space-y-6 py-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-3xl">
                🚀
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white mb-2">You&apos;re All Set!</h2>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                  Your classroom workspace is configured. You have full access to Free tier features including LiveKit SFU video, real-time Gemini AI insights, polls, and calendar.
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-800/40 p-4 text-left text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Plan:</span>
                  <span className="font-semibold text-emerald-400">Free Tier (Active)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Video Engine:</span>
                  <span className="font-semibold text-blue-400">LiveKit SFU (0% Lag)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">AI Intelligence:</span>
                  <span className="font-semibold text-indigo-400">Google Gemini Flash</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-bold text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 transition"
              >
                Launch Instructor Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
