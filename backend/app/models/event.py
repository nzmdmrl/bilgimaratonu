from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer, JSON, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
import enum
from app.core.database import Base

class EventType(str, enum.Enum):
    quiz = "quiz"       # Standart test
    duel = "duel"       # Anlık karşılıklı

class EventVisibility(str, enum.Enum):
    public = "public"       # Genel — listede görünür
    hidden = "hidden"       # Gizli — link ile
    private = "private"     # Şifreli — link + şifre

class ScoreboardType(str, enum.Enum):
    single = "single"       # Tek sonuç
    daily = "daily"         # Günlük
    monthly = "monthly"     # Aylık
    yearly = "yearly"       # Yıllık

class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(20), unique=True, nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    creator_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    # Tip ve görünürlük
    type = Column(String(10), default="quiz", nullable=False)
    visibility = Column(String(10), default="public", nullable=False)
    password = Column(String(100), nullable=True)  # Şifreli için

    # Skor tablosu türü
    scoreboard_type = Column(String(10), default="single", nullable=False)
    scoreboard_types = Column(JSON, default=list)  # ["all","daily","monthly","yearly"]

    # Soru ayarları
    max_participants = Column(Integer, default=1000)
    question_count = Column(Integer, default=15)
    category_ids = Column(JSON, default=list)       # [] = tüm kategoriler
    difficulty = Column(String(20), default="mixed")
    distribution = Column(JSON, default=dict)        # {easy:5, medium:5, hard:3, very_hard:2}
    time_limit_per_question = Column(Integer, default=30)  # saniye

    # Zaman
    start_at = Column(DateTime(timezone=True), nullable=True)   # NULL = hemen
    end_at = Column(DateTime(timezone=True), nullable=True)     # NULL = süresiz
    is_active = Column(Boolean, default=True)

    moderation_status = Column(String(20), default="approved")  # approved, pending, rejected
    moderation_reason = Column(String(500), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # İlişkiler
    questions = relationship("EventQuestion", back_populates="event", order_by="EventQuestion.order")
    participants = relationship("EventParticipant", back_populates="event")
    creator = relationship("User", foreign_keys=[creator_id])

class EventQuestion(Base):
    __tablename__ = "event_questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    order = Column(Integer, default=0)

    event = relationship("Event", back_populates="questions")
    question = relationship("Question")

class EventParticipant(Base):
    __tablename__ = "event_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), ForeignKey("events.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)  # NULL = misafir
    guest_name = Column(String(100), nullable=True)
    guest_token = Column(String(100), nullable=True, index=True)  # Misafir tanımlama

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    score = Column(Integer, default=0)
    correct_count = Column(Integer, default=0)
    total_time_seconds = Column(Integer, default=0)
    is_hidden = Column(Boolean, default=False)  # Kullanıcı sonucu gizledi mi

    # Günlük/aylık/yıllık dönem
    period_key = Column(String(20), nullable=True)  # '2026-06-22', '2026-06', '2026'

    event = relationship("Event", back_populates="participants")
    user = relationship("User", foreign_keys=[user_id])
    answers = relationship("EventAnswer", back_populates="participant")

class EventAnswer(Base):
    __tablename__ = "event_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id = Column(UUID(as_uuid=True), ForeignKey("event_participants.id"), nullable=False, index=True)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    selected_answer = Column(String(1), nullable=True)
    is_correct = Column(Boolean, default=False)
    response_time_ms = Column(Integer, nullable=True)

    participant = relationship("EventParticipant", back_populates="answers")
