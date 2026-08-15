import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from database import (
    InsightRecord,
    SessionLocal,
    create_poll,
    get_active_poll,
    get_poll_results,
    get_stored_messages,
    record_vote,
    save_message,
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


# Pydantic Schemas
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
    start_time: Optional[str] = Field(default=None, description="Optional ISO start timestamp filter")
    end_time: Optional[str] = Field(default=None, description="Optional ISO end timestamp filter")


class CreatePollRequest(BaseModel):
    question: str = Field(description="The question being polled")
    options: List[str] = Field(description="List of 2 to 6 choices")


class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    async def connect(self, room_id: str, websocket: WebSocket):
        await websocket.accept()

        if room_id not in self.rooms:
            self.rooms[room_id] = []

        self.rooms[room_id].append(websocket)

    def disconnect(self, room_id: str, websocket: WebSocket):
        if room_id in self.rooms and websocket in self.rooms[room_id]:
            self.rooms[room_id].remove(websocket)

            if not self.rooms[room_id]:
                del self.rooms[room_id]

    def add_message(self, room_id: str, username: str, message: str, timestamp_str: str):
        save_message(room_id, username, message, timestamp_str)

    def get_messages(
        self,
        room_id: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> List[dict]:
        return get_stored_messages(room_id, start_time, end_time)

    async def broadcast(self, room_id: str, message: dict):
        connections = self.rooms.get(room_id, [])

        for connection in connections.copy():
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(room_id, connection)


manager = ConnectionManager()


@app.get("/")
def root():
    return {
        "status": "online",
        "message": "ClassPulse AI backend is running with SQLite persistence, Polls & Reports",
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
    }


@app.get("/rooms/{room_id}/participants")
def get_participant_count(room_id: str):
    return {
        "room_id": room_id,
        "participants": len(manager.rooms.get(room_id, [])),
    }


@app.get("/rooms/{room_id}/messages")
def get_room_messages(
    room_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
):
    msgs = manager.get_messages(room_id, start_time, end_time)
    return {
        "room_id": room_id,
        "messages": msgs,
        "count": len(msgs),
    }


# Poll Endpoints
@app.post("/rooms/{room_id}/polls")
async def create_room_poll(room_id: str, req: CreatePollRequest):
    if len(req.options) < 2:
        return {"error": "A poll requires at least 2 options."}

    poll_data = create_poll(room_id, req.question, req.options)

    await manager.broadcast(
        room_id,
        {
            "type": "poll_created",
            "poll": poll_data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {"poll": poll_data}


@app.get("/rooms/{room_id}/polls/active")
def get_current_room_poll(room_id: str):
    active_poll = get_active_poll(room_id)
    return {"poll": active_poll}


@app.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    await manager.connect(room_id, websocket)

    await manager.broadcast(
        room_id,
        {
            "type": "system",
            "message": "A participant joined the room.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "participants": len(manager.rooms.get(room_id, [])),
        },
    )

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "message")

            if event_type == "poll_vote":
                poll_id = data.get("poll_id")
                username = str(data.get("username", "Anonymous")).strip()
                selected_option = str(data.get("selected_option", "")).strip()

                if poll_id and selected_option:
                    updated_poll = record_vote(int(poll_id), username, selected_option)
                    if updated_poll:
                        await manager.broadcast(
                            room_id,
                            {
                                "type": "poll_update",
                                "poll": updated_poll,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                            },
                        )

            elif event_type == "message":
                username = str(data.get("username", "Anonymous")).strip()
                message = str(data.get("message", "")).strip()

                if not message:
                    continue

                iso_timestamp = datetime.now(timezone.utc).isoformat()

                event = {
                    "type": "message",
                    "username": username or "Anonymous",
                    "message": message,
                    "timestamp": iso_timestamp,
                    "room_id": room_id,
                }

                manager.add_message(
                    room_id=room_id,
                    username=event["username"],
                    message=event["message"],
                    timestamp_str=iso_timestamp,
                )

                await manager.broadcast(room_id, event)

    except WebSocketDisconnect:
        manager.disconnect(room_id, websocket)

        await manager.broadcast(
            room_id,
            {
                "type": "system",
                "message": "A participant left the room.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "participants": len(manager.rooms.get(room_id, [])),
            },
        )


@app.post("/ai/analyze")
async def analyze_conversation(data: dict):
    messages = data.get("messages", [])

    if not messages:
        return {"error": "No messages provided"}

    conversation = "\n".join(
        f"[{msg.get('timestamp', 'N/A')}] {msg.get('username', 'Anonymous')}: {msg.get('message', '')}"
        for msg in messages
    )

    prompt = f"Analyze the following classroom conversation:\n\n{conversation}"

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=AIInsightResponse,
                system_instruction="You are ClassPulse AI. Analyze the conversation and extract precise, structured intelligence."
            ),
        )

        insights = json.loads(response.text)
        return {
            "insights": insights,
            "message_count": len(messages),
        }
    except Exception as e:
        return {
            "error": f"AI generation failed: {str(e)}",
            "message_count": len(messages),
        }


@app.post("/rooms/{room_id}/analyze")
async def analyze_room(
    room_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
):
    messages = manager.get_messages(room_id, start_time, end_time)

    if not messages:
        return {"error": f"No messages found for room {room_id} in the specified window"}

    return await analyze_conversation({"messages": messages})


@app.post("/rooms/{room_id}/report")
async def generate_session_report(room_id: str):
    messages = manager.get_messages(room_id)
    active_poll = get_active_poll(room_id)

    if not messages and not active_poll:
        return {"error": f"No lecture data found for room {room_id} to generate a report."}

    conversation = "\n".join(
        f"[{msg.get('timestamp', 'N/A')}] {msg.get('username', 'Anonymous')}: {msg.get('message', '')}"
        for msg in messages
    )

    poll_context = "No polls conducted during this session."
    if active_poll:
        poll_context = (
            f"Poll Question: {active_poll['question']}\n"
            f"Results: {json.dumps(active_poll['votes'])}\n"
            f"Total Votes: {active_poll['total_votes']}"
        )

    prompt = f"""Generate a comprehensive post-lecture report based on this class data:

--- CHAT TRANSCRIPT ---
{conversation}

--- POLL DATA ---
{poll_context}
"""

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SessionReportResponse,
                system_instruction="You are ClassPulse AI. You generate professional, high-value end-of-lecture reports for teachers, distilling comprehension analytics and actionable lesson plans."
            ),
        )

        report_data = json.loads(response.text)

        # Save report record to SQLite
        db = SessionLocal()
        try:
            insight_rec = InsightRecord(
                room_id=room_id,
                raw_json=response.text,
            )
            db.add(insight_rec)
            db.commit()
        finally:
            db.close()

        return {
            "report": report_data,
            "room_id": room_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        return {"error": f"Report generation failed: {str(e)}"}


@app.post("/rooms/{room_id}/ask")
async def ask_classpulse(room_id: str, request: AskAIRequest):
    messages = manager.get_messages(room_id, request.start_time, request.end_time)

    if not messages:
        return {"error": f"No messages available in room {room_id} to answer questions."}

    conversation = "\n".join(
        f"[{msg.get('timestamp', 'N/A')}] {msg.get('username', 'Anonymous')}: {msg.get('message', '')}"
        for msg in messages
    )

    prompt = f"""Conversation transcript:
{conversation}

Teacher Question:
{request.query}

Answer the question accurately based solely on the conversation transcript above."""

    try:
        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction="You are ClassPulse AI assistant. You answer teacher questions about class discussions accurately, concisely, and cite specific students or events when relevant."
            ),
        )
        return {
            "answer": response.text,
            "query": request.query,
            "message_count_analyzed": len(messages),
        }
    except Exception as e:
        return {"error": f"Ask AI failed: {str(e)}"}
    @app.get("/rooms/{room_id}/students")
def get_student_analytics(room_id: str):
    db = SessionLocal()
    try:
        messages = db.query(MessageRecord).filter(MessageRecord.room_id == room_id).all()
        votes = db.query(VoteRecord).all()

        student_data = {}

        # Aggregate messages
        for msg in messages:
            if msg.username == "Anonymous" or not msg.username:
                continue
            if msg.username not in student_data:
                student_data[msg.username] = {
                    "username": msg.username,
                    "message_count": 0,
                    "questions_asked": [],
                    "voted": False,
                    "last_active": msg.timestamp.isoformat(),
                }
            student_data[msg.username]["message_count"] += 1
            student_data[msg.username]["last_active"] = msg.timestamp.isoformat()
            if "?" in msg.message:
                student_data[msg.username]["questions_asked"].append(msg.message)

        # Aggregate votes
        for v in votes:
            if v.username in student_data:
                student_data[v.username]["voted"] = True
            elif v.username != "Anonymous":
                student_data[v.username] = {
                    "username": v.username,
                    "message_count": 0,
                    "questions_asked": [],
                    "voted": True,
                    "last_active": v.timestamp.isoformat(),
                }

        # Calculate status & badges
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