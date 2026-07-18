# YOL: backend/app/models/league.py
from sqlalchemy import Column, String, Integer, DateTime, Float, ForeignKey, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base

class DailyScore(Base):
    """Her kullanıcının günlük en yüksek maç puanı.
    category_id NULL  -> genel lig (karışık kategorili genel maçlar)
    category_id dolu  -> o kategorinin ligi
    """
    __tablename__ = "daily_scores"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, index=True)
    score_date = Column(Date, nullable=False, index=True)
    best_score = Column(Float, default=0.0)
    match_id = Column(UUID(as_uuid=True), ForeignKey("matches.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class LeagueEntry(Base):
    """Günlük/aylık/yıllık lig birikimli puanları.
    category_id NULL  -> genel lig
    category_id dolu  -> kategori ligi
    """
    __tablename__ = "league_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, index=True)
    period_type = Column(String(10), nullable=False)
    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=True)
    period_day = Column(Integer, nullable=True)
    total_score = Column(Float, default=0.0)
    days_played = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
