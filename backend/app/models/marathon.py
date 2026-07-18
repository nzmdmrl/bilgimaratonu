from sqlalchemy import Column, String, Boolean, Integer, DateTime, Float, ForeignKey, JSON, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base

class MarathonStatus(str, enum.Enum):
    waiting    = "waiting"     # Lobi açık, katılım bekleniyor
    starting   = "starting"    # Doldu, başlıyor
    in_progress = "in_progress" # Turlar devam ediyor
    finished   = "finished"    # Bitti

class MarathonParticipantStatus(str, enum.Enum):
    active      = "active"       # Hâlâ yarışıyor
    eliminated  = "eliminated"   # Elendi
    champion    = "champion"     # Şampiyon (1.)
    second      = "second"       # 2.
    third       = "third"        # 3.

class Marathon(Base):
    __tablename__ = "marathons"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    status = Column(Enum(MarathonStatus), default=MarathonStatus.waiting, index=True)

    # Ayarlar
    max_participants = Column(Integer, default=128)
    current_round = Column(Integer, default=0)    # 0 = lobi, 1-7 = turlar
    total_rounds = Column(Integer, default=7)
    questions_per_round = Column(Integer, default=3)

    # Tur soru ID'leri — {round: [q_ids]} — aynı turdaki herkes aynı soruları görür
    round_questions = Column(JSON, default=dict)

    # Zamanlar
    lobby_opens_at = Column(DateTime(timezone=True), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    participants = relationship("MarathonParticipant", back_populates="marathon")

class MarathonParticipant(Base):
    __tablename__ = "marathon_participants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    marathon_id = Column(UUID(as_uuid=True), ForeignKey("marathons.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    status = Column(Enum(MarathonParticipantStatus), default=MarathonParticipantStatus.active)
    current_round = Column(Integer, default=0)
    total_score = Column(Integer, default=0)
    eliminated_at_round = Column(Integer, nullable=True)

    # XP ödülü
    xp_earned = Column(Integer, default=0)

    joined_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)

    marathon = relationship("Marathon", back_populates="participants")
    user = relationship("User")

class MarathonMatch(Base):
    """Maraton içindeki bireysel maçlar."""
    __tablename__ = "marathon_matches"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    marathon_id = Column(UUID(as_uuid=True), ForeignKey("marathons.id"), nullable=False, index=True)
    round_number = Column(Integer, nullable=False)

    player1_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    player2_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    winner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    player1_score = Column(Integer, default=0)
    player2_score = Column(Integer, default=0)

    status = Column(String(20), default="waiting")
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
