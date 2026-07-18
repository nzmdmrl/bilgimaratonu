from sqlalchemy import Column, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class StaticPage(Base):
    __tablename__ = "static_pages"

    id = Column(String(50), primary_key=True)  # slug: hakkimizda, kurallar, kvkk vs
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
