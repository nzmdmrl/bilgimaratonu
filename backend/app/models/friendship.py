from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Friendship(Base):
    __tablename__ = "friendships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    requester_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    addressee_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending | accepted
    # Her taraf karşısını kendi grubuna koyar: aile | is | yakin | diger
    requester_type = Column(String(20), default="diger")
    addressee_type = Column(String(20), default="diger")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_friend_pair"),
    )
