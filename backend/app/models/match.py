from sqlalchemy import Column, String, Boolean, Integer, DateTime, Float, Text, Enum, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class MatchStatus(str, enum.Enum):
    waiting = "waiting"
    in_progress = "in_progress"
    finished = "finished"
    cancelled = "cancelled"

class MatchType(str, enum.Enum):
    ranked = "ranked"
    casual = "casual"
    bot = "bot"
    category = "category"

class Match(Base):
    __tablename__ = "matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    player1_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    player2_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    winner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    match_type = Column(Enum(MatchType), default=MatchType.ranked)
    status = Column(Enum(MatchStatus), default=MatchStatus.waiting, index=True)

    # Kategori maçında dolu, genel maçta NULL (lig ayrımı için)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, index=True)
    
    # Sorular (JSON listesi — soru ID'leri)
    question_ids = Column(JSON, default=list)
    current_question_index = Column(Integer, default=0)
    
    # Skorlar
    player1_score = Column(Float, default=0.0)
    player2_score = Column(Float, default=0.0)
    
    # ELO değişimi
    player1_elo_before = Column(Float, nullable=True)
    player2_elo_before = Column(Float, nullable=True)
    player1_elo_after = Column(Float, nullable=True)
    player2_elo_after = Column(Float, nullable=True)
    
    # Joker/pas
    player1_jokers = Column(Integer, default=1)
    player2_jokers = Column(Integer, default=1)
    player1_passes = Column(Integer, default=1)
    player2_passes = Column(Integer, default=1)
    
    # Ayarlar
    total_questions = Column(Integer, default=15)
    time_per_question = Column(Integer, default=30)
    
    # Zamanlar
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    player1 = relationship("User", foreign_keys=[player1_id])
    player2 = relationship("User", foreign_keys=[player2_id])
    winner = relationship("User", foreign_keys=[winner_id])

class MatchAnswer(Base):
    __tablename__ = "match_answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    match_id = Column(UUID(as_uuid=True), ForeignKey("matches.id"), nullable=True, index=True)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    
    selected_answer = Column(String(1), nullable=True)  # A, B, C, D — null = süre doldu
    is_correct = Column(Boolean, nullable=True)
    points_earned = Column(Float, default=0.0)
    response_time_ms = Column(Integer, nullable=True)  # Kaç ms'de cevapladı
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
