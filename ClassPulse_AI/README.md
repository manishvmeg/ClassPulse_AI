# ClassPulse AI — Production Real-Time Classroom Intelligence & Video Conferencing SaaS

ClassPulse AI is a real-time classroom conversation intelligence and WebRTC video conferencing platform designed as a modern Zoom / Google Meet alternative with built-in AI copilot capabilities, live comprehension polling, dual-canvas collaborative whiteboards, breakout sub-rooms, file sharing, calendar reminders, push notifications, and Stripe subscription billing.

---

## 🌟 Key Platform Features

### 1. 🎥 High-Capacity Video Conferencing (LiveKit SFU)
- **Zero-Lag Media Engine:** Low-latency Selective Forwarding Unit (SFU) architecture hosted on LiveKit Cloud.
- **Gallery & Speaker Layouts:** Instant toggle between Zoom-style grid and Meet-style active speaker views.
- **Screen Sharing & In-Session Recording:** Native 1-click screen broadcasting with browser-based `.webm` lecture recording download.
- **Host Moderation Panel:** Dedicated teacher controls to Mute Participant, Mute All, Lock Room, and Remove / Kick attendees.
- **Device Pre-Join Waiting Room:** Audio/video device preview and auto-permission request before entry.

### 2. 🧠 Google Gemini AI Intelligence Engine
- **Real-Time Friction & Sentiment Radar:** Ingests live chat discussions and flags student confusion, sentiment breakdown, and trending concepts.
- **Auto AI Pulse (15-Second Polling):** Autonomous background telemetry polling when student questions are detected.
- **In-Lecture AI Copilot:** Teachers can query natural language questions (e.g. *"Who struggled with recursion?"*) citing exact student names and timestamps.
- **End-of-Lecture Executive Digest:** Synthesizes messages, polls, and participation into structured lecture notes with one-click `.MD` export.

### 3. 🛠️ Interactive Classroom Copilot Tools
- **🖊️ Collaborative Whiteboard:** Real-time synchronized drawing canvas with dual-sync tools, colors, eraser, and marker widths.
- **🏠 Breakout Sub-Rooms:** Automated and manual student group splitting with live countdown timer and global return broadcast.
- **📁 Classroom File Sharing:** Drag-and-drop lecture slides, code repositories, assignments, and documents (up to 50MB).
- **✋ Raise Hand & Live Reactions:** Audience queue for questions with real-time emoji reactions (👍, ❓, 🎉, 😕, ⏩, ⏸️).
- **📊 Real-Time Comprehension Polls:** Instant multi-choice poll creation with live percentage update bars.

### 4. 📅 Calendar & Web Push Notifications
- **Schedule Management:** Full monthly calendar grid with upcoming class reminders.
- **Automated 5-Minute Reminders:** Web Push and WebSocket notifications sent 5 minutes before scheduled lectures commence.
- **OS-Level Alerts:** Service worker alerts fired even when the browser tab is in the background.

### 5. 💳 SaaS Tiers & Stripe Billing
- **Free Tier (Like Zoom Free):** Unlimited 1:1 sessions, 10 students per group room, 40-minute limit, 3 AI analyses/day, 1GB storage.
- **Pro Tier ($19/mo):** Unlimited room size, unlimited duration, full Gemini AI, recordings, breakout rooms, and 10GB storage.
- **Institute Tier ($79/mo):** 5 teacher seats, central admin panel, student profiles, and 50GB storage.
- **Enterprise Tier (Custom):** Custom domain, white-label, dedicated SLA, and REST API access.

---

## 🏗️ Monorepo Architecture

```
ClassPulse_AI/
├── backend/
│   ├── main.py                  # FastAPI server, WebSockets router, LiveKit token & host controls, AI analysis
│   ├── database.py              # SQLAlchemy models, PostgreSQL / SQLite connection pooling, CRUD queries
│   ├── stripe_service.py        # Stripe checkout, portal, webhook handling & plan limits
│   ├── requirements.txt         # Production Python dependencies
│   ├── Procfile                 # Deployment process definition
│   ├── railway.toml             # Railway container deployment configuration
│   └── .env                     # Server environment variables (Gemini, LiveKit, Stripe, DB)
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           # Global root layout with theme, fonts, and ClerkProvider
│   │   ├── page.tsx             # Teacher Command Center (Overview, Live Class, Whiteboard, Breakouts, Files, Polls, Reports)
│   │   ├── pricing/page.tsx     # 4-tier pricing page with monthly/annual billing & FAQ
│   │   ├── billing/page.tsx     # Stripe subscription & usage quotas dashboard
│   │   ├── admin/page.tsx       # Institutional admin console with multi-room analytics
│   │   ├── onboarding/page.tsx  # 3-step setup wizard for instructors and students
│   │   ├── profile/page.tsx     # Clerk user profile & credential management
│   │   ├── manifest.ts          # PWA Web App Manifest for mobile installation
│   │   └── room/[roomId]/
│   │       └── page.tsx         # Student Mobile-Friendly View (LiveKit Video, Chat, Whiteboard, Files, Raise Hand)
│   ├── components/
│   │   ├── LiveKitVideoRoom.tsx # LiveKit SFU Video, Gallery/Speaker, Host Controls, MediaRecorder
│   │   ├── Whiteboard.tsx       # Interactive dual-sync drawing canvas
│   │   ├── BreakoutRooms.tsx    # Breakout groups launcher & countdown timer
│   │   ├── FileSharing.tsx      # Classroom file dropzone and list
│   │   ├── RaiseHand.tsx        # Raise hand queue and floating reactions
│   │   ├── ScheduleCalendar.tsx # Monthly calendar & event scheduler
│   │   └── NotificationToast.tsx# Animated notification toast system
│   ├── middleware.ts            # Clerk route protection middleware
│   ├── package.json             # Next.js 16, React 19, Tailwind CSS, Clerk, LiveKit, Stripe
│   ├── vercel.json              # Vercel deployment configuration
│   └── .env.local               # Frontend environment variables
└── README.md                    # Architecture & deployment handbook
```

---

## 🚀 Quickstart Local Execution

### 1. Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # On Windows
# source venv/bin/activate     # On Linux / macOS
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open **`http://localhost:3000`** in your browser for the Teacher Command Center or **`http://localhost:3000/room/demo`** for the Student Portal.

---

## 🌐 Production Deployment Guide

### Deploy Frontend (Vercel)
1. Push repository to GitHub.
2. Import repository in [Vercel](https://vercel.com).
3. Set the Root Directory to `frontend`.
4. Add environment variables:
   - `NEXT_PUBLIC_API_URL`: `https://your-backend.up.railway.app`
   - `NEXT_PUBLIC_WS_URL`: `wss://your-backend.up.railway.app`
   - `NEXT_PUBLIC_LIVEKIT_URL`: `wss://classpulse-ai-g0f5s2im.livekit.cloud`
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: `pk_live_...`
   - `CLERK_SECRET_KEY`: `sk_live_...`

### Deploy Backend (Railway / Render)
1. In [Railway](https://railway.app), create a New Project from GitHub repo.
2. Set the Root Directory to `backend`.
3. Add environment variables:
   - `GEMINI_API_KEY`: Your Google Gemini API Key
   - `LIVEKIT_URL`: `wss://classpulse-ai-g0f5s2im.livekit.cloud`
   - `LIVEKIT_API_KEY`: `APIG8qzW9Pb63xf`
   - `LIVEKIT_API_SECRET`: `HyDWCtfvl4FXGs0glRZTLF4EfC9BusLSwUw9heqTe5oA`
   - `DATABASE_URL`: Your PostgreSQL / Supabase connection string
   - `STRIPE_SECRET_KEY`: `sk_live_...`

---

## 📄 License
MIT License. Built for real-time education intelligence.
