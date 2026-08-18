import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine
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
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ──────────────────────────────────────────────────────────────────────────────
# ORM Models
# ──────────────────────────────────────────────────────────────────────────────

class RoomRecord(Base):
    """Classroom metadata and management."""
    __tablename__ = "rooms"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(256), default="Interactive Classroom")
    teacher_id = Column(String(128), nullable=True, index=True)
    teacher_name = Column(String(64), default="Instructor")
    is_locked = Column(Boolean, default=False)
    max_students = Column(Integer, default=500)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class MessageRecord(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(64), index=True, nullable=False)
    username = Column(String(64), nullable=False)
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class InsightRecord(Base):
    __tablename__ = "insights"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(64), index=True, nullable=False)
    raw_json = Column(Text, nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class PollRecord(Base):
    __tablename__ = "polls"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(64), index=True, nullable=False)
    question = Column(Text, nullable=False)
    options_json = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class VoteRecord(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, index=True, nullable=False)
    username = Column(String(64), nullable=False)
    selected_option = Column(String(256), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


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



# ──────────────────────────────────────────────────────────────────────────────
# Existing CRUD helpers (unchanged)
# ──────────────────────────────────────────────────────────────────────────────

def save_message(room_id: str, username: str, message: str, timestamp_str: Optional[str] = None):
    db = SessionLocal()
    try:
        ts = datetime.fromisoformat(timestamp_str) if timestamp_str else datetime.now(timezone.utc)
        record = MessageRecord(room_id=room_id, username=username, message=message, timestamp=ts)
        db.add(record)
        db.commit()
    finally:
        db.close()


def get_stored_messages(
    room_id: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
) -> List[dict]:
    db = SessionLocal()
    try:
        query = db.query(MessageRecord).filter(MessageRecord.room_id == room_id)
        if start_time:
            query = query.filter(MessageRecord.timestamp >= datetime.fromisoformat(start_time))
        if end_time:
            query = query.filter(MessageRecord.timestamp <= datetime.fromisoformat(end_time))
        records = query.order_by(MessageRecord.timestamp.asc()).all()
        return [
            {"username": rec.username, "message": rec.message, "timestamp": rec.timestamp.isoformat()}
            for rec in records
        ]
    finally:
        db.close()


def create_poll(room_id: str, question: str, options: List[str]) -> dict:
    db = SessionLocal()
    try:
        db.query(PollRecord).filter(PollRecord.room_id == room_id, PollRecord.is_active == True).update({"is_active": False})
        poll = PollRecord(room_id=room_id, question=question, options_json=json.dumps(options), is_active=True)
        db.add(poll)
        db.commit()
        db.refresh(poll)
        return {
            "id": poll.id, "room_id": poll.room_id, "question": poll.question,
            "options": json.loads(poll.options_json), "is_active": poll.is_active,
            "votes": {opt: 0 for opt in options}, "total_votes": 0,
        }
    finally:
        db.close()


def record_vote(poll_id: int, username: str, selected_option: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        poll = db.query(PollRecord).filter(PollRecord.id == poll_id, PollRecord.is_active == True).first()
        if not poll:
            return None
        existing_vote = db.query(VoteRecord).filter(VoteRecord.poll_id == poll_id, VoteRecord.username == username).first()
        if existing_vote:
            existing_vote.selected_option = selected_option
        else:
            db.add(VoteRecord(poll_id=poll_id, username=username, selected_option=selected_option))
        db.commit()
        return get_poll_results(poll_id)
    finally:
        db.close()


def get_poll_results(poll_id: int) -> Optional[dict]:
    db = SessionLocal()
    try:
        poll = db.query(PollRecord).filter(PollRecord.id == poll_id).first()
        if not poll:
            return None
        options = json.loads(poll.options_json)
        votes = db.query(VoteRecord).filter(VoteRecord.poll_id == poll_id).all()
        tally = {opt: 0 for opt in options}
        for v in votes:
            if v.selected_option in tally:
                tally[v.selected_option] += 1
        return {
            "id": poll.id, "room_id": poll.room_id, "question": poll.question,
            "options": options, "is_active": poll.is_active,
            "votes": tally, "total_votes": len(votes),
        }
    finally:
        db.close()


def get_active_poll(room_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        poll = db.query(PollRecord).filter(
            PollRecord.room_id == room_id, PollRecord.is_active == True
        ).order_by(PollRecord.created_at.desc()).first()
        return get_poll_results(poll.id) if poll else None
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Schedule CRUD helpers
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
            room_id=room_id,
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


def get_schedules(room_id: Optional[str] = None, upcoming_only: bool = False) -> List[dict]:
    db = SessionLocal()
    try:
        query = db.query(ClassSchedule)
        if room_id:
            query = query.filter(ClassSchedule.room_id == room_id)
        if upcoming_only:
            query = query.filter(ClassSchedule.scheduled_at >= datetime.now(timezone.utc))
        records = query.order_by(ClassSchedule.scheduled_at.asc()).all()
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


def get_schedules_due_for_reminder(window_start: datetime, window_end: datetime) -> List[ClassSchedule]:
    """Return schedules whose start time falls in the given window and haven't been reminded yet."""
    db = SessionLocal()
    try:
        return db.query(ClassSchedule).filter(
            ClassSchedule.scheduled_at >= window_start,
            ClassSchedule.scheduled_at <= window_end,
            ClassSchedule.reminder_sent == False,
        ).all()
    finally:
        db.close()


def mark_reminder_sent(schedule_id: int):
    db = SessionLocal()
    try:
        db.query(ClassSchedule).filter(ClassSchedule.id == schedule_id).update({"reminder_sent": True})
        db.commit()
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Push Subscription CRUD helpers
# ──────────────────────────────────────────────────────────────────────────────

def upsert_push_subscription(endpoint: str, auth: str, p256dh: str, username: str, role: str, room_id: Optional[str]) -> dict:
    db = SessionLocal()
    try:
        existing = db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).first()
        if existing:
            existing.keys_auth = auth
            existing.keys_p256dh = p256dh
            existing.username = username
            existing.role = role
            existing.room_id = room_id
        else:
            existing = PushSubscription(
                endpoint=endpoint, keys_auth=auth, keys_p256dh=p256dh,
                username=username, role=role, room_id=room_id,
            )
            db.add(existing)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


def delete_push_subscription(endpoint: str):
    db = SessionLocal()
    try:
        db.query(PushSubscription).filter(PushSubscription.endpoint == endpoint).delete()
        db.commit()
    finally:
        db.close()


def get_all_push_subscriptions() -> List[PushSubscription]:
    db = SessionLocal()
    try:
        return db.query(PushSubscription).all()
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Subscription CRUD helpers
# ──────────────────────────────────────────────────────────────────────────────

def upsert_user_subscription(
    clerk_user_id: str,
    customer_email: str,
    plan: str = "free",
    stripe_customer_id: Optional[str] = None,
    stripe_subscription_id: Optional[str] = None,
    status: str = "active",
    current_period_end: Optional[datetime] = None,
) -> dict:
    db = SessionLocal()
    try:
        sub = db.query(UserSubscription).filter(UserSubscription.clerk_user_id == clerk_user_id).first()
        if not sub:
            sub = UserSubscription(
                clerk_user_id=clerk_user_id,
                customer_email=customer_email,
                plan=plan,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=stripe_subscription_id,
                status=status,
                current_period_end=current_period_end,
            )
            db.add(sub)
        else:
            sub.customer_email = customer_email
            sub.plan = plan
            if stripe_customer_id:
                sub.stripe_customer_id = stripe_customer_id
            if stripe_subscription_id:
                sub.stripe_subscription_id = stripe_subscription_id
            sub.status = status
            if current_period_end:
                sub.current_period_end = current_period_end
        db.commit()
        db.refresh(sub)
        return {
            "clerk_user_id": sub.clerk_user_id,
            "plan": sub.plan,
            "status": sub.status,
            "stripe_customer_id": sub.stripe_customer_id,
        }
    finally:
        db.close()


def get_user_subscription(clerk_user_id: str) -> dict:
    db = SessionLocal()
    try:
        sub = db.query(UserSubscription).filter(UserSubscription.clerk_user_id == clerk_user_id).first()
        if not sub:
            return {"plan": "free", "status": "active", "stripe_customer_id": None}
        return {
            "clerk_user_id": sub.clerk_user_id,
            "customer_email": sub.customer_email,
            "plan": sub.plan,
            "status": sub.status,
            "stripe_customer_id": sub.stripe_customer_id,
            "current_period_end": sub.current_period_end.isoformat() if sub.current_period_end else None,
        }
    finally:
        db.close()


# ──────────────────────────────────────────────────────────────────────────────
# Shared Files CRUD helpers
# ──────────────────────────────────────────────────────────────────────────────

def record_shared_file(room_id: str, filename: str, file_url: str, file_size: int, uploader: str = "Instructor") -> dict:
    db = SessionLocal()
    try:
        record = SharedFileRecord(
            room_id=room_id,
            filename=filename,
            file_url=file_url,
            file_size=file_size,
            uploader=uploader,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return {
            "id": record.id,
            "room_id": record.room_id,
            "filename": record.filename,
            "file_url": record.file_url,
            "file_size": record.file_size,
            "uploader": record.uploader,
            "created_at": record.created_at.isoformat(),
        }
    finally:
        db.close()


def get_room_shared_files(room_id: str) -> List[dict]:
    db = SessionLocal()
    try:
        records = db.query(SharedFileRecord).filter(SharedFileRecord.room_id == room_id).order_by(SharedFileRecord.created_at.desc()).all()
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


# ──────────────────────────────────────────────────────────────────────────────
# Admin & Analytics Queries
# ──────────────────────────────────────────────────────────────────────────────

def get_admin_dashboard_stats() -> dict:
    db = SessionLocal()
    try:
        # Get all unique room IDs from messages, schedules, and polls
        room_ids = set()
        for r in db.query(MessageRecord.room_id).distinct():
            room_ids.add(r[0])
        for r in db.query(ClassSchedule.room_id).distinct():
            room_ids.add(r[0])

        room_stats = []
        for rid in sorted(room_ids):
            msg_count = db.query(MessageRecord).filter(MessageRecord.room_id == rid).count()
            student_count = db.query(MessageRecord.username).filter(MessageRecord.room_id == rid).distinct().count()
            room_stats.append({
                "room_id": rid,
                "message_count": msg_count,
                "student_count": student_count,
            })

        total_messages = db.query(MessageRecord).count()
        total_students = db.query(MessageRecord.username).distinct().count()
        total_polls = db.query(PollRecord).count()
        total_schedules = db.query(ClassSchedule).count()

        return {
            "rooms": room_stats,
            "total_rooms": len(room_ids),
            "total_messages": total_messages,
            "total_students": total_students,
            "total_polls": total_polls,
            "total_schedules": total_schedules,
        }
    finally:
        db.close()