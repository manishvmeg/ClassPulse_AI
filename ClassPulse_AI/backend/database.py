import os
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import Column, DateTime, Integer, String, Text, create_engine
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