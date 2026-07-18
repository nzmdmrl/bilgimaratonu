# YOL: backend/app/models/achievement.py
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.core.database import Base


class Achievement(Base):
    """Kazanılan başarılar — kupa / madalya / rozet tek tabloda.

    ach_type:
        'trophy' -> kupa (lig/maraton 1.'liği, rank=1)
        'medal'  -> madalya (lig/maraton 2.-3.'lüğü, rank=2|3)
        'badge'  -> rozet (kural bazlı başarı)

    period_type: 'daily'|'monthly'|'yearly'|'marathon' | None (rozetlerde None)
    category_id: hangi lig/kategori (None = genel lig veya kategoriden bağımsız rozet)
    rank:        1|2|3 (kupa/madalya); rozetlerde None
    period_key:  '2026-07-06' / '2026-07' / '2026' — tekrar vermeyi önler; rozetlerde None
    ach_code:    rozet kodu (badge'ler için, ör. 'first_match', 'cat_cografya_bilgini')
    """
    __tablename__ = "achievements"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    ach_type = Column(String(10), nullable=False)          # trophy | medal | badge
    ach_code = Column(String(50), nullable=True)           # rozet kodu; kupa/madalyada None
    period_type = Column(String(10), nullable=True)        # daily | monthly | yearly | marathon
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True, index=True)
    rank = Column(Integer, nullable=True)                  # 1 | 2 | 3
    period_key = Column(String(20), nullable=True)         # '2026-07-06' vb.
    earned_at = Column(DateTime(timezone=True), server_default=func.now())
    seen = Column(Boolean, default=False)
