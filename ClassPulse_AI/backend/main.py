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

from database import get_stored_messages, save_message

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


class AskAIRequest(BaseModel):
    query: str = Field(description="The teacher's question regarding the class conversation")
    start_time: Optional[str] = Field(default=None, description="Optional ISO start timestamp filter")
    end_time: Optional[str] = Field(default=None, description="Optional ISO end timestamp filter")


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
        "message": "ClassPulse AI backend is running with SQLite persistence",
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

            # Save to SQLite Database
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