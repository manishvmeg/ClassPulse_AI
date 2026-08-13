"use client";

import { useState } from "react";

export default function Home() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <aside className="w-64 border-r border-slate-800 bg-slate-900 p-5">
          <div className="mb-8">
            <h1 className="text-2xl font-bold">ClassPulse AI</h1>
            <p className="mt-1 text-sm text-slate-400">
              Intelligent classroom analytics
            </p>
          </div>

          <nav className="space-y-2">
            {["Overview", "Live Class", "Questions", "Polls", "Students", "Reports"].map(
              (item) => (
                <button
                  key={item}
                  onClick={() => setActiveTab(item)}
                  className={`w-full rounded-lg px-4 py-3 text-left ${
                    activeTab === item
                      ? "bg-blue-600"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {item}
                </button>
              )
            )}
          </nav>
        </aside>

        <section className="flex-1 p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Teacher Dashboard</p>
              <h2 className="mt-1 text-3xl font-bold">{activeTab}</h2>
            </div>

            <div className="rounded-full bg-green-500/10 px-4 py-2 text-sm text-green-400">
              ● System Online
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Students</p>
              <p className="mt-2 text-3xl font-bold">128</p>
              <p className="mt-2 text-sm text-green-400">+12% engagement</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Questions</p>
              <p className="mt-2 text-3xl font-bold">47</p>
              <p className="mt-2 text-sm text-yellow-400">12 unanswered</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Understanding</p>
              <p className="mt-2 text-3xl font-bold">78%</p>
              <p className="mt-2 text-sm text-blue-400">Based on polls</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <p className="text-sm text-slate-400">Full Attendance</p>
              <p className="mt-2 text-3xl font-bold">84%</p>
              <p className="mt-2 text-sm text-green-400">108 students</p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-xl font-semibold">Top Student Concerns</h3>

              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-2 flex justify-between">
                    <span>Recursion</span>
                    <span className="text-slate-400">32 questions</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-800">
                    <div className="h-3 w-[80%] rounded-full bg-blue-500" />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex justify-between">
                    <span>Dynamic Programming</span>
                    <span className="text-slate-400">24 questions</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-800">
                    <div className="h-3 w-[60%] rounded-full bg-purple-500" />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex justify-between">
                    <span>Time Complexity</span>
                    <span className="text-slate-400">18 questions</span>
                  </div>
                  <div className="h-3 rounded-full bg-slate-800">
                    <div className="h-3 w-[45%] rounded-full bg-green-500" />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
              <h3 className="text-xl font-semibold">AI Recommendation</h3>

              <div className="mt-5 rounded-lg bg-blue-500/10 p-5">
                <p className="font-medium text-blue-300">
                  Next Class Recommendation
                </p>

                <p className="mt-3 leading-7 text-slate-300">
                  Students showed the highest confusion around recursion.
                  Consider spending the first 15–20 minutes of the next class
                  revising recursion with practical examples.
                </p>
              </div>

              <div className="mt-4 rounded-lg bg-yellow-500/10 p-5">
                <p className="font-medium text-yellow-300">
                  Unanswered Questions
                </p>

                <p className="mt-2 text-slate-300">
                  12 questions were not answered during the previous session.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-xl font-semibold">ClassPulse AI</h3>

            <p className="mt-2 text-slate-400">
              Live chat analysis • Anonymous polls • Attendance analytics •
              AI-powered teaching recommendations
            </p>

            <button className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-700">
              Start Live Class
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}