import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ClassPulse AI — Real-Time Classroom Intelligence",
  description:
    "ClassPulse AI is a real-time classroom conversation intelligence and WebRTC video conferencing platform powered by Google Gemini.",
  keywords: ["classroom AI", "real-time education", "student engagement", "Gemini AI", "WebRTC", "EdTech"],
  authors: [{ name: "ClassPulse AI" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <head>
        {/* Service Worker registration — runs in the browser only */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js', { scope: '/' })
                    .then(function(reg) { console.log('[SW] Registered:', reg.scope); })
                    .catch(function(err) { console.warn('[SW] Failed:', err); });
                });
              }
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-slate-950">{children}</body>
    </html>
  );
}
