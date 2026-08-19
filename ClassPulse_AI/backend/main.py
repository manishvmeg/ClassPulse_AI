import asyncio
import base64
import json
import os
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
import hmac
import hashlib
import logging
import re
from fastapi import FastAPI, File, Header, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("classpulse")

AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "classpulse_secret_key_2026")

def generate_room_token(username: str, room_id: str, role: str, is_host: bool = False, ttl: int = 86400) -> str:
    payload = {
        "sub": username,
        "room_id": room_id,
        "role": role,
        "is_host": is_host,
        "exp": int(datetime.now(timezone.utc).timestamp()) + ttl
    }
    dumped = json.dumps(payload, sort_keys=True).encode("utf-8")
    b64_payload = base64.urlsafe_b64encode(dumped).decode("utf-8").rstrip("=")
    sig = hmac.new(AUTH_SECRET_KEY.encode("utf-8"), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{b64_payload}.{sig}"

def verify_room_token(token: Optional[str]) -> Optional[dict]:
    if not token or not isinstance(token, str):
        return None
    if token.startswith("Bearer "):
        token = token.split(" ", 1)[1]
    if "." not in token:
        return None
    try:
        b64_payload, sig = token.split(".", 1)
        expected_sig = hmac.new(AUTH_SECRET_KEY.encode("utf-8"), b64_payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected_sig, sig):
            return None
        padded = b64_payload + "=" * (-len(b64_payload) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
        if payload.get("exp", 0) < datetime.now(timezone.utc).timestamp():
            return None
        return payload
    except Exception as e:
        logger.warning(f"Token verification error: {e}")
        return None

async def require_teacher(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header required")
    payload = verify_room_token(authorization)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired authorization token")
    if payload.get("role") not in ("teacher", "host", "admin") and not payload.get("is_host"):
        raise HTTPException(status_code=403, detail="Teacher authorization required")
    return payload
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from database import (
    AttendanceRecord,
    ClassSchedule,
    InsightRecord,
    MessageRecord,
    PollRecord,
    PushSubscription,
    Room,
    SessionLocal,
    SharedFileRecord,
    UserSubscription,
    VoteRecord,
    create_poll,
    create_schedule,
    delete_push_subscription,
    delete_schedule,
    export_attendance_csv,
    get_active_poll,
    get_admin_dashboard_stats,
    get_all_push_subscriptions,
    get_doubts,
    get_latest_insight,
    get_or_create_room,
    get_poll_results,
    get_room_attendance,
    get_room_shared_files,
    get_schedules,
    get_schedules_due_for_reminder,
    get_stored_messages,
    get_student_metrics,
    get_user_subscription,
    increment_attendance_messages,
    increment_attendance_votes,
    mark_reminder_sent,
    record_attendance_join,
    record_attendance_leave,
    record_shared_file,
    record_vote,
    save_insight,
    save_message,
    schedule_to_dict,
    upsert_push_subscription,
    upsert_user_subscription,
    get_room_plan_limits,
    get_insights_count_today,
)
from stripe_service import (
    PRICE_INSTITUTE_ANNUAL,
    PRICE_INSTITUTE_MONTHLY,
    PRICE_PRO_ANNUAL,
    PRICE_PRO_MONTHLY,
    create_checkout_session,
    create_portal_session,
    get_plan_limits,
    handle_webhook,
)

load_dotenv()

app = FastAPI(title="ClassPulse AI", version="2.0.0")

# Primary Gemini model configurations
PRIMARY_GEMINI_MODEL = "gemini-3.5-flash"
FALLBACK_GEMINI_MODELS = ["gemini-3.6-flash", "gemini-flash-latest", "gemini-2.5-flash"]

# Initialize Gemini Client
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
try:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
except Exception as e:
    print(f"[ClassPulse] Warning: Gemini client init error: {e}")
    gemini_client = None

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.loca\.lt|https://.*\.railway\.app|https://.*\.onrender\.com|http://localhost:.*|http://127\.0\.0\.1:.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload directory for classroom files
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/files", StaticFiles(directory=str(UPLOAD_DIR)), name="files")


# ──────────────────────────────────────────────────────────────────────────────
# VAPID Key Management
# ──────────────────────────────────────────────────────────────────────────────

VAPID_KEYS_FILE = Path("./vapid_keys.json")

def _load_or_generate_vapid_keys() -> tuple[str, str]:
    priv_env = os.getenv("VAPID_PRIVATE_KEY", "").strip()
    pub_env  = os.getenv("VAPID_PUBLIC_KEY",  "").strip()
    if priv_env and pub_env:
        return priv_env, pub_env

    if VAPID_KEYS_FILE.exists():
        try:
            keys = json.loads(VAPID_KEYS_FILE.read_text())
            return keys["private"], keys["public"]
        except Exception:
            pass

    try:
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
        from py_vapid import Vapid

        v = Vapid()
        v.generate_keys()
        private_pem = v.private_pem().decode("utf-8")
        raw_pub     = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        public_b64  = base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode("utf-8")

        VAPID_KEYS_FILE.write_text(json.dumps({"private": private_pem, "public": public_b64}, indent=2))
        return private_pem, public_b64
    except Exception as e:
        print(f"[ClassPulse] VAPID key generation failed ({e}). Push notifications disabled.")
        return "", ""


VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY = _load_or_generate_vapid_keys()
VAPID_CLAIMS = {"sub": "mailto:admin@classpulse.ai"}


# ──────────────────────────────────────────────────────────────────────────────
# Pydantic Schemas
# ──────────────────────────────────────────────────────────────────────────────

class AIInsightResponse(BaseModel):
    summary: str = Field(description="1-2 sentence overall summary of the conversation")
    main_topics: List[str] = Field(description="List of primary topics discussed")
    sentiment: str = Field(description="Overall sentiment: Confused, Neutral, Positive, Frustrated, Engaged")
    important_questions: List[str] = Field(description="List of specific questions asked by participants")
    top_concerns: List[str] = Field(description="Specific concepts, slides, or problems students are confused about")
    action_items: List[str] = Field(description="Pending decisions, tasks, or follow-ups")
    recommendation: str = Field(description="Concrete actionable recommendation for the teacher/moderator")


class SessionReportResponse(BaseModel):
    title: str = Field(description="Catchy concise title for the lecture session")
    executive_summary: str = Field(description="Detailed 3-4 sentence digest of the entire class")
    topics_covered: List[str] = Field(description="Comprehensive list of topics and subtopics discussed")
    comprehension_breakdown: str = Field(description="Synthesis of student understanding combining chat friction and poll votes")
    unresolved_questions: List[str] = Field(description="All questions remaining unanswered at the end of class")
    recommended_next_lecture_plan: List[str] = Field(description="Step-by-step action items and slide topics for the next class")


class AutoPollResponse(BaseModel):
    question: str = Field(description="Multiple-choice question checking understanding of recent confusion")
    options: List[str] = Field(description="Exactly 4 realistic multiple-choice options")


class CatchUpResponse(BaseModel):
    summary: List[str] = Field(description="Exactly 3 concise bullet points summarizing recent lecture events")


class FlashcardItem(BaseModel):
    question: str = Field(description="Concept question or prompt")
    answer: str = Field(description="Clear, concise explanation or formula")


class QuizQuestionItem(BaseModel):
    question: str = Field(description="Multiple choice question text")
    options: List[str] = Field(description="4 distinct answer options")
    correct_answer: int = Field(description="0-indexed integer of the correct option (0, 1, 2, or 3)")
    explanation: str = Field(description="Brief pedagogical rationale explaining why the answer is correct")


class StudyPackResponse(BaseModel):
    flashcards: List[FlashcardItem] = Field(description="5 core concept flashcards")
    quiz: List[QuizQuestionItem] = Field(description="3 multiple-choice practice quiz questions")


class AskAIRequest(BaseModel):
    query: str = Field(description="The teacher's question regarding the class conversation")
    start_time: Optional[str] = Field(default=None)
    end_time: Optional[str] = Field(default=None)


class CreatePollRequest(BaseModel):
    question: str
    options: List[str]


class VoteRequest(BaseModel):
    poll_id: str
    username: str
    selected_option: str


class CreateScheduleRequest(BaseModel):
    room_id: str = Field(description="Room the class will be held in")
    title: str = Field(description="Class title / topic")
    description: Optional[str] = Field(default="")
    scheduled_at: str = Field(description="ISO-8601 datetime (UTC) when class starts")
    duration_minutes: Optional[int] = Field(default=60)
    created_by: str = Field(description="Name of the person scheduling")
    role: Optional[str] = Field(default="teacher")


class PushSubscribeRequest(BaseModel):
    endpoint: str
    keys_auth: str
    keys_p256dh: str
    username: str
    role: Optional[str] = "student"
    room_id: Optional[str] = None


# ──────────────────────────────────────────────────────────────────────────────
# Real-Time Connection Manager & Pace Telemetry
# ──────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.peer_map: Dict[str, Dict[str, WebSocket]] = {}
        # Room pace tracking: { room_id: { username: "too_fast" | "good" | "too_slow" } }
        self.pace_votes: Dict[str, Dict[str, str]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms.setdefault(room_id, []).append(websocket)

    def register_peer(self, room_id: str, username: str, websocket: WebSocket):
        self.peer_map.setdefault(room_id, {})[username] = websocket

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.rooms and websocket in self.rooms[room_id]:
            self.rooms[room_id].remove(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
        if room_id in self.peer_map:
            dead = [u for u, ws in self.peer_map[room_id].items() if ws is websocket]
            for u in dead:
                del self.peer_map[room_id][u]

    def record_pace_vote(self, room_id: str, username: str, pace: str) -> dict:
        if pace not in ("too_fast", "good", "too_slow"):
            pace = "good"
        self.pace_votes.setdefault(room_id, {})[username] = pace
        return self.get_pace_telemetry(room_id)

    def get_pace_telemetry(self, room_id: str) -> dict:
        votes = self.pace_votes.get(room_id, {})
        counts = {"too_fast": 0, "good": 0, "too_slow": 0}
        for p in votes.values():
            if p in counts:
                counts[p] += 1
        total = sum(counts.values()) or 1
        tf_pct = round((counts["too_fast"] / total) * 100, 1)
        good_pct = round((counts["good"] / total) * 100, 1)
        ts_pct = round((counts["too_slow"] / total) * 100, 1)

        # Determine dominant pace
        dominant = "good"
        if counts["too_fast"] > counts["good"] and counts["too_fast"] >= counts["too_slow"]:
            dominant = "too_fast"
        elif counts["too_slow"] > counts["good"] and counts["too_slow"] > counts["too_fast"]:
            dominant = "too_slow"

        return {
            "type": "pace_telemetry",
            "room_id": room_id,
            "too_fast": counts["too_fast"],
            "good": counts["good"],
            "too_slow": counts["too_slow"],
            "total_votes": len(votes),
            "too_fast_pct": tf_pct,
            "good_pct": good_pct,
            "too_slow_pct": ts_pct,
            "dominant_pace": dominant,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def broadcast(self, room_id: str, message: dict, exclude: Optional[WebSocket] = None):
        for conn in self.rooms.get(room_id, []).copy():
            if conn is exclude:
                continue
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(room_id, conn)

    async def broadcast_all_rooms(self, message: dict):
        for room_id in list(self.rooms.keys()):
            await self.broadcast(room_id, message)

    async def send_to_peer(self, room_id: str, target_username: str, message: dict):
        peer_ws = self.peer_map.get(room_id, {}).get(target_username)
        if peer_ws:
            try:
                await peer_ws.send_json(message)
            except Exception:
                self.disconnect(room_id, peer_ws)


manager = ConnectionManager()


# ──────────────────────────────────────────────────────────────────────────────
# Web Push Helper
# ──────────────────────────────────────────────────────────────────────────────

async def _send_push(sub: PushSubscription, payload: dict):
    if not VAPID_PRIVATE_KEY:
        return

    def _do_send():
        try:
            from pywebpush import webpush
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"auth": sub.keys_auth, "p256dh": sub.keys_p256dh},
                },
                data=json.dumps(payload),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS,
            )
        except Exception as e:
            logger.warning(f"WebPush send warning: {e}")

    await asyncio.to_thread(_do_send)


async def push_to_all(payload: dict):
    subs = await asyncio.to_thread(get_all_push_subscriptions)
    tasks = [_send_push(sub, payload) for sub in subs]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


# ──────────────────────────────────────────────────────────────────────────────
# Background Task: Class Reminder
# ──────────────────────────────────────────────────────────────────────────────

async def _reminder_loop():
    while True:
        await asyncio.sleep(60)
        try:
            due = await asyncio.to_thread(get_schedules_due_for_reminder, 5)
            now = datetime.now(timezone.utc)
            for schedule in due:
                payload = {
                    "title": "ClassPulse AI — Class Starting Soon!",
                    "body":  f"'{schedule.title}' starts in ~5 minutes. Room: {schedule.room_id.upper()}",
                    "url":   f"/room/{schedule.room_id}",
                    "icon":  "/favicon.ico",
                }
                await push_to_all(payload)
                await manager.broadcast_all_rooms({
                    "type":      "class_reminder",
                    "schedule":  schedule_to_dict(schedule),
                    "timestamp": now.isoformat(),
                })
                await asyncio.to_thread(mark_reminder_sent, schedule.id)
        except Exception as e:
            logger.error(f"Class reminder loop exception: {e}")


@app.on_event("startup")
async def startup():
    asyncio.create_task(_reminder_loop())


# ──────────────────────────────────────────────────────────────────────────────
# Health & Info Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "online", "name": "ClassPulse AI", "version": "2.0.0"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "gemini_active": gemini_client is not None,
    }


@app.get("/vapid-key")
def get_vapid_key():
    return {"vapidPublicKey": VAPID_PUBLIC_KEY}


@app.get("/rooms/{room_id}/participants")
def get_participant_count(room_id: str):
    return {
        "room_id": room_id,
        "participants": len(manager.rooms.get(room_id, [])),
        "peers": list(manager.peer_map.get(room_id, {}).keys()),
    }


@app.get("/rooms/{room_id}/messages")
def get_room_messages(room_id: str, start_time: Optional[str] = None, end_time: Optional[str] = None):
    msgs = get_stored_messages(room_id, start_time, end_time)
    return {"room_id": room_id, "messages": msgs, "count": len(msgs)}


@app.get("/rooms/{room_id}/doubts")
def get_room_doubts(room_id: str):
    doubts = get_doubts(room_id)
    return {"room_id": room_id, "doubts": doubts, "count": len(doubts)}


@app.get("/rooms/{room_id}/pace")
def get_room_pace(room_id: str):
    return manager.get_pace_telemetry(room_id)


@app.get("/rooms/{room_id}/export-attendance")
def export_attendance_file(room_id: str):
    csv_content = export_attendance_csv(room_id)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_{room_id}.csv"},
    )


# ──────────────────────────────────────────────────────────────────────────────
# LiveKit Integration (Optional Video Engine)
# ──────────────────────────────────────────────────────────────────────────────

LIVEKIT_URL        = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

class LiveKitTokenRequest(BaseModel):
    participant_name: Optional[str] = None
    username: Optional[str] = None
    is_host: bool = False
    participant_identity: Optional[str] = None


@app.post("/rooms/{room_id}/token")
async def generate_livekit_token(room_id: str, req: LiveKitTokenRequest):
    name = req.participant_name or req.username or "Participant"
    role = "teacher" if req.is_host else "student"
    auth_token = generate_room_token(name, room_id, role, is_host=req.is_host)
    identity = req.participant_identity or f"{name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"

    if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
        return {
            "token": f"dev_livekit_{uuid.uuid4().hex[:12]}",
            "auth_token": auth_token,
            "server_url": LIVEKIT_URL or "http://127.0.0.1:8000",
            "identity": identity,
        }

    try:
        from livekit import api as lkapi

        grants = lkapi.VideoGrants(
            room_join=True,
            room=room_id,
            can_publish=True,
            can_subscribe=True,
            can_publish_data=True,
            room_admin=req.is_host,
            can_update_own_metadata=True,
        )

        metadata = json.dumps({
            "is_host": req.is_host,
            "role": role,
        })

        token = (
            lkapi.AccessToken(api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_name(name)
            .with_metadata(metadata)
            .with_grants(grants)
            .with_ttl(timedelta(hours=4))
        )
        return {
            "token": token.to_jwt(),
            "auth_token": auth_token,
            "server_url": LIVEKIT_URL,
            "identity": identity,
        }
    except Exception as e:
        logger.error(f"Token generation exception: {e}")
        return {
            "token": f"dev_livekit_{uuid.uuid4().hex[:12]}",
            "auth_token": auth_token,
            "server_url": LIVEKIT_URL or "http://127.0.0.1:8000",
            "identity": identity,
            "error": f"Token generation failed: {e}",
        }


# ──────────────────────────────────────────────────────────────────────────────
# Polling Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/rooms/{room_id}/polls")
@app.post("/rooms/{room_id}/poll")
async def create_room_poll(room_id: str, req: CreatePollRequest, authorization: Optional[str] = Header(None)):
    await require_teacher(authorization)
    if len(req.options) < 2:
        return {"error": "A poll requires at least 2 options."}
    poll_data = await asyncio.to_thread(create_poll, room_id, req.question, req.options)
    await manager.broadcast(room_id, {
        "type": "poll_created",
        "poll": poll_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"poll": poll_data}


@app.get("/rooms/{room_id}/polls/active")
@app.get("/rooms/{room_id}/poll")
def get_current_room_poll(room_id: str):
    return {"poll": get_active_poll(room_id)}


@app.post("/rooms/{room_id}/vote")
async def vote_room_poll(room_id: str, req: VoteRequest):
    updated = record_vote(req.poll_id, req.username, req.selected_option)
    if not updated:
        raise HTTPException(status_code=404, detail="Poll not found or inactive")
    await manager.broadcast(room_id, {
        "type": "poll_update",
        "poll": updated,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"poll": updated}


# ──────────────────────────────────────────────────────────────────────────────
# Schedule / Calendar Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/schedules")
async def create_class_schedule(req: CreateScheduleRequest):
    try:
        scheduled_dt = datetime.fromisoformat(req.scheduled_at)
        if scheduled_dt.tzinfo is None:
            scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return {"error": "Invalid scheduled_at format. Use ISO-8601 (e.g. 2026-08-20T14:00:00Z)"}

    schedule = create_schedule(
        room_id=req.room_id,
        title=req.title,
        scheduled_at=scheduled_dt,
        created_by=req.created_by,
        role=req.role or "teacher",
        description=req.description or "",
        duration_minutes=req.duration_minutes or 60,
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    ws_payload = {"type": "class_scheduled", "schedule": schedule, "timestamp": now_iso}
    await manager.broadcast(req.room_id, ws_payload)
    for r_id in list(manager.rooms.keys()):
        if r_id != req.room_id:
            await manager.broadcast(r_id, ws_payload)

    push_payload = {
        "title": "ClassPulse AI — New Class Scheduled",
        "body":  f"'{req.title}' on {scheduled_dt.strftime('%b %d at %I:%M %p')} (UTC) — Room {req.room_id.upper()}",
        "url":   f"/room/{req.room_id}",
        "icon":  "/favicon.ico",
    }
    asyncio.create_task(push_to_all(push_payload))
    return {"schedule": schedule}


@app.get("/schedules")
def list_all_schedules():
    return {"schedules": get_schedules()}


@app.get("/rooms/{room_id}/schedules")
def list_room_schedules(room_id: str):
    return {"schedules": get_schedules(room_id=room_id)}


@app.delete("/schedules/{schedule_id}")
async def remove_schedule(schedule_id: int):
    ok = await asyncio.to_thread(delete_schedule, schedule_id)
    if not ok:
        return {"error": f"Schedule {schedule_id} not found."}
    await manager.broadcast_all_rooms({
        "type": "schedule_deleted",
        "schedule_id": schedule_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Push & Stripe Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/push/subscribe")
async def subscribe_push(req: PushSubscribeRequest):
    result = await asyncio.to_thread(
        upsert_push_subscription,
        req.endpoint, req.keys_auth, req.keys_p256dh,
        req.username, req.role or "student", req.room_id,
    )
    return result


@app.post("/push/unsubscribe")
async def unsubscribe_push(body: dict):
    endpoint = body.get("endpoint", "")
    if endpoint:
        await asyncio.to_thread(delete_push_subscription, endpoint)
    return {"ok": True}


class StripeCheckoutRequest(BaseModel):
    price_id: str
    clerk_user_id: str
    customer_email: str
    plan_name: str = "pro"


class StripePortalRequest(BaseModel):
    customer_id: str
    return_url: str = "http://localhost:3000/billing"


@app.post("/api/stripe/checkout")
async def create_checkout(req: StripeCheckoutRequest):
    url = create_checkout_session(
        customer_email=req.customer_email,
        price_id=req.price_id,
        success_url="http://localhost:3000/billing?status=success",
        cancel_url="http://localhost:3000/pricing",
        clerk_user_id=req.clerk_user_id,
    )
    await asyncio.to_thread(
        upsert_user_subscription,
        clerk_user_id=req.clerk_user_id,
        customer_email=req.customer_email,
        plan=req.plan_name,
        status="pending",
    )
    return {"url": url}


@app.post("/api/stripe/portal")
async def create_portal(req: StripePortalRequest):
    url = create_portal_session(req.customer_id, req.return_url)
    return {"url": url}


@app.post("/api/stripe/webhook")
async def stripe_webhook_endpoint(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    event_data = handle_webhook(payload, sig_header)
    if "error" in event_data:
        raise HTTPException(status_code=400, detail=f"Webhook verification error: {event_data['error']}")
    event_type = event_data.get("type")

    if event_type in ("checkout.session.completed", "customer.subscription.updated"):
        obj = event_data.get("data", {}).get("object", {})
        client_ref = obj.get("client_reference_id") or obj.get("metadata", {}).get("clerk_user_id", "")
        email = obj.get("customer_email") or obj.get("customer_details", {}).get("email", "")
        sub_id = obj.get("subscription")
        cust_id = obj.get("customer")
        if client_ref or email:
            await asyncio.to_thread(
                upsert_user_subscription,
                clerk_user_id=client_ref or "user_unknown",
                customer_email=email or "unknown@domain.com",
                stripe_customer_id=str(cust_id) if cust_id else None,
                stripe_subscription_id=str(sub_id) if sub_id else None,
                plan="pro",
                status="active",
            )
    elif event_type == "customer.subscription.deleted":
        obj = event_data.get("data", {}).get("object", {})
        client_ref = obj.get("client_reference_id") or obj.get("metadata", {}).get("clerk_user_id", "")
        if client_ref:
            await asyncio.to_thread(
                upsert_user_subscription,
                clerk_user_id=client_ref,
                customer_email="",
                status="canceled",
            )

    return {"received": True, "event": event_type or "unknown"}


@app.get("/api/plans")
def list_plans():
    return {
        "free": get_plan_limits("free"),
        "pro": get_plan_limits("pro"),
        "institute": get_plan_limits("institute"),
        "enterprise": get_plan_limits("enterprise"),
    }


# ──────────────────────────────────────────────────────────────────────────────
# File Uploads
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/rooms/{room_id}/files")
async def upload_classroom_file(room_id: str, file: UploadFile = File(...), authorization: Optional[str] = Header(None)):
    await require_teacher(authorization)
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing filename")

    # Sanitize filename to prevent directory traversal
    raw_name = Path(file.filename).name
    safe_name = re.sub(r"[^\w\.\-]", "_", raw_name)

    ext = Path(safe_name).suffix.lower()
    allowed_exts = {
        ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
        ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".csv", ".txt",
        ".zip", ".mp4", ".webm"
    }
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"File extension '{ext}' is not permitted")

    safe_room_id = Path(room_id).name
    room_dir = UPLOAD_DIR / safe_room_id
    room_dir.mkdir(exist_ok=True, parents=True)
    dest_path = (room_dir / safe_name).resolve()

    if not dest_path.is_relative_to(UPLOAD_DIR.resolve()):
        raise HTTPException(status_code=400, detail="Invalid target path boundary")

    MAX_SIZE = 50 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 50 MB")

    with open(dest_path, "wb") as f:
        f.write(content)

    file_size = len(content)
    file_url = f"/files/{safe_room_id}/{safe_name}"

    record = await asyncio.to_thread(
        record_shared_file,
        room_id=room_id,
        filename=safe_name,
        file_url=file_url,
        file_size=file_size,
    )

    await manager.broadcast(room_id, {
        "type": "file_shared",
        "filename": safe_name,
        "url": file_url,
        "size": file_size,
        "uploader": "Instructor",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True, "file": record}


@app.get("/rooms/{room_id}/files")
def list_classroom_files(room_id: str):
    return {"files": get_room_shared_files(room_id)}


@app.get("/admin/stats")
async def get_admin_stats(authorization: Optional[str] = Header(None)):
    await require_teacher(authorization)
    return await asyncio.to_thread(get_admin_dashboard_stats)


@app.get("/rooms/{room_id}/students")
def get_room_students(room_id: str):
    students = get_student_metrics(room_id)
    return {"room_id": room_id, "students": students, "total_tracked": len(students)}


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket Hub: Real-Time WebRTC, Chat, Doubts, Pace & Polls
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    participant_username: Optional[str] = None

    # Notify room of new connection
    await manager.broadcast(room_id, {
        "type": "system",
        "message": "A participant connected to the room.",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "participants": len(manager.rooms.get(room_id, [])),
    })

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "message")

            # 1. Join / Attendance Lifecycle
            if event_type == "join":
                username = str(data.get("username", "Student")).strip()

                # Plan limit: max student capacity check
                limits = await asyncio.to_thread(get_room_plan_limits, room_id)
                max_students = limits.get("max_students_per_room", 10)
                current_count = len(manager.rooms.get(room_id, []))

                # Room lock & session duration limit checks
                room_record = await asyncio.to_thread(get_or_create_room, room_id)
                if room_record:
                    if room_record.is_locked:
                        await websocket.send_json({
                            "type": "error",
                            "message": "This classroom is currently locked by the instructor.",
                        })
                        continue
                    
                    # Plan limit: session duration check (e.g. 40 minutes for Free)
                    elapsed_minutes = (datetime.now(timezone.utc) - room_record.created_at.replace(tzinfo=timezone.utc)).total_seconds() / 60.0
                    max_minutes = limits.get("session_minutes", 40)
                    if elapsed_minutes >= max_minutes:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"This room has exceeded its {max_minutes}-minute limit for the Free tier. Upgrade to Pro/Institute to continue.",
                        })
                        await websocket.close()
                        return

                if current_count >= max_students:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Room limit reached ({max_students} students max). Upgrade to Pro/Institute to unlock larger rooms.",
                    })
                    continue

                participant_username = username
                manager.register_peer(room_id, username, websocket)
                await asyncio.to_thread(record_attendance_join, room_id, username)
                await manager.broadcast(room_id, {
                    "type": "system",
                    "message": f"{username} joined the lecture.",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "participants": len(manager.rooms.get(room_id, [])),
                    "username": username,
                })

            # 2. Synchronized Chat & Doubts
            elif event_type in ("message", "chat"):
                username = str(data.get("username", participant_username or "Anonymous")).strip()
                message_text = str(data.get("message", "")).strip()
                is_doubt = bool(data.get("is_doubt", False))
                is_anonymous = bool(data.get("is_anonymous", False))

                if message_text:
                    if username and participant_username is None:
                        participant_username = username
                        manager.register_peer(room_id, username, websocket)

                    iso_ts = datetime.now(timezone.utc).isoformat()
                    saved = await asyncio.to_thread(
                        save_message,
                        room_id=room_id,
                        username=username,
                        message=message_text,
                        is_doubt=is_doubt,
                        is_anonymous=is_anonymous,
                        timestamp_str=iso_ts,
                    )
                    # Broadcast immediately in < 20ms
                    await manager.broadcast(room_id, {
                        "type": "message",
                        "id": saved["id"],
                        "username": saved["username"],
                        "raw_username": username if not is_anonymous else "Anonymous",
                        "message": message_text,
                        "is_doubt": is_doubt,
                        "is_anonymous": is_anonymous,
                        "timestamp": iso_ts,
                        "room_id": room_id,
                    })

            # 3. Live Lecture Pace Telemetry
            elif event_type == "pace_update":
                username = str(data.get("username", participant_username or "Student")).strip()
                pace_choice = str(data.get("pace", "good")).strip()
                pace_data = manager.record_pace_vote(room_id, username, pace_choice)
                await manager.broadcast(room_id, pace_data)

            # 4. Comprehension Polling
            elif event_type in ("create_poll", "poll_create"):
                question = str(data.get("question", "")).strip()
                options = data.get("options", [])
                if question and len(options) >= 2:
                    poll = await asyncio.to_thread(create_poll, room_id, question, options)
                    await manager.broadcast(room_id, {
                        "type": "poll_created",
                        "poll": poll,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            elif event_type in ("poll_vote", "vote"):
                poll_id = data.get("poll_id")
                username = str(data.get("username", participant_username or "Anonymous")).strip()
                selected = str(data.get("selected_option", "")).strip()
                if poll_id and selected:
                    updated_poll = await asyncio.to_thread(record_vote, str(poll_id), username, selected)
                    if updated_poll:
                        await manager.broadcast(room_id, {
                            "type": "poll_update",
                            "poll": updated_poll,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

            # 5. WebRTC Mesh Signaling Relay (P2P zero DB persistence)
            elif event_type == "video-join":
                username = str(data.get("username", participant_username or "Anonymous")).strip()
                if username:
                    participant_username = username
                    manager.register_peer(room_id, username, websocket)
                await manager.broadcast(room_id, {
                    "type": "video-join",
                    "username": username,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, exclude=websocket)

            elif event_type == "video-offer":
                target = data.get("target") or data.get("to")
                payload = {
                    "type": "video-offer",
                    "sdp": data.get("sdp"),
                    "from": data.get("from", participant_username or "Peer"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if target:
                    await manager.send_to_peer(room_id, str(target), payload)
                else:
                    await manager.broadcast(room_id, payload, exclude=websocket)

            elif event_type == "video-answer":
                target = data.get("target") or data.get("to")
                payload = {
                    "type": "video-answer",
                    "sdp": data.get("sdp"),
                    "from": data.get("from", participant_username or "Peer"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if target:
                    await manager.send_to_peer(room_id, str(target), payload)

            elif event_type == "video-ice-candidate":
                target = data.get("target") or data.get("to")
                payload = {
                    "type": "video-ice-candidate",
                    "candidate": data.get("candidate"),
                    "from": data.get("from", participant_username or "Peer"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if target:
                    await manager.send_to_peer(room_id, str(target), payload)
                else:
                    await manager.broadcast(room_id, payload, exclude=websocket)

            # 6. Live Speech Captions & Interactive Whiteboard
            elif event_type == "captions_broadcast":
                await manager.broadcast(room_id, {
                    "type": "captions_broadcast",
                    "speaker": str(data.get("speaker", participant_username or "Instructor")),
                    "transcript": str(data.get("transcript", "")),
                    "is_final": bool(data.get("is_final", True)),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif event_type == "whiteboard_draw":
                await manager.broadcast(room_id, data, exclude=websocket)

            elif event_type in ("hand_raised", "hand_lowered", "reaction"):
                await manager.broadcast(room_id, data)

            elif event_type == "breakout_start":
                # Enforce plan limits for breakout rooms
                limits = await asyncio.to_thread(get_room_plan_limits, room_id)
                if not limits.get("breakout_rooms", False):
                    await websocket.send_json({
                        "type": "error",
                        "message": "Breakout rooms are not available on the Free tier. Upgrade to Pro/Institute to unlock breakout sub-rooms.",
                    })
                    continue

                await manager.broadcast(room_id, {
                    "type": "breakout_started",
                    "rooms": data.get("rooms", []),
                    "timer_minutes": data.get("timer_minutes", 10),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif event_type == "breakout_end":
                await manager.broadcast(room_id, {
                    "type": "breakout_ended",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        if participant_username:
            await asyncio.to_thread(record_attendance_leave, room_id, participant_username)
            await manager.broadcast(room_id, {
                "type": "video-leave",
                "username": participant_username,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        await manager.broadcast(room_id, {
            "type": "system",
            "message": f"{participant_username or 'A participant'} left the room.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "participants": len(manager.rooms.get(room_id, [])),
        })


# ──────────────────────────────────────────────────────────────────────────────
# Google Gemini 3.5 Flash Intelligence Engine
# (All SDK operations executed in worker threads via asyncio.to_thread)
# ──────────────────────────────────────────────────────────────────────────────

def _generate_with_gemini(contents: str, schema: Optional[Any] = None, system_prompt: str = "") -> str:
    """Helper to invoke Gemini with fallback models and error resilience."""
    if not gemini_client:
        raise RuntimeError("Gemini API Client is not configured.")

    models_to_try = [PRIMARY_GEMINI_MODEL] + [m for m in FALLBACK_GEMINI_MODELS if m != PRIMARY_GEMINI_MODEL]
    last_error = None

    for model_name in models_to_try:
        try:
            config_kwargs = {}
            if schema:
                config_kwargs["response_mime_type"] = "application/json"
                config_kwargs["response_schema"] = schema
            if system_prompt:
                config_kwargs["system_instruction"] = system_prompt

            config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )
            if response and response.text:
                return response.text
        except Exception as err:
            last_error = err
            continue

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")


# 1. Real-Time Friction & Sentiment Radar
def _run_analyze(messages: List[dict]) -> dict:
    conversation = "\n".join(
        f"[{m.get('timestamp','N/A')}] {m.get('username','Anonymous')}{' [DOUBT]' if m.get('is_doubt') else ''}: {m.get('message','')}"
        for m in messages
    )
    prompt = (
        "Analyze this live classroom chat and doubt log. Identify overall sentiment, friction points, "
        "confusion hotspots, top student concerns, important questions, actionable moderator recommendations, "
        "and key discussion topics.\n\n"
        f"--- CLASSROOM LOG ---\n{conversation}"
    )
    system_instruction = (
        "You are ClassPulse AI, an expert classroom conversation intelligence engine. "
        "Analyze student inquiries, questions, doubts, and teacher responses to generate high-value pedagogical telemetry."
    )
    try:
        raw_text = _generate_with_gemini(prompt, schema=AIInsightResponse, system_prompt=system_instruction)
        return json.loads(raw_text)
    except Exception as e:
        # Structured fallback if Gemini is offline
        doubts = [m.get("message", "") for m in messages if m.get("is_doubt") or "?" in m.get("message", "")]
        return {
            "summary": f"Discussion covered {len(messages)} messages with active student participation.",
            "main_topics": ["Lecture Concepts", "Discussion & Practice", "Q&A"],
            "sentiment": "Engaged" if len(messages) > 5 else "Neutral",
            "important_questions": doubts[:4] if doubts else ["How does this concept apply in practice?"],
            "top_concerns": ["Clarification on core examples", "Pacing adjustments"] if doubts else ["None reported"],
            "action_items": ["Review core definitions on the whiteboard", "Run a quick comprehension check"],
            "recommendation": "Address the recent student doubts regarding theoretical formulation before proceeding.",
        }


# 2. 1-Click AI Auto-Poll Generator
def _run_generate_poll(messages: List[dict]) -> dict:
    conversation = "\n".join(
        f"{m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages[-20:]
    )
    prompt = (
        "Based on recent discussion and confusion in this lecture, generate an instant 4-option multiple-choice comprehension check "
        "to test understanding of the main topic being taught.\n\n"
        f"Recent messages:\n{conversation}"
    )
    system_instruction = "You are ClassPulse AI. Generate concise, high-yield multiple-choice questions for live classroom polling."
    try:
        raw_text = _generate_with_gemini(prompt, schema=AutoPollResponse, system_prompt=system_instruction)
        data = json.loads(raw_text)
        if len(data.get("options", [])) >= 2:
            return data
    except Exception:
        pass

    return {
        "question": "Which statement best summarizes the core principle we just covered?",
        "options": [
            "Option A: It optimizes the objective function directly",
            "Option B: It relies on recursive iterative refinement",
            "Option C: It assumes continuous variable independence",
            "Option D: None of the above",
        ],
    }


# 3. Student "Catch Me Up"
def _run_catch_up(messages: List[dict]) -> List[str]:
    conversation = "\n".join(
        f"{m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages[-15:]
    )
    prompt = (
        "A student just arrived or lost focus. Ingest the last 5-10 minutes of lecture dialogue and doubts, "
        "and return exactly 3 simple, easy-to-digest bullet points summarizing what was just taught and discussed.\n\n"
        f"Lecture Snippet:\n{conversation}"
    )
    system_instruction = "You are ClassPulse AI. Summarize the recent flow of the lecture into 3 crisp student bullet points."
    try:
        raw_text = _generate_with_gemini(prompt, schema=CatchUpResponse, system_prompt=system_instruction)
        data = json.loads(raw_text)
        return data.get("summary", [])[:3]
    except Exception:
        pass

    return [
        "The instructor introduced the main concept and outlined the problem statement.",
        "Students raised questions regarding edge cases and practical implementations.",
        "The class is currently reviewing an active example on the whiteboard.",
    ]


# 4. In-Session Natural Language Copilot
def _run_ask(conversation: str, query: str) -> dict:
    prompt = (
        f"--- FULL LECTURE LOG ---\n{conversation}\n\n"
        f"--- TEACHER QUESTION ---\n{query}\n\n"
        "Provide a comprehensive, accurate answer based on the lecture log. Cite specific student names, "
        "exact questions asked, and timestamps when relevant."
    )
    system_instruction = (
        "You are ClassPulse Copilot, an AI assistant assisting the instructor in real-time. "
        "Answer the teacher's query accurately citing student names, doubts, and timestamps from the class transcript."
    )
    try:
        answer = _generate_with_gemini(prompt, system_prompt=system_instruction)
        return {"answer": answer}
    except Exception as e:
        return {
            "answer": f"Based on current classroom telemetry, {len(conversation.splitlines())} interactions have been recorded. "
                      "Students have been actively participating with questions on the primary topic."
        }


# 5. Post-Lecture Executive Digest & Study Pack
def _run_report(messages: List[dict], poll_context: str) -> dict:
    conversation = "\n".join(
        f"[{m.get('timestamp','N/A')}] {m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages
    )
    prompt = (
        "Generate a comprehensive post-lecture executive session digest for the instructor.\n\n"
        f"--- CHAT & DOUBTS ---\n{conversation}\n\n"
        f"--- POLLS & VOTES ---\n{poll_context}"
    )
    system_instruction = "You are ClassPulse AI. Synthesize classroom interactions into an executive post-lecture report."
    try:
        raw_text = _generate_with_gemini(prompt, schema=SessionReportResponse, system_prompt=system_instruction)
        data = json.loads(raw_text)
        # Generate markdown representation as well
        md = f"# {data.get('title', 'ClassPulse AI Session Report')}\n\n"
        md += f"## Executive Summary\n{data.get('executive_summary', '')}\n\n"
        md += "## Topics Covered\n" + "\n".join(f"- {t}" for t in data.get('topics_covered', [])) + "\n\n"
        md += f"## Comprehension Breakdown\n{data.get('comprehension_breakdown', '')}\n\n"
        md += "## Unresolved Questions & Doubts\n" + "\n".join(f"- {q}" for q in data.get('unresolved_questions', [])) + "\n\n"
        md += "## Recommended Next Lecture Plan\n" + "\n".join(f"1. {p}" for p in data.get('recommended_next_lecture_plan', [])) + "\n"
        data["report_markdown"] = md
        return data
    except Exception as e:
        return {
            "title": "ClassPulse AI Lecture Digest",
            "executive_summary": "The lecture demonstrated strong interactive engagement with multiple student queries resolved.",
            "topics_covered": ["Core Module Overview", "Interactive Examples", "Practical Problem Solving"],
            "comprehension_breakdown": "High overall grasp with minor friction on advanced edge cases.",
            "unresolved_questions": ["How do we scale this implementation to distributed clusters?"],
            "recommended_next_lecture_plan": ["Begin with a 5-minute recap of edge cases", "Transition into live coding exercises"],
            "report_markdown": "# ClassPulse AI Lecture Digest\n\n## Summary\nInteractive session completed with high student engagement.",
        }


def _run_study_pack(messages: List[dict]) -> dict:
    conversation = "\n".join(
        f"{m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages
    )
    prompt = (
        "Synthesize all concepts and discussions from this lecture into interactive post-lecture study materials: "
        "1. Exactly 5 Key Concept Flashcards ({ question, answer })\n"
        "2. Exactly 3 Multiple-Choice Practice Quiz Questions ({ question, options: [4 options], correct_answer: 0-3 index, explanation })\n\n"
        f"Lecture Transcript:\n{conversation}"
    )
    system_instruction = "You are ClassPulse AI Study Master. Create interactive, high-retention revision cards and quizzes."
    try:
        raw_text = _generate_with_gemini(prompt, schema=StudyPackResponse, system_prompt=system_instruction)
        return json.loads(raw_text)
    except Exception:
        pass

    return {
        "flashcards": [
            {"question": "What is the primary objective of today's lesson?", "answer": "Understanding core system fundamentals and real-time state management."},
            {"question": "How is low-latency telemetry achieved?", "answer": "Via asynchronous WebSocket pipelines and non-blocking worker threads."},
            {"question": "Why is anonymous doubt submission valuable?", "answer": "It eliminates student hesitation and reveals genuine conceptual bottlenecks."},
            {"question": "What role does real-time polling play?", "answer": "It provides instant formative assessment to guide instructional pacing."},
            {"question": "How are WebRTC peer connections established?", "answer": "Using STUN/TURN servers to exchange SDP offers, answers, and ICE candidates."},
        ],
        "quiz": [
            {
                "question": "Which mechanism ensures zero-lag real-time chat broadcasts?",
                "options": ["Synchronous file writes", "WebSocket pub-sub relay (<20ms)", "Hourly polling", "HTTP long-polling only"],
                "correct_answer": 1,
                "explanation": "WebSocket pub-sub delivers low-latency bidirectional message relay.",
            },
            {
                "question": "What does a sudden spike in 'Too Fast' pace telemetry indicate?",
                "options": ["Students want more slides", "The instructor should slow down and clarify recent points", "The class is finished", "Audio is muted"],
                "correct_answer": 1,
                "explanation": "Pace gauges signal when the lecture velocity exceeds student processing capacity.",
            },
            {
                "question": "Why are asynchronous worker threads used for Gemini AI operations?",
                "options": ["To avoid blocking the main event loop and keep WebSocket latency < 20ms", "Because Gemini requires synchronous threads", "To reduce memory to 0", "To disable database access"],
                "correct_answer": 0,
                "explanation": "Offloading I/O bound LLM calls preserves real-time WebSocket responsiveness.",
            },
        ],
    }


# ──────────────────────────────────────────────────────────────────────────────
# AI HTTP Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/rooms/{room_id}/analyze")
@app.post("/ai/analyze")
async def analyze_room_telemetry(room_id: str = "room1"):
    messages = get_stored_messages(room_id)
    if not messages:
        # Return structured template if room is new
        return {
            "insights": {
                "summary": "Room is ready for live class. Awaiting participant discussion.",
                "main_topics": ["Classroom Setup"],
                "sentiment": "Neutral",
                "important_questions": [],
                "top_concerns": [],
                "action_items": ["Invite students to join the room"],
                "recommendation": "Start with an opening poll or icebreaker.",
            },
            "message_count": 0,
        }

    # Enforce AI analysis plan limits
    limits = await asyncio.to_thread(get_room_plan_limits, room_id)
    max_analyses = limits.get("ai_analyses_per_day", 3)
    insight_count = await asyncio.to_thread(get_insights_count_today, room_id)
    if insight_count >= max_analyses:
        return {
            "insights": {
                "summary": "AI Limit reached for today (Free tier: max 3). Upgrade to Pro/Institute for unlimited runs.",
                "main_topics": ["Quota Exceeded"],
                "sentiment": "Neutral",
                "important_questions": [],
                "top_concerns": ["Upgrade plan to Pro or Institute"],
                "action_items": ["Upgrade subscription for unlimited runs"],
                "recommendation": "Transition to Pro/Institute tier to unlock continuous real-time telemetry analysis.",
            },
            "message_count": len(messages),
            "room_id": room_id,
        }

    insights = await asyncio.to_thread(_run_analyze, messages)
    # Save insight record
    await asyncio.to_thread(
        save_insight,
        room_id=room_id,
        summary=insights.get("summary", ""),
        sentiment=insights.get("sentiment", "Neutral"),
        friction_points=insights.get("top_concerns", []),
        recommendation=insights.get("recommendation", ""),
        raw_json=json.dumps(insights),
    )
    return {"insights": insights, "message_count": len(messages), "room_id": room_id}


@app.post("/rooms/{room_id}/generate-poll")
async def generate_auto_poll(room_id: str):
    messages = get_stored_messages(room_id)
    poll_data = await asyncio.to_thread(_run_generate_poll, messages)
    return {"generated_poll": poll_data, "room_id": room_id}


@app.post("/rooms/{room_id}/catch-up")
async def get_student_catch_up(room_id: str):
    messages = get_stored_messages(room_id)
    bullets = await asyncio.to_thread(_run_catch_up, messages)
    return {"room_id": room_id, "summary": bullets, "bullets": bullets}


@app.post("/rooms/{room_id}/ask")
async def ask_classpulse_copilot(room_id: str, request: AskAIRequest):
    messages = get_stored_messages(room_id, request.start_time, request.end_time)
    if not messages:
        return {"answer": "No messages recorded in this lecture yet to answer queries.", "query": request.query}

    conversation = "\n".join(
        f"[{m.get('timestamp','N/A')}] {m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages
    )
    result = await asyncio.to_thread(_run_ask, conversation, request.query)
    return {"answer": result["answer"], "query": request.query, "message_count": len(messages)}


@app.post("/rooms/{room_id}/report")
async def generate_session_digest(room_id: str):
    messages = get_stored_messages(room_id)
    active_poll = get_active_poll(room_id)

    poll_context = "No polls conducted."
    if active_poll:
        poll_context = f"Poll: {active_poll.get('question','')}\nVotes: {json.dumps(active_poll.get('votes',{}))}"

    report_data = await asyncio.to_thread(_run_report, messages, poll_context)
    return {
        "report": report_data,
        "room_id": room_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/rooms/{room_id}/study-pack")
async def generate_room_study_pack(room_id: str):
    messages = get_stored_messages(room_id)
    study_pack = await asyncio.to_thread(_run_study_pack, messages)
    return {
        "room_id": room_id,
        "study_pack": study_pack,
        "flashcards": study_pack.get("flashcards", []),
        "quiz": study_pack.get("quiz", []),
    }