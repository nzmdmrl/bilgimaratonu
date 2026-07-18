# YOL: backend/app/services/achievement.py
"""Kupa / madalya / rozet kazanımlarını achievements tablosuna yazan merkezi servis."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text as _t
from typing import Optional
import uuid as _uuid

from app.models.achievement import Achievement

_NULL_CAT = "00000000-0000-0000-0000-000000000000"


async def award_trophy_or_medal(
    db: AsyncSession,
    user_id: str,
    period_type: str,           # 'daily' | 'monthly' | 'yearly' | 'marathon'
    period_key: str,            # '2026-07-06' / '2026-07' / '2026'
    rank: int,                  # 1 | 2 | 3
    category_id: Optional[str] = None,  # None = genel lig
) -> bool:
    """Dönem sonu kupa (rank=1) / madalya (rank=2,3) yaz.
    Aynı dönem+lig+rank ikinci kez verilmez. Döner: True = yeni verildi."""
    ach_type = "trophy" if rank == 1 else "medal"
    cat = str(category_id) if category_id else None

    q = select(Achievement).where(
        Achievement.user_id == user_id,
        Achievement.ach_type == ach_type,
        Achievement.period_type == period_type,
        Achievement.rank == rank,
        Achievement.period_key == period_key,
    )
    q = q.where(Achievement.category_id.is_(None)) if cat is None else q.where(Achievement.category_id == cat)
    if (await db.execute(q)).scalar_one_or_none():
        return False

    await db.execute(_t("""
        INSERT INTO achievements (id, user_id, ach_type, period_type, category_id, rank, period_key)
        VALUES (:id, :uid, :atype, :ptype, :cat, :rank, :pkey)
        ON CONFLICT DO NOTHING
    """), {
        "id": str(_uuid.uuid4()), "uid": user_id, "atype": ach_type,
        "ptype": period_type, "cat": cat, "rank": rank, "pkey": period_key,
    })
    await db.commit()
    return True


async def award_badge_achievement(
    db: AsyncSession,
    user_id: str,
    ach_code: str,
) -> bool:
    """Rozet kazanımını achievements'a yaz (ach_type='badge').
    Aynı rozet ikinci kez verilmez. Döner: True = yeni verildi."""
    q = select(Achievement).where(
        Achievement.user_id == user_id,
        Achievement.ach_type == "badge",
        Achievement.ach_code == ach_code,
    )
    if (await db.execute(q)).scalar_one_or_none():
        return False

    await db.execute(_t("""
        INSERT INTO achievements (id, user_id, ach_type, ach_code)
        VALUES (:id, :uid, 'badge', :code)
        ON CONFLICT DO NOTHING
    """), {"id": str(_uuid.uuid4()), "uid": user_id, "code": ach_code})
    await db.commit()
    return True
