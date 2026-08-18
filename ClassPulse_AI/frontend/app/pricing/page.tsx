"use client";
import { useState } from "react";
import Link from "next/link";

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  badge?: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  description: string;
  color: string;
  buttonText: string;
  buttonHref: string;
  buttonStyle: string;
  features: PlanFeature[];
  highlight: boolean;
}

const PLANS: Plan[] = [
  {
    name: "Free",
    monthlyPrice: 0,
    annualPrice: 0,
    description: "Like Zoom Free — start teaching immediately, no credit card.",
    color: "border-slate-700",
    buttonText: "Start for Free",
    buttonHref: "/sign-up",
    buttonStyle: "border border-slate-600 text-white hover:bg-slate-800",
    highlight: false,
    features: [
      { text: "Unlimited 1-on-1 video sessions", included: true },
      { text: "Group sessions up to 10 students", included: true },
      { text: "40-minute group session limit", included: true },
      { text: "Live chat & real-time polls", included: true },
      { text: "3 AI analyses per day", included: true },
      { text: "1 GB file storage", included: true },
      { text: "Push notifications & reminders", included: true },
      { text: "Whiteboard (view only)", included: true },
      { text: "Unlimited session duration", included: false },
      { text: "Unlimited AI analysis", included: false },
      { text: "Breakout rooms", included: false },
      { text: "Session recording", included: false },
      { text: "Admin panel", included: false },
    ],
  },
  {
    name: "Pro",
    badge: "Most Popular",
    monthlyPrice: 19,
    annualPrice: 15,
    description: "For serious educators who need unlimited power.",
    color: "border-blue-500",
    buttonText: "Start 14-Day Free Trial",
    buttonHref: "/sign-up?plan=pro",
    buttonStyle: "bg-blue-600 hover:bg-blue-500 text-white",
    highlight: true,
    features: [
      { text: "Everything in Free", included: true },
      { text: "Unlimited students per room", included: true },
      { text: "Unlimited session duration", included: true },
      { text: "Unlimited AI analysis", included: true },
      { text: "Collaborative whiteboard", included: true },
      { text: "Breakout rooms (up to 10 groups)", included: true },
      { text: "Session recording (download .webm)", included: true },
      { text: "File sharing (10 GB)", included: true },
      { text: "Raise hand & emoji reactions", included: true },
      { text: "Priority email support", included: true },
      { text: "Admin panel", included: false },
      { text: "Multiple teacher accounts", included: false },
      { text: "White-label branding", included: false },
    ],
  },
  {
    name: "Institute",
    monthlyPrice: 79,
    annualPrice: 65,
    description: "For schools and academies with multiple teachers.",
    color: "border-violet-500",
    buttonText: "Get Institute Plan",
    buttonHref: "/sign-up?plan=institute",
    buttonStyle: "bg-violet-600 hover:bg-violet-500 text-white",
    highlight: false,
    features: [
      { text: "Everything in Pro", included: true },
      { text: "5 teacher accounts", included: true },
      { text: "Admin dashboard & analytics", included: true },
      { text: "Student profiles & history", included: true },
      { text: "50 GB file storage", included: true },
      { text: "Automated email reports", included: true },
      { text: "Custom room branding", included: true },
      { text: "CSV export (attendance & data)", included: true },
      { text: "Priority phone + chat support", included: true },
      { text: "White-label branding", included: false },
      { text: "Unlimited teacher accounts", included: false },
      { text: "Dedicated SLA", included: false },
    ],
  },
  {
    name: "Enterprise",
    monthlyPrice: null,
    annualPrice: null,
    description: "For large institutions, edtech companies, and governments.",
    color: "border-amber-500",
    buttonText: "Contact Sales",
    buttonHref: "mailto:enterprise@classpulse.ai",
    buttonStyle: "border border-amber-500/50 text-amber-400 hover:bg-amber-500/10",
    highlight: false,
    features: [
      { text: "Everything in Institute", included: true },
      { text: "Unlimited teacher accounts", included: true },
      { text: "White-label (your own branding)", included: true },
      { text: "Custom domain (app.yourschool.com)", included: true },
      { text: "Unlimited storage", included: true },
      { text: "REST API access", included: true },
      { text: "SSO / SAML integration", included: true },
      { text: "Dedicated SLA (99.9% uptime)", included: true },
      { text: "Dedicated account manager", included: true },
      { text: "On-premise deployment option", included: true },
      { text: "Custom AI model fine-tuning", included: true },
      { text: "Training & onboarding sessions", included: true },
    ],
  },
];

const FAQS = [
  {
    q: "Is the Free plan really free forever?",
    a: "Yes. Like Zoom's free tier, ClassPulse AI's Free plan has no time limit — you can use it forever. Group sessions are capped at 40 minutes and 10 students, but 1-on-1 sessions are unlimited.",
  },
  {
    q: "Do students need to pay or create accounts?",
    a: "No. Students join via a shareable link and never need an account or credit card. Only teachers need a ClassPulse account.",
  },
  {
    q: "Can I cancel my subscription anytime?",
    a: "Absolutely. Cancel any time — no questions asked, no cancellation fees. You'll keep access until your billing period ends.",
  },
  {
    q: "What happens when I hit the 40-minute group limit on Free?",
    a: "Sessions don't cut off mid-sentence — you'll see a warning at 35 minutes. After 40 minutes, participants stay connected to chat but video pauses until you upgrade or start a new session.",
  },
  {
    q: "Is my class data private and secure?",
    a: "Yes. All video runs through LiveKit's encrypted SFU cloud. Chat data is stored in your own database. We never sell your data or use it for AI training without consent.",
  },
];

function CheckIcon({ included }: { included: boolean }) {
  if (included) {
    return (
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-slate-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

export default function PricingPage() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Nav */}
      <nav className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-bold">ClassPulse AI</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm text-slate-400 hover:text-white transition">Dashboard</Link>
            <Link href="/sign-in" className="text-sm text-slate-400 hover:text-white transition">Sign In</Link>
            <Link href="/sign-up" className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition font-medium">
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="text-center px-6 py-20">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-400 font-medium mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse inline-block" />
          No credit card required to start
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10">
          Start free like Zoom. Scale when you're ready. <br className="hidden md:block" />
          All plans include LiveKit SFU video — zero lag, zero setup.
        </p>

        {/* Billing toggle */}
        <div className="inline-flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-1">
          <button
            onClick={() => setAnnual(false)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${!annual ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Monthly
          </button>
          <button
            onClick={() => setAnnual(true)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${annual ? "bg-blue-600 text-white" : "text-slate-400 hover:text-white"}`}
          >
            Annual
            <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-bold">
              2 months free
            </span>
          </button>
        </div>
      </section>

      {/* Plans grid */}
      <section className="max-w-7xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {PLANS.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice;
            return (
              <div
                key={plan.name}
                className={`relative rounded-2xl border bg-slate-900 p-6 flex flex-col ${plan.highlight ? "border-blue-500 shadow-[0_0_40px_rgba(37,99,235,0.15)]" : plan.color}`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-blue-600 text-white text-[11px] font-bold px-3 py-1 rounded-full">
                      {plan.badge}
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div className="mb-6">
                  <h2 className="text-lg font-bold text-white mb-1">{plan.name}</h2>
                  <p className="text-xs text-slate-500 min-h-[2.5rem]">{plan.description}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {price === null ? (
                    <div className="text-3xl font-bold text-white">Custom</div>
                  ) : price === 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-white">$0</span>
                      <span className="text-sm text-slate-500">/month</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-white">${price}</span>
                        <span className="text-sm text-slate-500">/month</span>
                      </div>
                      {annual && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="line-through">${plan.monthlyPrice}</span>
                          {" "}→ billed ${price * 12}/yr
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <Link
                  href={plan.buttonHref}
                  className={`block text-center py-2.5 px-4 rounded-xl font-semibold text-sm transition mb-6 ${plan.buttonStyle}`}
                >
                  {plan.buttonText}
                </Link>

                {/* Features */}
                <ul className="space-y-2.5 flex-1">
                  {plan.features.map((f) => (
                    <li key={f.text} className="flex items-start gap-2.5">
                      <CheckIcon included={f.included} />
                      <span className={`text-xs leading-relaxed ${f.included ? "text-slate-300" : "text-slate-600"}`}>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* Compare banner */}
        <div className="mt-10 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-900/50 p-8 text-center">
          <h3 className="text-xl font-bold text-white mb-2">Not sure which plan?</h3>
          <p className="text-slate-400 text-sm mb-5">
            Start free and upgrade anytime. Most teachers start on Free and move to Pro within 2 weeks.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/sign-up" className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition">
              Start Free — No Credit Card
            </Link>
            <a href="mailto:hello@classpulse.ai" className="border border-slate-700 text-slate-300 hover:text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition">
              Talk to Sales
            </a>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20">
          <h2 className="text-2xl font-bold text-white text-center mb-10">Frequently Asked Questions</h2>
          <div className="max-w-3xl mx-auto space-y-3">
            {FAQS.map((faq, i) => (
              <div key={i} className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-white">{faq.q}</span>
                  <svg
                    className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ml-4 ${openFaq === i ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-4">
                    <p className="text-sm text-slate-400 leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/50 py-8 px-6 text-center">
        <p className="text-xs text-slate-600">
          © 2025 ClassPulse AI · Built with LiveKit · Powered by Gemini AI ·{" "}
          <a href="mailto:hello@classpulse.ai" className="text-slate-500 hover:text-white transition">
            hello@classpulse.ai
          </a>
        </p>
      </footer>
    </main>
  );
}
