import asyncio
import base64
import json
import os
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, UploadFile, File, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from livekit import api as lkapi

from database import (
    ClassSchedule,
    InsightRecord,
    MessageRecord,
    PushSubscription,
    RoomRecord,
    SessionLocal,
    SharedFileRecord,
    UserSubscription,
    VoteRecord,
    create_poll,
    create_schedule,
    delete_push_subscription,
    delete_schedule,
    get_active_poll,
    get_admin_dashboard_stats,
    get_all_push_subscriptions,
    get_poll_results,
    get_room_shared_files,
    get_schedules,
    get_schedules_due_for_reminder,
    get_stored_messages,
    get_user_subscription,
    mark_reminder_sent,
    record_shared_file,
    record_vote,
    save_message,
    schedule_to_dict,
    upsert_push_subscription,
    upsert_user_subscription,
)
from stripe_service import (
    create_checkout_session,
    create_portal_session,
    get_plan_limits,
    handle_webhook,
    PRICE_PRO_MONTHLY,
    PRICE_PRO_ANNUAL,
    PRICE_INSTITUTE_MONTHLY,
    PRICE_INSTITUTE_ANNUAL,
)

load_dotenv()

app = FastAPI(title="ClassPulse AI")

# Initialize Gemini Client
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload directory for classroom files
UPLOAD_DIR = Path("./uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/files", StaticFiles(directory=str(UPLOAD_DIR)), name="files")



# ──────────────────────────────────────────────────────────────────────────────
# VAPID Key Management (auto-generate & persist in vapid_keys.json)
# ──────────────────────────────────────────────────────────────────────────────

VAPID_KEYS_FILE = Path("./vapid_keys.json")

def _load_or_generate_vapid_keys() -> tuple[str, str]:
    """
    Returns (private_key_pem, public_key_base64url).
    Loads from env vars first, then from a local file, then generates fresh.
    """
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

    # Generate a fresh pair
    try:
        from py_vapid import Vapid
        from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

        v = Vapid()
        v.generate_keys()
        private_pem = v.private_pem().decode("utf-8")
        raw_pub     = v.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
        public_b64  = base64.urlsafe_b64encode(raw_pub).rstrip(b"=").decode("utf-8")

        VAPID_KEYS_FILE.write_text(json.dumps({"private": private_pem, "public": public_b64}, indent=2))
        print(
            "\n[ClassPulse] Generated new VAPID keys → saved to vapid_keys.json\n"
            "  Add to .env for persistence:\n"
            f"  VAPID_PUBLIC_KEY={public_b64}\n"
        )
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


class AskAIRequest(BaseModel):
    query: str = Field(description="The teacher's question regarding the class conversation")
    start_time: Optional[str] = Field(default=None)
    end_time:   Optional[str] = Field(default=None)


class CreatePollRequest(BaseModel):
    question: str
    options: List[str]


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
# Connection Manager
# ──────────────────────────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}
        self.peer_map: Dict[str, Dict[str, WebSocket]] = {}

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

    def add_message(self, room_id, username, message, timestamp_str):
        save_message(room_id, username, message, timestamp_str)

    def get_messages(self, room_id, start_time=None, end_time=None):
        return get_stored_messages(room_id, start_time, end_time)

    async def broadcast(self, room_id: str, message: dict, exclude: Optional[WebSocket] = None):
        for conn in self.rooms.get(room_id, []).copy():
            if conn is exclude:
                continue
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(room_id, conn)

    async def broadcast_all_rooms(self, message: dict):
        """Broadcast to every connected socket across all rooms."""
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
    """Fire a push notification to one browser subscription (non-blocking)."""
    if not VAPID_PRIVATE_KEY:
        return

    def _do_send():
        try:
            from pywebpush import webpush, WebPushException
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
            print(f"[Push] Delivery failed for {sub.username}: {e}")

    await asyncio.to_thread(_do_send)


async def push_to_all(payload: dict):
    """Fan-out push notification to all registered browser subscriptions."""
    subs = await asyncio.to_thread(get_all_push_subscriptions)
    tasks = [_send_push(sub, payload) for sub in subs]
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


# ──────────────────────────────────────────────────────────────────────────────
# Background Task: 5-Minute Class Reminder
# ──────────────────────────────────────────────────────────────────────────────

async def _reminder_loop():
    """Runs every 60 s. Sends push + WS notification ~5 min before class starts."""
    while True:
        await asyncio.sleep(60)
        now   = datetime.now(timezone.utc)
        start = now + timedelta(minutes=4, seconds=30)
        end   = now + timedelta(minutes=5, seconds=30)

        due = await asyncio.to_thread(get_schedules_due_for_reminder, start, end)
        for schedule in due:
            payload = {
                "title": "ClassPulse AI — Class Starting Soon!",
                "body":  f"'{schedule.title}' starts in ~5 minutes. Room: {schedule.room_id.upper()}",
                "url":   f"/room/{schedule.room_id}",
                "icon":  "/favicon.ico",
            }
            # Push notification
            await push_to_all(payload)
            # WebSocket broadcast across all connected rooms
            await manager.broadcast_all_rooms({
                "type":      "class_reminder",
                "schedule":  schedule_to_dict(schedule),
                "timestamp": now.isoformat(),
            })
            await asyncio.to_thread(mark_reminder_sent, schedule.id)
            print(f"[Reminder] Sent 5-min reminder for '{schedule.title}' (room={schedule.room_id})")


@app.on_event("startup")
async def startup():
    asyncio.create_task(_reminder_loop())


# ──────────────────────────────────────────────────────────────────────────────
# Health & Info
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "online", "message": "ClassPulse AI backend running."}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/vapid-key")
def get_vapid_key():
    """Return the VAPID public key so the browser can subscribe to push."""
    return {"vapidPublicKey": VAPID_PUBLIC_KEY}


@app.get("/rooms/{room_id}/participants")
def get_participant_count(room_id: str):
    return {"room_id": room_id, "participants": len(manager.rooms.get(room_id, []))}


@app.get("/rooms/{room_id}/messages")
def get_room_messages(room_id: str, start_time: Optional[str] = None, end_time: Optional[str] = None):
    msgs = manager.get_messages(room_id, start_time, end_time)
    return {"room_id": room_id, "messages": msgs, "count": len(msgs)}


# ──────────────────────────────────────────────────────────────────────────────
# LiveKit — Configuration
# ──────────────────────────────────────────────────────────────────────────────

LIVEKIT_URL        = os.getenv("LIVEKIT_URL", "")
LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY", "")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")


class LiveKitTokenRequest(BaseModel):
    participant_name: str = Field(description="Display name shown in the video grid")
    is_host: bool = Field(default=False, description="True for teachers — grants room-admin powers")
    participant_identity: Optional[str] = Field(default=None, description="Unique ID; auto-generated if omitted")


class MuteParticipantRequest(BaseModel):
    participant_identity: str
    track_sid: str


class LockRoomRequest(BaseModel):
    lock: bool


# ──────────────────────────────────────────────────────────────────────────────
# LiveKit — Token Generation
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/rooms/{room_id}/token")
async def generate_livekit_token(room_id: str, req: LiveKitTokenRequest):
    """
    Generate a signed LiveKit JWT for a participant.
    Teachers get room_admin=True; students are regular publishers.
    """
    if not all([LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET]):
        return {"error": "LiveKit not configured on server."}

    identity = req.participant_identity or f"{req.participant_name.lower().replace(' ', '_')}_{uuid.uuid4().hex[:6]}"

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
        "is_host":  req.is_host,
        "role":     "teacher" if req.is_host else "student",
    })

    try:
        token = (
            lkapi.AccessToken(api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)
            .with_identity(identity)
            .with_name(req.participant_name)
            .with_metadata(metadata)
            .with_grants(grants)
            .with_ttl(timedelta(hours=4))
        )
        return {"token": token.to_jwt(), "server_url": LIVEKIT_URL, "identity": identity}
    except Exception as e:
        return {"error": f"Token generation failed: {e}"}


# ──────────────────────────────────────────────────────────────────────────────
# LiveKit — Host Controls
# ──────────────────────────────────────────────────────────────────────────────

async def _get_lk_client():
    return lkapi.LiveKitAPI(
        url=LIVEKIT_URL,
        api_key=LIVEKIT_API_KEY,
        api_secret=LIVEKIT_API_SECRET,
    )


@app.post("/rooms/{room_id}/mute-participant")
async def mute_participant(room_id: str, req: MuteParticipantRequest):
    """Mute a specific participant's audio track (teacher only)."""
    try:
        async with await _get_lk_client() as client:
            await client.room.mute_published_track(
                lkapi.MuteRoomTrackRequest(
                    room=room_id,
                    identity=req.participant_identity,
                    track_sid=req.track_sid,
                    muted=True,
                )
            )
        return {"ok": True, "message": f"Muted {req.participant_identity}"}
    except Exception as e:
        return {"error": str(e)}


@app.delete("/rooms/{room_id}/kick/{identity}")
async def kick_participant(room_id: str, identity: str):
    """Remove a participant from the room entirely (teacher only)."""
    try:
        async with await _get_lk_client() as client:
            await client.room.remove_participant(
                lkapi.RoomParticipantIdentity(room=room_id, identity=identity)
            )
        return {"ok": True, "message": f"Removed {identity}"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/rooms/{room_id}/mute-all")
async def mute_all_participants(room_id: str):
    """Mute every non-host participant's microphone."""
    try:
        async with await _get_lk_client() as client:
            resp = await client.room.list_participants(
                lkapi.ListParticipantsRequest(room=room_id)
            )
            muted = 0
            for p in resp.participants:
                meta = json.loads(p.metadata) if p.metadata else {}
                if meta.get("is_host"):
                    continue
                for track in p.tracks:
                    if track.type == lkapi.TrackType.AUDIO and not track.muted:
                        await client.room.mute_published_track(
                            lkapi.MuteRoomTrackRequest(
                                room=room_id,
                                identity=p.identity,
                                track_sid=track.sid,
                                muted=True,
                            )
                        )
                        muted += 1
        return {"ok": True, "muted_tracks": muted}
    except Exception as e:
        return {"error": str(e)}


@app.post("/rooms/{room_id}/lock")
async def lock_room(room_id: str, req: LockRoomRequest):
    """Lock/unlock the room so no new participants can join."""
    try:
        async with await _get_lk_client() as client:
            await client.room.update_room_metadata(
                lkapi.UpdateRoomMetadataRequest(
                    room=room_id,
                    metadata=json.dumps({"is_locked": req.lock}),
                )
            )
        return {"ok": True, "locked": req.lock}
    except Exception as e:
        return {"error": str(e)}


@app.get("/rooms/{room_id}/live-participants")
async def get_live_participants(room_id: str):
    """List all participants currently in the LiveKit room."""
    try:
        async with await _get_lk_client() as client:
            resp = await client.room.list_participants(
                lkapi.ListParticipantsRequest(room=room_id)
            )
            return {
                "room_id": room_id,
                "participants": [
                    {
                        "identity": p.identity,
                        "name": p.name,
                        "is_host": json.loads(p.metadata or "{}").get("is_host", False),
                        "joined_at": p.joined_at,
                    }
                    for p in resp.participants
                ],
            }
    except Exception as e:
        return {"error": str(e), "participants": []}





# ──────────────────────────────────────────────────────────────────────────────
# Poll Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/rooms/{room_id}/polls")
async def create_room_poll(room_id: str, req: CreatePollRequest):
    if len(req.options) < 2:
        return {"error": "A poll requires at least 2 options."}
    poll_data = create_poll(room_id, req.question, req.options)
    await manager.broadcast(room_id, {"type": "poll_created", "poll": poll_data, "timestamp": datetime.now(timezone.utc).isoformat()})
    return {"poll": poll_data}


@app.get("/rooms/{room_id}/polls/active")
def get_current_room_poll(room_id: str):
    return {"poll": get_active_poll(room_id)}


# ──────────────────────────────────────────────────────────────────────────────
# Schedule / Calendar Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/schedules")
async def create_class_schedule(req: CreateScheduleRequest):
    """Create a scheduled class and broadcast + push to all users."""
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

    # Real-time WebSocket broadcast to the specific room and all connected rooms
    ws_payload = {"type": "class_scheduled", "schedule": schedule, "timestamp": now_iso}
    await manager.broadcast(req.room_id, ws_payload)
    # Also broadcast globally (e.g. teacher on another room's tab)
    for room_id in list(manager.rooms.keys()):
        if room_id != req.room_id:
            await manager.broadcast(room_id, ws_payload)

    # Push notification to all subscribed browsers
    push_payload = {
        "title": "ClassPulse AI — New Class Scheduled",
        "body":  f"'{req.title}' on {scheduled_dt.strftime('%b %d at %I:%M %p')} (UTC) — Room {req.room_id.upper()}",
        "url":   f"/room/{req.room_id}",
        "icon":  "/favicon.ico",
    }
    asyncio.create_task(push_to_all(push_payload))

    return {"schedule": schedule}


@app.get("/schedules")
def list_all_schedules(upcoming_only: bool = False):
    """List all scheduled classes (optionally filter to upcoming only)."""
    return {"schedules": get_schedules(upcoming_only=upcoming_only)}


@app.get("/rooms/{room_id}/schedules")
def list_room_schedules(room_id: str, upcoming_only: bool = False):
    """List scheduled classes for a specific room."""
    return {"schedules": get_schedules(room_id=room_id, upcoming_only=upcoming_only)}


@app.delete("/schedules/{schedule_id}")
async def remove_schedule(schedule_id: int):
    """Delete a scheduled class by ID."""
    ok = await asyncio.to_thread(delete_schedule, schedule_id)
    if not ok:
        return {"error": f"Schedule {schedule_id} not found."}

    await manager.broadcast_all_rooms({
        "type":        "schedule_deleted",
        "schedule_id": schedule_id,
        "timestamp":   datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
# Push Notification Subscription Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/push/subscribe")
async def subscribe_push(req: PushSubscribeRequest):
    """Store a browser push subscription."""
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


# ──────────────────────────────────────────────────────────────────────────────
# Stripe Subscription & Plan Endpoints
# ──────────────────────────────────────────────────────────────────────────────

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
    """Create Stripe checkout session for upgrading to Pro/Institute."""
    url = create_checkout_session(
        customer_email=req.customer_email,
        price_id=req.price_id,
        success_url="http://localhost:3000/billing?status=success",
        cancel_url="http://localhost:3000/pricing",
        clerk_user_id=req.clerk_user_id,
    )
    # Record subscription intent in database
    await asyncio.to_thread(
        upsert_user_subscription,
        clerk_user_id=req.clerk_user_id,
        customer_email=req.customer_email,
        plan=req.plan_name,
        status="active",
    )
    return {"url": url}


@app.post("/api/stripe/portal")
async def create_portal(req: StripePortalRequest):
    """Redirect to Stripe Customer Portal."""
    url = create_portal_session(req.customer_id, req.return_url)
    return {"url": url}


@app.post("/api/stripe/webhook")
async def stripe_webhook_endpoint(request: Request):
    """Handle Stripe subscription lifecycle webhooks."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    event_data = handle_webhook(payload, sig_header)
    return {"received": True, "event": event_data.get("type", "unknown")}


@app.get("/api/plans")
def list_plans():
    """Return configured plan quotas and capabilities."""
    return {
        "free": get_plan_limits("free"),
        "pro": get_plan_limits("pro"),
        "institute": get_plan_limits("institute"),
        "enterprise": get_plan_limits("enterprise"),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Classroom File Upload & Sharing Endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/rooms/{room_id}/files")
async def upload_classroom_file(room_id: str, file: UploadFile = File(...)):
    """Upload a file to the room's repository and broadcast to all participants."""
    safe_name = file.filename.replace(" ", "_") if file.filename else "file"
    room_dir = UPLOAD_DIR / room_id
    room_dir.mkdir(exist_ok=True, parents=True)
    dest_path = room_dir / safe_name

    with open(dest_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    file_size = dest_path.stat().st_size
    file_url = f"/files/{room_id}/{safe_name}"

    # Save to database
    record = await asyncio.to_thread(
        record_shared_file,
        room_id=room_id,
        filename=safe_name,
        file_url=file_url,
        file_size=file_size,
    )

    # Real-time WebSocket broadcast
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
    """Return all shared materials for a specific room."""
    return {"files": get_room_shared_files(room_id)}


# ──────────────────────────────────────────────────────────────────────────────
# Admin Telemetry & Statistics
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/admin/stats")
def get_admin_stats():
    """Return platform-wide room, user, and message telemetry."""
    return get_admin_dashboard_stats()


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket Endpoint (Chat + WebRTC + Live Interaction & Tools)
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)
    participant_username: Optional[str] = None

    await manager.broadcast(room_id, {
        "type":         "system",
        "message":      "A participant joined the room.",
        "timestamp":    datetime.now(timezone.utc).isoformat(),
        "participants": len(manager.rooms.get(room_id, [])),
    })

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "message")

            if event_type == "message":
                username = str(data.get("username", "Anonymous")).strip()
                message  = str(data.get("message", "")).strip()
                if not message:
                    continue
                if username and participant_username is None:
                    participant_username = username
                    manager.register_peer(room_id, username, websocket)
                iso_ts = datetime.now(timezone.utc).isoformat()
                event  = {"type": "message", "username": username or "Anonymous",
                           "message": message, "timestamp": iso_ts, "room_id": room_id}
                manager.add_message(room_id, event["username"], event["message"], iso_ts)
                await manager.broadcast(room_id, event)

            elif event_type == "poll_vote":
                poll_id  = data.get("poll_id")
                username = str(data.get("username", "Anonymous")).strip()
                selected = str(data.get("selected_option", "")).strip()
                if poll_id and selected:
                    updated_poll = record_vote(int(poll_id), username, selected)
                    if updated_poll:
                        await manager.broadcast(room_id, {
                            "type": "poll_update", "poll": updated_poll,
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })

            elif event_type == "whiteboard_draw":
                # Forward real-time whiteboard drawing strokes to peers
                await manager.broadcast(room_id, data, exclude=websocket)

            elif event_type == "breakout_start":
                # Broadcast breakout sub-room creation and timer
                await manager.broadcast(room_id, {
                    "type": "breakout_started",
                    "rooms": data.get("rooms", []),
                    "timer_minutes": data.get("timer_minutes", 10),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif event_type == "breakout_end":
                # Broadcast return to main classroom
                await manager.broadcast(room_id, {
                    "type": "breakout_ended",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            elif event_type in ("hand_raised", "hand_lowered", "reaction"):
                # Broadcast audience participation events
                await manager.broadcast(room_id, data)

            elif event_type == "video-join":
                username = str(data.get("username", "Anonymous")).strip()
                if username:
                    participant_username = username
                    manager.register_peer(room_id, username, websocket)
                await manager.broadcast(room_id, {
                    "type": "video-join", "username": username,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }, exclude=websocket)

            elif event_type == "video-offer":
                target = data.get("target")
                if target:
                    await manager.send_to_peer(room_id, target, {
                        "type": "video-offer", "sdp": data.get("sdp"),
                        "from": data.get("from"), "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            elif event_type == "video-answer":
                target = data.get("target")
                if target:
                    await manager.send_to_peer(room_id, target, {
                        "type": "video-answer", "sdp": data.get("sdp"),
                        "from": data.get("from"), "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

            elif event_type == "video-ice-candidate":
                target = data.get("target")
                if target:
                    await manager.send_to_peer(room_id, target, {
                        "type": "video-ice-candidate", "candidate": data.get("candidate"),
                        "from": data.get("from"), "timestamp": datetime.now(timezone.utc).isoformat(),
                    })

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)
        await manager.broadcast(room_id, {
            "type":         "system",
            "message":      f"{participant_username or 'A participant'} left the room.",
            "timestamp":    datetime.now(timezone.utc).isoformat(),
            "participants": len(manager.rooms.get(room_id, [])),
        })
        if participant_username:
            await manager.broadcast(room_id, {
                "type": "video-leave", "username": participant_username,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })



# ──────────────────────────────────────────────────────────────────────────────
# AI Endpoints (all Gemini calls wrapped in asyncio.to_thread)
# ──────────────────────────────────────────────────────────────────────────────

def _run_analyze(messages: List[dict]) -> dict:
    conversation = "\n".join(
        f"[{m.get('timestamp','N/A')}] {m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages
    )
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Analyze this classroom conversation:\n\n{conversation}",
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AIInsightResponse,
            system_instruction="You are ClassPulse AI. Analyze student conversations and extract structured insights for the teacher.",
        ),
    )
    return json.loads(response.text)


def _run_report(messages: List[dict], poll_context: str) -> dict:
    conversation = "\n".join(
        f"[{m.get('timestamp','N/A')}] {m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages
    )
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Generate a post-lecture report.\n\n--- CHAT ---\n{conversation}\n\n--- POLLS ---\n{poll_context}",
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SessionReportResponse,
            system_instruction="You are ClassPulse AI. Generate professional end-of-lecture reports.",
        ),
    )
    return json.loads(response.text)


def _run_ask(conversation: str, query: str) -> str:
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"Transcript:\n{conversation}\n\nTeacher question:\n{query}\n\nAnswer based on the transcript.",
        config=types.GenerateContentConfig(
            system_instruction="You are ClassPulse AI. Answer teacher questions about class discussions, citing specific students and timestamps when relevant.",
        ),
    )
    return response.text


@app.post("/ai/analyze")
async def analyze_conversation(data: dict):
    messages = data.get("messages", [])
    if not messages:
        return {"error": "No messages provided"}
    try:
        insights = await asyncio.to_thread(_run_analyze, messages)
        return {"insights": insights, "message_count": len(messages)}
    except Exception as e:
        return {"error": f"AI generation failed: {str(e)}", "message_count": len(messages)}


@app.post("/rooms/{room_id}/analyze")
async def analyze_room(room_id: str, start_time: Optional[str] = None, end_time: Optional[str] = None):
    messages = manager.get_messages(room_id, start_time, end_time)
    if not messages:
        return {"error": f"No messages found for room {room_id}"}
    return await analyze_conversation({"messages": messages})


@app.post("/rooms/{room_id}/report")
async def generate_session_report(room_id: str):
    messages     = manager.get_messages(room_id)
    active_poll  = get_active_poll(room_id)
    if not messages and not active_poll:
        return {"error": f"No lecture data found for room {room_id}."}

    poll_context = "No polls conducted."
    if active_poll:
        poll_context = (
            f"Poll: {active_poll['question']}\n"
            f"Results: {json.dumps(active_poll['votes'])}\n"
            f"Total Votes: {active_poll['total_votes']}"
        )

    try:
        report_data = await asyncio.to_thread(_run_report, messages, poll_context)
        db = SessionLocal()
        try:
            db.add(InsightRecord(room_id=room_id, raw_json=json.dumps(report_data)))
            db.commit()
        finally:
            db.close()
        return {"report": report_data, "room_id": room_id, "generated_at": datetime.now(timezone.utc).isoformat()}
    except Exception as e:
        return {"error": f"Report generation failed: {str(e)}"}


@app.post("/rooms/{room_id}/ask")
async def ask_classpulse(room_id: str, request: AskAIRequest):
    messages = manager.get_messages(room_id, request.start_time, request.end_time)
    if not messages:
        return {"error": f"No messages available in room {room_id}."}

    conversation = "\n".join(
        f"[{m.get('timestamp','N/A')}] {m.get('username','Anonymous')}: {m.get('message','')}"
        for m in messages
    )
    try:
        answer = await asyncio.to_thread(_run_ask, conversation, request.query)
        return {"answer": answer, "query": request.query, "message_count_analyzed": len(messages)}
    except Exception as e:
        return {"error": f"Ask AI failed: {str(e)}"}


# ──────────────────────────────────────────────────────────────────────────────
# Student Analytics
# ──────────────────────────────────────────────────────────────────────────────

@app.get("/rooms/{room_id}/students")
def get_student_analytics(room_id: str):
    db = SessionLocal()
    try:
        messages = db.query(MessageRecord).filter(MessageRecord.room_id == room_id).all()
        votes    = db.query(VoteRecord).all()
        student_data: Dict[str, dict] = {}

        for msg in messages:
            if not msg.username or msg.username == "Anonymous":
                continue
            if msg.username not in student_data:
                student_data[msg.username] = {
                    "username": msg.username, "message_count": 0,
                    "questions_asked": [], "voted": False,
                    "last_active": msg.timestamp.isoformat(),
                }
            student_data[msg.username]["message_count"] += 1
            student_data[msg.username]["last_active"] = msg.timestamp.isoformat()
            if "?" in msg.message:
                student_data[msg.username]["questions_asked"].append(msg.message)

        for v in votes:
            if v.username in student_data:
                student_data[v.username]["voted"] = True
            elif v.username and v.username != "Anonymous":
                student_data[v.username] = {
                    "username": v.username, "message_count": 0,
                    "questions_asked": [], "voted": True,
                    "last_active": v.timestamp.isoformat(),
                }

        students_list = []
        for s in student_data.values():
            badge = "Observer"
            if len(s["questions_asked"]) >= 2:
                badge = "Inquisitive"
            elif s["message_count"] >= 3:
                badge = "Highly Active"
            elif s["voted"]:
                badge = "Engaged Voter"
            students_list.append({**s, "badge": badge})

        return {
            "room_id": room_id,
            "students": sorted(students_list, key=lambda x: x["message_count"], reverse=True),
            "total_tracked": len(students_list),
        }
    finally:
        db.close()