import csv
import io
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./classpulse.db")

# Fix SQLAlchemy URL scheme for Postgres if needed (e.g. postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
    )
    # Enable WAL mode and set busy timeout to prevent database locks
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=300,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ──────────────────────────────────────────────────────────────────────────────
# ORM Models
# ──────────────────────────────────────────────────────────────────────────────

class Room(Base):
    """Classroom metadata and management."""
    __tablename__ = "rooms"

    id = Column(String(64), primary_key=True, index=True)
    name = Column(String(256), default="Interactive Classroom")
    title = Column(String(256), default="Interactive Classroom")
    teacher_id = Column(String(128), nullable=True, index=True)
    teacher_name = Column(String(64), default="Instructor")
    is_active = Column(Boolean, default=True)
    is_locked = Column(Boolean, default=False)
    max_students = Column(Integer, default=500)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# Alias for backward compatibility
RoomRecord = Room


class MessageRecord(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String(64), index=True, nullable=False)
    username = Column(String(64), nullable=False)
    message = Column(Text, nullable=False)
    is_doubt = Column(Boolean, default=False, index=True)
    is_anonymous = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class PollRecord(Base):
    __tablename__ = "polls"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String(64), index=True, nullable=False)
    question = Column(Text, nullable=False)
    options = Column(Text, nullable=True)       # JSON-encoded array of options
    options_json = Column(Text, nullable=True)  # Legacy compatibility
    votes = Column(Text, nullable=True)        # JSON-encoded dictionary of vote counts
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))



class VoteRecord(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    poll_id = Column(Integer, index=True, nullable=False)
    username = Column(String(64), nullable=False)
    selected_option = Column(String(256), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))



class AttendanceRecord(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String(64), index=True, nullable=False)
    username = Column(String(64), index=True, nullable=False)
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    left_at = Column(DateTime(timezone=True), nullable=True)
    total_messages = Column(Integer, default=0)
    polls_voted = Column(Integer, default=0)


class InsightRecord(Base):
    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    room_id = Column(String(64), index=True, nullable=False)
    summary = Column(Text, nullable=False)
    sentiment = Column(String(64), default="Neutral")
    friction_points = Column(Text, nullable=True)  # JSON-encoded array of strings
    recommendation = Column(Text, nullable=True)
    raw_json = Column(Text, nullable=True)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class ClassSchedule(Base):
    """Scheduled class sessions — visible on the calendar."""
    __tablename__ = "class_schedules"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(64), index=True, nullable=False)
    title = Column(String(256), nullable=False)
    description = Column(Text, nullable=True)
    scheduled_at = Column(DateTime(timezone=True), nullable=False, index=True)
    duration_minutes = Column(Integer, default=60)
    created_by = Column(String(64), nullable=False)
    role = Column(String(32), default="teacher")          # "teacher" | "student" | "admin"
    reminder_sent = Column(Boolean, default=False)        # True once 5-min push was fired
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PushSubscription(Base):
    """Browser Web Push subscriptions — one row per device/browser."""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    endpoint = Column(Text, unique=True, nullable=False)
    keys_auth = Column(String(512), nullable=False)
    keys_p256dh = Column(String(512), nullable=False)
    username = Column(String(64), nullable=False)
    role = Column(String(32), default="student")          # "teacher" | "student"
    room_id = Column(String(64), nullable=True)           # optional room filter
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserSubscription(Base):
    """SaaS customer subscription tracking."""
    __tablename__ = "user_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    clerk_user_id = Column(String(128), unique=True, index=True, nullable=False)
    customer_email = Column(String(256), nullable=False)
    stripe_customer_id = Column(String(128), nullable=True, index=True)
    stripe_subscription_id = Column(String(128), nullable=True)
    plan = Column(String(32), default="free")             # "free" | "pro" | "institute" | "enterprise"
    status = Column(String(32), default="active")         # "active" | "trialing" | "canceled" | "past_due"
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SharedFileRecord(Base):
    """Uploaded files shared inside a classroom."""
    __tablename__ = "shared_files"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(64), index=True, nullable=False)
    filename = Column(String(256), nullable=False)
    file_url = Column(String(512), nullable=False)
    file_size = Column(Integer, default=0)
    uploader = Column(String(64), default="Instructor")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# Create all tables (idempotent)
Base.metadata.create_all(bind=engine)

from sqlalchemy import inspect, text

# Auto-migrate missing columns for SQLite & Postgres
try:
    inspector = inspect(engine)
    with engine.connect() as conn:
        for table, col, col_type in [
            ("rooms", "name", "VARCHAR(256) DEFAULT 'Interactive Classroom'"),
            ("rooms", "is_active", "BOOLEAN DEFAULT 1"),
            ("messages", "is_doubt", "BOOLEAN DEFAULT 0"),
            ("messages", "is_anonymous", "BOOLEAN DEFAULT 0"),
            ("polls", "options", "TEXT DEFAULT '[]'"),
            ("polls", "votes", "TEXT DEFAULT '{}'"),
            ("insights", "summary", "TEXT DEFAULT ''"),
            ("insights", "friction_points", "TEXT"),
            ("insights", "recommendation", "TEXT"),
            ("insights", "sentiment", "VARCHAR(64) DEFAULT 'Neutral'"),
        ]:
            try:
                existing_cols = [c["name"] for c in inspector.get_columns(table)]
                if col not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {col_type}"))
                    conn.commit()
            except Exception:
                pass
        try:
            conn.execute(text("UPDATE polls SET options = options_json WHERE (options IS NULL OR options = '[]') AND options_json IS NOT NULL"))
            conn.commit()
        except Exception:
            pass
except Exception:
    pass





# ──────────────────────────────────────────────────────────────────────────────
# Room CRUD Helpers
# ──────────────────────────────────────────────────────────────────────────────

def get_or_create_room(room_id: str, name: Optional[str] = None, teacher_name: str = "Instructor") -> Room:
    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.id == str(room_id)).first()
        if not room:
            room = Room(
                id=str(room_id),
                name=name or f"Room {room_id.upper()}",
                title=name or f"Room {room_id.upper()}",
                teacher_name=teacher_name,
                is_active=True,
            )
            db.add(room)
            db.commit()
            db.refresh(room)
        return room
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Message & Doubt CRUD Helpers
# ──────────────────────────────────────────────────────────────────────────────

def save_message(
    room_id: str,
    username: str,
    message: str,
    is_doubt: bool = False,
    is_anonymous: bool = False,
    timestamp_str: Optional[str] = None,
) -> dict:
    db = SessionLocal()
    try:
        ts = datetime.fromisoformat(timestamp_str) if timestamp_str else datetime.now(timezone.utc)
        record = MessageRecord(
            room_id=str(room_id),
            username=username,
            message=message,
            is_doubt=is_doubt,
            is_anonymous=is_anonymous,
            timestamp=ts,
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        # Track message count in attendance
        if username not in ("System", "Teacher", "Instructor", "Anonymous"):
            att = db.query(AttendanceRecord).filter(
                AttendanceRecord.room_id == str(room_id),
                AttendanceRecord.username == username,
            ).order_by(AttendanceRecord.joined_at.desc()).first()
            if att:
                att.total_messages += 1
                db.commit()

        return {
            "id": record.id,
            "room_id": record.room_id,
            "username": "Anonymous" if is_anonymous else record.username,
            "message": record.message,
            "is_doubt": record.is_doubt,
            "is_anonymous": record.is_anonymous,
            "timestamp": record.timestamp.isoformat(),
        }
    finally:
        db.close()


def get_stored_messages(
    room_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> List[dict]:
    db = SessionLocal()
    try:
        query = db.query(MessageRecord).filter(MessageRecord.room_id == str(room_id))
        if start_time:
            query = query.filter(MessageRecord.timestamp >= datetime.fromisoformat(start_time))
        if end_time:
            query = query.filter(MessageRecord.timestamp <= datetime.fromisoformat(end_time))
        records = query.order_by(MessageRecord.timestamp.asc()).all()
        return [
            {
                "id": rec.id,
                "username": "Anonymous" if rec.is_anonymous else rec.username,
                "raw_username": "Anonymous" if rec.is_anonymous else rec.username,
                "message": rec.message,
                "is_doubt": bool(rec.is_doubt),
                "is_anonymous": bool(rec.is_anonymous),
                "timestamp": rec.timestamp.isoformat(),
            }
            for rec in records
        ]
    finally:
        db.close()


def get_doubts(room_id: str) -> List[dict]:
    db = SessionLocal()
    try:
        records = db.query(MessageRecord).filter(
            MessageRecord.room_id == str(room_id),
            MessageRecord.is_doubt == True,
        ).order_by(MessageRecord.timestamp.desc()).all()
        return [
            {
                "id": rec.id,
                "username": "Anonymous" if rec.is_anonymous else rec.username,
                "message": rec.message,
                "is_anonymous": bool(rec.is_anonymous),
                "timestamp": rec.timestamp.isoformat(),
            }
            for rec in records
        ]
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Polling CRUD Helpers
# ──────────────────────────────────────────────────────────────────────────────

def create_poll(room_id: str, question: str, options: List[str]) -> dict:
    db = SessionLocal()
    try:
        # Deactivate previous active polls for this room
        db.query(PollRecord).filter(
            PollRecord.room_id == str(room_id),
            PollRecord.is_active == True,
        ).update({"is_active": False})

        initial_votes = {opt: 0 for opt in options}

        poll = PollRecord(
            room_id=str(room_id),
            question=question,
            options=json.dumps(options),
            options_json=json.dumps(options),
            votes=json.dumps(initial_votes),
            is_active=True,
        )
        db.add(poll)
        db.commit()
        db.refresh(poll)

        return {
            "id": poll.id,
            "room_id": poll.room_id,
            "question": poll.question,
            "options": options,
            "is_active": poll.is_active,
            "votes": initial_votes,
            "total_votes": 0,
            "created_at": poll.created_at.isoformat() if poll.created_at else datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()


def record_vote(poll_id: Union[str, int], username: str, selected_option: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        try:
            pid = int(poll_id)
        except Exception:
            return None

        poll = db.query(PollRecord).filter(PollRecord.id == pid, PollRecord.is_active == True).first()
        if not poll:
            return None

        # Check existing vote
        existing_vote = db.query(VoteRecord).filter(
            VoteRecord.poll_id == pid,
            VoteRecord.username == username,
        ).first()

        is_new_vote = False
        if existing_vote:
            existing_vote.selected_option = selected_option
            existing_vote.timestamp = datetime.now(timezone.utc)
        else:
            db.add(VoteRecord(poll_id=pid, username=username, selected_option=selected_option))
            is_new_vote = True

        db.commit()

        # Update attendance polls_voted counter if new
        if is_new_vote and username not in ("Teacher", "Instructor", "System"):
            att = db.query(AttendanceRecord).filter(
                AttendanceRecord.room_id == poll.room_id,
                AttendanceRecord.username == username,
            ).order_by(AttendanceRecord.joined_at.desc()).first()
            if att:
                att.polls_voted += 1
                db.commit()

        return get_poll_results(pid)
    finally:
        db.close()


def get_poll_results(poll_id: Union[str, int]) -> Optional[dict]:
    db = SessionLocal()
    try:
        try:
            pid = int(poll_id)
        except Exception:
            return None

        poll = db.query(PollRecord).filter(PollRecord.id == pid).first()
        if not poll:
            return None

        options = json.loads(poll.options)
        votes = db.query(VoteRecord).filter(VoteRecord.poll_id == pid).all()

        tally = {opt: 0 for opt in options}
        for v in votes:
            if v.selected_option in tally:
                tally[v.selected_option] += 1

        total = len(votes)
        poll.votes = json.dumps(tally)
        db.commit()

        return {
            "id": poll.id,
            "room_id": poll.room_id,
            "question": poll.question,
            "options": options,
            "is_active": poll.is_active,
            "votes": tally,
            "total_votes": total,
            "created_at": poll.created_at.isoformat() if poll.created_at else datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()



def get_active_poll(room_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        poll = db.query(PollRecord).filter(
            PollRecord.room_id == str(room_id),
            PollRecord.is_active == True,
        ).order_by(PollRecord.created_at.desc()).first()
        return get_poll_results(poll.id) if poll else None
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Attendance & Student Metrics Helpers
# ──────────────────────────────────────────────────────────────────────────────

def record_attendance_join(room_id: str, username: str):
    if not username or username in ("System", "Teacher", "Instructor"):
        return
    db = SessionLocal()
    try:
        # Check if an open attendance session exists
        existing = db.query(AttendanceRecord).filter(
            AttendanceRecord.room_id == str(room_id),
            AttendanceRecord.username == username,
            AttendanceRecord.left_at.is_(None),
        ).first()

        if not existing:
            rec = AttendanceRecord(
                room_id=str(room_id),
                username=username,
                joined_at=datetime.now(timezone.utc),
                total_messages=0,
                polls_voted=0,
            )
            db.add(rec)
            db.commit()
    finally:
        db.close()


def record_attendance_leave(room_id: str, username: str):
    if not username or username in ("System", "Teacher", "Instructor"):
        return
    db = SessionLocal()
    try:
        existing = db.query(AttendanceRecord).filter(
            AttendanceRecord.room_id == str(room_id),
            AttendanceRecord.username == username,
            AttendanceRecord.left_at.is_(None),
        ).order_by(AttendanceRecord.joined_at.desc()).first()

        if existing:
            existing.left_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def get_room_attendance(room_id: str) -> List[dict]:
    db = SessionLocal()
    try:
        records = db.query(AttendanceRecord).filter(
            AttendanceRecord.room_id == str(room_id)
        ).order_by(AttendanceRecord.joined_at.desc()).all()
        return [
            {
                "id": r.id,
                "room_id": r.room_id,
                "username": r.username,
                "joined_at": r.joined_at.isoformat() if r.joined_at else "",
                "left_at": r.left_at.isoformat() if r.left_at else None,
                "total_messages": r.total_messages,
                "polls_voted": r.polls_voted,
            }
            for r in records
        ]
    finally:
        db.close()


def increment_attendance_messages(room_id: str, username: str):
    if not username or username in ("System", "Teacher", "Instructor", "Anonymous"):
        return
    db = SessionLocal()
    try:
        att = db.query(AttendanceRecord).filter(
            AttendanceRecord.room_id == str(room_id),
            AttendanceRecord.username == username,
        ).order_by(AttendanceRecord.joined_at.desc()).first()
        if att:
            att.total_messages += 1
            db.commit()
    finally:
        db.close()


def increment_attendance_votes(room_id: str, username: str):
    if not username or username in ("System", "Teacher", "Instructor", "Anonymous"):
        return
    db = SessionLocal()
    try:
        att = db.query(AttendanceRecord).filter(
            AttendanceRecord.room_id == str(room_id),
            AttendanceRecord.username == username,
        ).order_by(AttendanceRecord.joined_at.desc()).first()
        if att:
            att.polls_voted += 1
            db.commit()
    finally:
        db.close()



def get_student_metrics(room_id: str) -> List[dict]:
    """
    Aggregates student metrics: message counts, questions asked, poll participation,
    and dynamically assigned badges.
    """
    db = SessionLocal()
    try:
        # Get all attendance records for this room
        attendance_rows = db.query(AttendanceRecord).filter(AttendanceRecord.room_id == str(room_id)).all()
        # Also get all messages
        messages = db.query(MessageRecord).filter(MessageRecord.room_id == str(room_id)).all()
        # Active polls count
        total_polls = db.query(PollRecord).filter(PollRecord.room_id == str(room_id)).count()

        user_stats: Dict[str, dict] = {}

        for att in attendance_rows:
            if att.username in ("System", "Teacher", "Instructor", "Anonymous"):
                continue
            if att.username not in user_stats:
                user_stats[att.username] = {
                    "username": att.username,
                    "message_count": 0,
                    "doubt_count": 0,
                    "questions_asked": [],
                    "polls_voted": 0,
                    "joined_at": att.joined_at.isoformat() if att.joined_at else "",
                    "is_online": att.left_at is None,
                }
            user_stats[att.username]["polls_voted"] = max(user_stats[att.username]["polls_voted"], att.polls_voted)

        # Count from messages
        for msg in messages:
            u = msg.username
            if u in ("System", "Teacher", "Instructor", "Anonymous"):
                continue
            if u not in user_stats:
                user_stats[u] = {
                    "username": u,
                    "message_count": 0,
                    "doubt_count": 0,
                    "questions_asked": [],
                    "polls_voted": 0,
                    "joined_at": msg.timestamp.isoformat(),
                    "is_online": True,
                }
            user_stats[u]["message_count"] += 1
            if msg.is_doubt:
                user_stats[u]["doubt_count"] += 1
                if not msg.is_anonymous:
                    user_stats[u]["questions_asked"].append(msg.message)
            elif "?" in msg.message and not msg.is_anonymous:
                user_stats[u]["questions_asked"].append(msg.message)

        # Assign Dynamic Badges:
        # - Inquisitive: Asked doubts or 2+ questions
        # - Highly Active: > 5 messages
        # - Engaged Voter: Voted in polls
        # - Observer: Joined but few messages
        metrics_list = []
        for u, stats in user_stats.items():
            badge = "Observer"
            if stats["doubt_count"] > 0 or len(stats["questions_asked"]) >= 2:
                badge = "Inquisitive"
            elif stats["message_count"] >= 5:
                badge = "Highly Active"
            elif stats["polls_voted"] > 0 or (total_polls > 0 and stats["polls_voted"] >= total_polls):
                badge = "Engaged Voter"

            metrics_list.append({
                "username": u,
                "message_count": stats["message_count"],
                "doubt_count": stats["doubt_count"],
                "questions_asked": stats["questions_asked"][:5],
                "polls_voted": stats["polls_voted"],
                "voted": stats["polls_voted"] > 0,
                "badge": badge,
                "is_online": stats["is_online"],
                "joined_at": stats["joined_at"],
            })

        return sorted(metrics_list, key=lambda x: (x["message_count"] + x["polls_voted"] * 2), reverse=True)
    finally:
        db.close()


def export_attendance_csv(room_id: str) -> str:
    """
    Generates CSV formatted text for room attendance and metrics.
    """
    metrics = get_student_metrics(room_id)
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Room ID",
        "Student Username",
        "Badge / Persona",
        "Total Messages",
        "Doubts / Questions Asked",
        "Polls Participated",
        "Status",
        "Joined At",
    ])

    for m in metrics:
        writer.writerow([
            room_id,
            m["username"],
            m["badge"],
            m["message_count"],
            m["doubt_count"] or len(m["questions_asked"]),
            m["polls_voted"],
            "Active Online" if m.get("is_online") else "Left Session",
            m.get("joined_at", ""),
        ])

    return output.getvalue()


# ──────────────────────────────────────────────────────────────────────────────
# Insights CRUD Helpers
# ──────────────────────────────────────────────────────────────────────────────

def save_insight(
    room_id: str,
    summary: str,
    sentiment: str,
    friction_points: Union[List[str], str],
    recommendation: str,
    raw_json: Optional[str] = None,
) -> dict:
    db = SessionLocal()
    try:
        friction_str = json.dumps(friction_points) if isinstance(friction_points, list) else str(friction_points)
        rec = InsightRecord(
            room_id=str(room_id),
            summary=summary,
            sentiment=sentiment,
            friction_points=friction_str,
            recommendation=recommendation,
            raw_json=raw_json,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return {
            "id": rec.id,
            "room_id": rec.room_id,
            "summary": rec.summary,
            "sentiment": rec.sentiment,
            "friction_points": friction_points if isinstance(friction_points, list) else json.loads(friction_str),
            "recommendation": rec.recommendation,
            "timestamp": rec.timestamp.isoformat(),
        }
    finally:
        db.close()


def get_latest_insight(room_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        rec = db.query(InsightRecord).filter(
            InsightRecord.room_id == str(room_id)
        ).order_by(InsightRecord.timestamp.desc()).first()
        if not rec:
            return None
        f_points = []
        if rec.friction_points:
            try:
                f_points = json.loads(rec.friction_points)
            except Exception:
                f_points = [rec.friction_points]
        return {
            "id": rec.id,
            "room_id": rec.room_id,
            "summary": rec.summary,
            "sentiment": rec.sentiment,
            "friction_points": f_points,
            "recommendation": rec.recommendation or "",
            "timestamp": rec.timestamp.isoformat(),
        }
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Schedule & Push CRUD Helpers (Preserved)
# ──────────────────────────────────────────────────────────────────────────────

def schedule_to_dict(s: ClassSchedule) -> dict:
    return {
        "id": s.id,
        "room_id": s.room_id,
        "title": s.title,
        "description": s.description or "",
        "scheduled_at": s.scheduled_at.isoformat(),
        "duration_minutes": s.duration_minutes,
        "created_by": s.created_by,
        "role": s.role,
        "created_at": s.created_at.isoformat(),
    }


def create_schedule(
    room_id: str,
    title: str,
    scheduled_at: datetime,
    created_by: str,
    role: str = "teacher",
    description: str = "",
    duration_minutes: int = 60,
) -> dict:
    db = SessionLocal()
    try:
        record = ClassSchedule(
            room_id=str(room_id),
            title=title,
            description=description,
            scheduled_at=scheduled_at,
            duration_minutes=duration_minutes,
            created_by=created_by,
            role=role,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return schedule_to_dict(record)
    finally:
        db.close()


def get_schedules(room_id: Optional[str] = None) -> List[dict]:
    db = SessionLocal()
    try:
        q = db.query(ClassSchedule)
        if room_id:
            q = q.filter(ClassSchedule.room_id == str(room_id))
        records = q.order_by(ClassSchedule.scheduled_at.asc()).all()
        return [schedule_to_dict(r) for r in records]
    finally:
        db.close()


def delete_schedule(schedule_id: int) -> bool:
    db = SessionLocal()
    try:
        record = db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).first()
        if not record:
            return False
        db.delete(record)
        db.commit()
        return True
    finally:
        db.close()


def get_schedules_due_for_reminder(within_minutes: int = 5) -> List[ClassSchedule]:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        target = now + timedelta(minutes=within_minutes)
        return db.query(ClassSchedule).filter(
            ClassSchedule.reminder_sent == False,
            ClassSchedule.scheduled_at >= now,
            ClassSchedule.scheduled_at <= target,
        ).all()
    finally:
        db.close()


def mark_reminder_sent(schedule_id: int):
    db = SessionLocal()
    try:
        rec = db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).first()
        if rec:
            rec.reminder_sent = True
            db.commit()
    finally:
        db.close()


def upsert_push_subscription(
    endpoint: str,
    keys_auth: str,
    keys_p256dh: str,
    username: str,
    role: str = "student",
    room_id: Optional[str] = None,
) -> dict:
    db = SessionLocal()
    try:
        sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if sub:
            sub.keys_auth = keys_auth
            sub.keys_p256dh = keys_p256dh
            sub.username = username
            sub.role = role
            sub.room_id = str(room_id) if room_id else None
        else:
            sub = PushSubscription(
                endpoint=endpoint,
                keys_auth=keys_auth,
                keys_p256dh=keys_p256dh,
                username=username,
                role=role,
                room_id=str(room_id) if room_id else None,
            )
            db.add(sub)
        db.commit()
        db.refresh(sub)
        return {"id": sub.id, "endpoint": sub.endpoint, "username": sub.username}
    finally:
        db.close()


def delete_push_subscription(endpoint: str) -> bool:
    db = SessionLocal()
    try:
        sub = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if not sub:
            return False
        db.delete(sub)
        db.commit()
        return True
    finally:
        db.close()


def get_all_push_subscriptions(role: Optional[str] = None, room_id: Optional[str] = None) -> List[PushSubscription]:
    db = SessionLocal()
    try:
        q = db.query(PushSubscription)
        if role:
            q = q.filter(PushSubscription.role == role)
        if room_id:
            q = q.filter((PushSubscription.room_id == str(room_id)) | (PushSubscription.room_id.is_(None)))
        return q.all()
    finally:
        db.close()


def get_user_subscription(clerk_user_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        sub = db.query(UserSubscription).filter(UserSubscription.clerk_user_id == clerk_user_id).first()
        if not sub:
            return None
        return {
            "clerk_user_id": sub.clerk_user_id,
            "customer_email": sub.customer_email,
            "plan": sub.plan,
            "status": sub.status,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        }
    finally:
        db.close()


def upsert_user_subscription(
    clerk_user_id: str,
    customer_email: str,
    plan: str,
    status: str = "active",
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    current_period_end: Optional[datetime] = None,
) -> dict:
    db = SessionLocal()
    try:
        sub = db.query(UserSubscription).filter(UserSubscription.clerk_user_id == clerk_user_id).first()
        if sub:
            sub.customer_email = customer_email
            sub.plan = plan
            sub.status = status
            if stripe_customer_id:
                sub.stripe_customer_id = stripe_customer_id
            if stripe_subscription_id:
                sub.stripe_subscription_id = stripe_subscription_id
            if current_period_end:
                sub.current_period_end = current_period_end
        else:
            sub = UserSubscription(
                clerk_user_id=clerk_user_id,
                customer_email=customer_email,
                plan=plan,
                status=status,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
                current_period_end=current_period_end,
            )
            db.add(sub)
        db.commit()
        db.refresh(sub)
        return {
            "clerk_user_id": sub.clerk_user_id,
            "customer_email": sub.customer_email,
            "plan": sub.plan,
            "status": sub.status,
        }
    finally:
        db.close()


def record_shared_file(room_id: str, filename: str, file_url: str, file_size: int = 0, uploader: str = "Instructor") -> dict:
    db = SessionLocal()
    try:
        rec = SharedFileRecord(
            room_id=str(room_id),
            filename=filename,
            file_url=file_url,
            file_size=file_size,
            uploader=uploader,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return {
            "id": rec.id,
            "room_id": rec.room_id,
            "filename": rec.filename,
            "file_url": rec.file_url,
            "file_size": rec.file_size,
            "uploader": rec.uploader,
            "created_at": rec.created_at.isoformat(),
        }
    finally:
        db.close()


def get_room_shared_files(room_id: str) -> List[dict]:
    db = SessionLocal()
    try:
        records = db.query(SharedFileRecord).filter(
            SharedFileRecord.room_id == str(room_id)
        ).order_by(SharedFileRecord.created_at.desc()).all()
        return [
            {
                "id": r.id,
                "room_id": r.room_id,
                "filename": r.filename,
                "file_url": r.file_url,
                "file_size": r.file_size,
                "uploader": r.uploader,
                "created_at": r.created_at.isoformat(),
            }
            for r in records
        ]
    finally:
        db.close()


def get_admin_dashboard_stats() -> dict:
    db = SessionLocal()
    try:
        total_rooms = db.query(Room).count()
        total_messages = db.query(MessageRecord).count()
        total_doubts = db.query(MessageRecord).filter(MessageRecord.is_doubt == True).count()
        total_polls = db.query(PollRecord).count()
        total_attendees = db.query(AttendanceRecord.username).distinct().count()
        
        return {
            "total_rooms": total_rooms,
            "total_messages": total_messages,
            "total_doubts": total_doubts,
            "total_polls": total_polls,
            "total_attendees": total_attendees,
        }
    finally:
        db.close()


def get_room_plan_limits(room_id: str) -> dict:
    from stripe_service import PLAN_LIMITS
    db = SessionLocal()
    try:
        room = db.query(Room).filter(Room.id == str(room_id)).first()
        if not room or not room.teacher_id:
            return PLAN_LIMITS["free"]
        sub = db.query(UserSubscription).filter(UserSubscription.clerk_user_id == room.teacher_id).first()
        if not sub or sub.status != "active":
            return PLAN_LIMITS["free"]
        plan = sub.plan.lower() if sub.plan else "free"
        return PLAN_LIMITS.get(plan, PLAN_LIMITS["free"])
    except Exception:
        return PLAN_LIMITS["free"]
    finally:
        db.close()


def get_insights_count_today(room_id: str) -> int:
    db = SessionLocal()
    try:
        since = datetime.now(timezone.utc) - timedelta(days=1)
        return db.query(InsightRecord).filter(
            InsightRecord.room_id == str(room_id),
            InsightRecord.timestamp >= since,
        ).count()
    except Exception:
        return 0
    finally:
        db.close()