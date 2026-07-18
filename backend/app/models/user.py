from sqlalchemy import Column, String, Boolean, Integer, DateTime, Float, Text, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(30), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=True)  # OAuth için null olabilir
    
    # Profil
    avatar_seed = Column(String(100), nullable=True)
    avatar_url = Column(String(500), nullable=True)
    
    # Durum
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    trust_level = Column(Integer, default=0)  # 0-4
    
    # Oyun istatistikleri
    xp = Column(Integer, default=0)
    elo_rating = Column(Float, default=1000.0)
    total_matches = Column(Integer, default=0)
    total_wins = Column(Integer, default=0)
    total_losses = Column(Integer, default=0)
    
    # Profil kalitesi
    profile_quality = Column(Integer, default=0)  # 0-100
    
    # Zaman damgaları
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)  # Soft delete
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    
    # Bot
    is_bot = Column(Boolean, default=False)

    # OAuth
    google_id = Column(String(100), nullable=True, unique=True)
    apple_id = Column(String(100), nullable=True, unique=True)
    
    def __repr__(self):
        return f"<User {self.username}>"
