# ClassPulse AI — Production Real-Time Classroom Intelligence & WebRTC Platform

[![Next.js 16](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Google Gemini](https://img.shields.io/badge/Google%20Gemini-3.5%20Flash-4285F4?style=for-the-badge&logo=google)](https://deepmind.google/technologies/gemini/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Mesh-333333?style=for-the-badge&logo=webrtc)](https://webrtc.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)

**ClassPulse AI** is a real-time classroom conversation intelligence, peer-to-peer WebRTC video conferencing, and AI copilot platform. It provides instructors with a cockpit of live sentiment metrics, confusion friction radars, automated polling, and natural language copilot assistance, while offering students a mobile-first portal with anonymous doubts, 1-click catch-up summaries, live lecture pacing feedback, and post-session revision study packs.

---

## 🏗️ System Architecture

```mermaid
flowchart TB
    subgraph Clients["Classroom Personas & Clients"]
        Teacher["👨‍🏫 Teacher Command Center (/)\n• Live P2P WebRTC Video Grid\n• Real-Time Pace Radar Telemetry\n• AI Sentiment & Friction Radar\n• 1-Click Auto-Poll Generator\n• Natural Language Copilot\n• Executive Markdown & CSV Export"]
        Students["🎓 Student Portal (/room/[roomId])\n• Responsive Mobile-First View\n• WebRTC Camera & Mic Mesh\n• Live Speech Captions (Web Speech API)\n• Live Lecture Pace Gauge\n• Anonymous 'Whisper to AI' Doubts\n• 1-Click 'Catch Me Up' Summary\n• Post-Session Flashcards & Practice Quiz"]
    end

    subgraph BackendAPI["Python FastAPI Real-Time Engine (Port 8000)"]
        WebSockets["⚡ WebSocket Hub (/ws/{room_id})\n• Sub-20ms Chat & Doubt Broadcasts\n• WebRTC ICE Signaling Relay\n• Real-Time Pace Telemetry Aggregation\n• Instant Poll Percentage Distribution\n• Attendance Join/Leave Lifecycle"]
        GeminiEngine["🧠 Google Gemini 3.5 Flash Engine\n• POST /rooms/{id}/analyze (Sentiment Radar)\n• POST /rooms/{id}/generate-poll (Auto Polls)\n• POST /rooms/{id}/catch-up (3-Bullet Catchup)\n• POST /rooms/{id}/ask (In-Session Copilot)\n• POST /rooms/{id}/report (Session Digest)\n• POST /rooms/{id}/study-pack (Flashcards & Quiz)"]
        DatabaseEngine["🗄️ Database Layer (SQLAlchemy ORM)\n• SQLite Local & Postgres QueuePool\n• Rooms, Messages, Polls, Votes\n• Attendance Records & Student Personas\n• Insights History & CSV Export Data"]
    end

    Teacher <-->|WebRTC Media (STUN/TURN)| Students
    Teacher <-->|WSS Telemetry & API| WebSockets
    Students <-->|WSS Telemetry & API| WebSockets

    WebSockets --> DatabaseEngine
    WebSockets --> GeminiEngine
```

---

## 🎨 Visual Design System & Palette

- **Base Background:** `slate-950` (`#020617`)
- **Elevated Cards / Surfaces:** `slate-900` (`#0f172a`)
- **Borders & Outlines:** `slate-800` (`#1e293b`)
- **Primary Brand Colors:** `blue-600` (`#2563eb`) & `indigo-500`
- **Telemetry Colors:**
  - `emerald-400` — Low friction / High comprehension / Active
  - `amber-400` — Pace warning / Conceptual doubts
  - `rose-500` — High friction / Pace too fast
- **Typography:** Modern sans-serif (Inter / Geist) with high-contrast data visualization widgets.

---

## 🌟 Core Feature Matrix

### 1. 👨‍🏫 Teacher Command Center (`/`)
1. **Header Cockpit:** Live room status badge (`● ROOM1 Online`), active student counter, Auto-AI Pulse toggle (15s automated polling), and manual "⚡ Run Real-Time AI Pulse" button.
2. **Tab 1: Overview:** Real-time sentiment metrics, confusion hotspots, AI recommendation card, quick action items list, and live room pace bar.
3. **Tab 2: Live Class:** Split view with `<VideoGrid />` (camera/mic toggles) alongside synchronized chat and doubts.
4. **Tab 3: Questions & AI Copilot:** Interactive doubt resolution board grouping unanswered questions with an in-session chat copilot interface citing student names and timestamps.
5. **Tab 4: Polls:** Active poll visualization with animated progress bars, custom poll creation form, and a "⚡ Generate Poll from Recent Discussion" button.
6. **Tab 5: Students:** Real-time student engagement table showing message counts, doubt flags, poll response rate, and dynamic badges (`Inquisitive`, `Highly Active`, `Engaged Voter`, `Observer`).
7. **Tab 6: Reports:** Full-session AI digest with one-click `📥 Download .MD` report and `📥 Export Attendance .CSV`.

### 2. 🎓 Student Participation View (`/room/[roomId]`)
1. **WebRTC Video Mesh (`<VideoGrid />`):** Full camera, microphone, and peer stream mesh with STUN servers (`stun:stun.l.google.com:19302`).
2. **Live Speech Captions (`<LiveCaptions />`):** Real-time transcription overlay using the browser Web Speech API.
3. **Lecture Pace Bar (`<PaceGauge />`):** 3-button toggle (*"Too Fast"*, *"Just Right"*, *"Too Slow"*) transmitting instant feedback to the teacher.
4. **Interactive Chat Stream:** Chat log with regular chat mode, **"Doubt Mode"**, and **"Anonymous / Whisper to AI"** toggle.
5. **1-Click "Catch Me Up" Button:** Instant modal summary delivering 3 simple bullet points summarizing recent lecture events.
6. **Active Poll Popup Modal:** Auto-pop-up when the teacher broadcasts a poll, allowing instant 1-tap voting with live percentage distribution.
7. **Post-Lecture Revision Tab (`<FlashcardDeck />`):** Interactive 3D flip card deck with mastery tracking and a 3-question practice quiz with `canvas-confetti` celebration.

---

## 📁 Repository Monorepo Layout

```
ClassPulse_AI/
├── backend/
│   ├── main.py                  # FastAPI server, WebSockets hub, WebRTC signaling, Gemini AI endpoints
│   ├── database.py              # SQLAlchemy ORM models, session engine, QueuePool connection pooling
│   ├── requirements.txt         # Python dependencies (FastAPI, google-genai, SQLAlchemy, etc.)
│   └── .env                     # GEMINI_API_KEY, DATABASE_URL, PORT
├── frontend/
│   ├── app/
│   │   ├── layout.tsx           # Root layout with theme, fonts, and toaster notifications
│   │   ├── page.tsx             # Teacher Command Center (Tabs: Overview, Live Class, Questions, Polls, Students, Reports)
│   │   └── room/
│   │       └── [roomId]/
│   │           └── page.tsx     # Student Participation View (Video, Chat, Doubt Mode, Pace Gauge, Polls, Revision)
│   ├── components/
│   │   ├── VideoGrid.tsx        # WebRTC video mesh with STUN/TURN ICE config, Mute/Video toggles
│   │   ├── PaceGauge.tsx        # Real-time lecture pace monitor (Too Fast / On Track / Too Slow)
│   │   ├── LiveCaptions.tsx     # Web Speech API real-time speech-to-text transcription tile
│   │   └── FlashcardDeck.tsx    # Interactive post-session AI flashcards & MCQ practice quiz
│   ├── package.json             # Next.js 16, React 19, Tailwind CSS, Lucide icons, canvas-confetti
│   └── .env.local               # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL
└── README.md                    # System architecture and run commands
```

---

## 🚀 Quickstart & Execution Guide

### Prerequisites
- **Node.js:** v18+ (Node 20+ recommended)
- **Python:** 3.10+
- **Gemini API Key:** Set `GEMINI_API_KEY` in `backend/.env`

### 1. Start Python Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
*The backend boots at `http://127.0.0.1:8000` with interactive API docs at `http://127.0.0.1:8000/docs`.*

### 2. Start Next.js Frontend
```bash
cd frontend
npm install
npm run dev
```
*Open `http://localhost:3000` in your browser for the Teacher Command Center and `http://localhost:3000/room/room1` for the Student Portal.*

---

## 🧪 Verification Protocol

### Backend Test Suite
Run the automated end-to-end verification script:
```bash
cd backend
python -c "
import asyncio
from main import analyze_room_telemetry, generate_auto_poll, get_student_catch_up, generate_session_digest, generate_room_study_pack, health
from database import save_message

save_message('room1', 'Alice', 'Could you explain backpropagation?', is_doubt=True)
save_message('room1', 'Bob', 'How does Adam learning rate work?')

async def test():
    print('Health:', health())
    print('Analyze:', await analyze_room_telemetry('room1'))
    print('Auto-Poll:', await generate_auto_poll('room1'))
    print('Catch-Up:', await get_student_catch_up('room1'))
    print('Study Pack:', await generate_room_study_pack('room1'))
    print('Report:', await generate_session_digest('room1'))

asyncio.run(test())
"
```

### Frontend Build Validation
```bash
cd frontend
npm run build
```
*Ensures 0 TypeScript or bundling errors across all client components.*

---

## 📄 License
MIT © ClassPulse AI Team
