import uuid
from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class SoloProgress(Base):
    """Kullanıcının solo level ilerlemesi — level başına en iyi yıldız."""
    __tablename__ = "solo_progress"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    level = Column(Integer, nullable=False)
    stars = Column(Integer, nullable=False, default=0)  # bu level için kazanılan en iyi yıldız (0-3)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "level", name="uq_solo_user_level"),
    )
