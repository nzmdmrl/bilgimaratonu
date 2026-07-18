from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum
from app.core.database import Base

class Badge(Base):
    """Rozet tanımları."""
    __tablename__ = "badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(50), unique=True, nullable=False)  # 'first_match', 'win_10' vs
    name = Column(String(100), nullable=False)
    description = Column(String(255), nullable=False)
    icon = Column(String(10), nullable=False)  # emoji
    category = Column(String(50), nullable=False)  # 'match', 'category', 'marathon'
    requirement = Column(Integer, default=0)  # Gerekli sayı
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class UserBadge(Base):
    """Kullanıcıların kazandığı rozetler."""
    __tablename__ = "user_badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    badge_id = Column(UUID(as_uuid=True), ForeignKey("badges.id"), nullable=False)
    earned_at = Column(DateTime(timezone=True), server_default=func.now())
    seen = Column(Boolean, default=False)  # Kullanıcı rozeti gördü mü?
