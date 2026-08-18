import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white">ClassPulse AI</span>
          </div>
          <p className="text-slate-400 text-sm">Real-Time Classroom Intelligence & Video Copilot</p>
        </div>
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full",
              card: "bg-slate-900 border border-slate-800 shadow-2xl rounded-2xl",
              headerTitle: "text-white text-lg font-bold",
              headerSubtitle: "text-slate-400 text-xs",
              socialButtonsBlockButton: "bg-slate-800 border-slate-700 text-white hover:bg-slate-700 text-xs font-medium",
              formFieldLabel: "text-slate-300 text-xs",
              formFieldInput: "bg-slate-800 border-slate-700 text-white text-sm focus:border-blue-500",
              footerActionLink: "text-blue-400 hover:text-blue-300",
              formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold py-2.5",
              dividerLine: "bg-slate-800",
              dividerText: "text-slate-500 text-xs",
            },
          }}
          routing="path"
          path="/sign-in"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/"
        />
      </div>
    </main>
  );
}
