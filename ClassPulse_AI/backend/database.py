import json
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./classpulse.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


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
    options_json = Column(Text, nullable=False)  # JSON list of string options
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class VoteRecord(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, index=True, nullable=False)
    username = Column(String(64), nullable=False)
    selected_option = Column(String(256), nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# Initialize SQLite tables
Base.metadata.create_all(bind=engine)


def save_message(room_id: str, username: str, message: str, timestamp_str: Optional[str] = None):
    db = SessionLocal()
    try:
        ts = datetime.fromisoformat(timestamp_str) if timestamp_str else datetime.now(timezone.utc)
        record = MessageRecord(
            room_id=room_id,
            username=username,
            message=message,
            timestamp=ts,
        )
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
            {
                "username": rec.username,
                "message": rec.message,
                "timestamp": rec.timestamp.isoformat(),
            }
            for rec in records
        ]
    finally:
        db.close()


def create_poll(room_id: str, question: str, options: List[str]) -> dict:
    db = SessionLocal()
    try:
        # Deactivate previous active polls for this room
        db.query(PollRecord).filter(
            PollRecord.room_id == room_id,
            PollRecord.is_active == True
        ).update({"is_active": False})

        poll = PollRecord(
            room_id=room_id,
            question=question,
            options_json=json.dumps(options),
            is_active=True,
        )
        db.add(poll)
        db.commit()
        db.refresh(poll)

        return {
            "id": poll.id,
            "room_id": poll.room_id,
            "question": poll.question,
            "options": json.loads(poll.options_json),
            "is_active": poll.is_active,
            "votes": {opt: 0 for opt in options},
            "total_votes": 0,
        }
    finally:
        db.close()


def record_vote(poll_id: int, username: str, selected_option: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        poll = db.query(PollRecord).filter(PollRecord.id == poll_id, PollRecord.is_active == True).first()
        if not poll:
            return None

        # Check if student already voted in this poll; update if so, otherwise insert
        existing_vote = db.query(VoteRecord).filter(
            VoteRecord.poll_id == poll_id,
            VoteRecord.username == username
        ).first()

        if existing_vote:
            existing_vote.selected_option = selected_option
        else:
            vote = VoteRecord(
                poll_id=poll_id,
                username=username,
                selected_option=selected_option,
            )
            db.add(vote)

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
            "id": poll.id,
            "room_id": poll.room_id,
            "question": poll.question,
            "options": options,
            "is_active": poll.is_active,
            "votes": tally,
            "total_votes": len(votes),
        }
    finally:
        db.close()


def get_active_poll(room_id: str) -> Optional[dict]:
    db = SessionLocal()
    try:
        poll = db.query(PollRecord).filter(
            PollRecord.room_id == room_id,
            PollRecord.is_active == True
        ).order_by(PollRecord.created_at.desc()).first()

        if not poll:
            return None

        return get_poll_results(poll.id)
    finally:
        db.close()