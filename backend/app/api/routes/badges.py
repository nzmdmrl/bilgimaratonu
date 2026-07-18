from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.badge import Badge, UserBadge
from app.services.badge import get_user_badges

router = APIRouter(prefix="/api/badges", tags=["badges"])

@router.get("/my")
async def my_badges(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    badges = await get_user_badges(db, str(current_user.id))
    return {"badges": badges}

@router.get("/user/{username}")
async def user_badges(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        return {"badges": []}
    badges = await get_user_badges(db, str(user.id))
    return {"badges": badges}

@router.post("/mark-seen")
async def mark_seen(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await db.execute(
        update(UserBadge)
        .where(UserBadge.user_id == str(current_user.id), UserBadge.seen == False)
        .values(seen=True)
    )
    await db.commit()
    return {"ok": True}

@router.get("/all")
async def all_badges(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    result = await db.execute(text("SELECT code, name, icon, description, category FROM badges WHERE is_active = TRUE ORDER BY category, requirement"))
    rows = result.mappings().fetchall()
    return {"badges": [dict(r) for r in rows]}


@router.patch("/admin/{badge_code}/toggle")
async def toggle_badge(badge_code: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    await db.execute(text("UPDATE badges SET is_active = NOT is_active WHERE code = :code"), {"code": badge_code})
    await db.commit()
    return {"ok": True}

@router.get("/admin/all")
async def admin_all_badges(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Badge).where(Badge.is_active == True).order_by(Badge.category, Badge.requirement))
    badges = result.scalars().all()
    return {"badges": [{
        "code": b.code, "name": b.name, "icon": b.icon,
        "description": b.description, "category": b.category, "is_active": b.is_active
    } for b in badges]}
