from sqlalchemy import Column, String, Boolean, Integer, DateTime, Float, Text, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum

from app.core.database import Base

class DifficultyLevel(str, enum.Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"
    very_hard = "very_hard"

class QuestionType(str, enum.Enum):
    multiple_choice = "multiple_choice"
    text_text = "text_text"
    image_text = "image_text"
    text_image = "text_image"
    image_image = "image_image"
    imagetext_text = "imagetext_text"
    imagetext_image = "imagetext_image"

class Category(Base):
    __tablename__ = "categories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    slug = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    icon = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    is_dynamic = Column(Boolean, default=False)  # Gündem kategorisi için
    display_order = Column(Integer, default=0)
    
    # Rozet eşiği (kaç doğru cevapta 1x rozet)
    mastery_threshold = Column(Integer, default=100)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    in_general_match = Column(Boolean, default=True)
    has_category_match = Column(Boolean, default=False)

    questions = relationship("Question", back_populates="category")

    def __repr__(self):
        return f"<Category {self.name}>"

class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False, index=True)
    
    difficulty = Column(Enum(DifficultyLevel), nullable=False, index=True)
    question_type = Column(Enum(QuestionType), nullable=False, default=QuestionType.multiple_choice)
    
    text = Column(Text, nullable=False)
    option_a = Column(String(500), nullable=False)
    option_b = Column(String(500), nullable=False)
    option_c = Column(String(500), nullable=True)  # D/Y sorularda null
    option_d = Column(String(500), nullable=True)  # D/Y sorularda null
    correct_answer = Column(String(1), nullable=False)
    question_image = Column(String(500), nullable=True)
    option_a_image = Column(String(500), nullable=True)
    option_b_image = Column(String(500), nullable=True)
    option_c_image = Column(String(500), nullable=True)
    option_d_image = Column(String(500), nullable=True)
    content_hash = Column(String(64), nullable=True, unique=True)  # A, B, C, D
    explanation = Column(Text, nullable=True)  # Solo modda gösterilir
    
    # Sponsored soru
    is_sponsored = Column(Boolean, default=False)
    sponsor_name = Column(String(200), nullable=True)
    
    # İstatistik
    times_shown = Column(Integer, default=0)
    times_correct = Column(Integer, default=0)
    
    # Durum
    is_active = Column(Boolean, default=True)
    is_approved = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    category = relationship("Category", back_populates="questions")

    def __repr__(self):
        return f"<Question {self.id} - {self.difficulty}>"
