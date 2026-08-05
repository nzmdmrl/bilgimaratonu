from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, text as _t
from pydantic import BaseModel
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notification import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class TitleNotifRequest(BaseModel):
    title: str
    icon: str = "🎉"


@router.post("/title")
async def create_title_notification(req: TitleNotifRequest, db: AsyncSession = Depends(get_db),
                                    current_user = Depends(get_current_user)):
    """Yeni ünvan kazanıldığında bildirim oluştur (aynı ünvan için tekrar oluşturmaz)."""
    tname = (req.title or "").strip()[:80]
    if not tname:
        return {"ok": False}
    # Aynı ünvan bildirimi zaten varsa tekrar ekleme
    exists = (await db.execute(_t(
        "SELECT 1 FROM notifications WHERE user_id = :uid AND type = 'title' "
        "AND (data->>'title') = :t LIMIT 1"
    ), {"uid": str(current_user.id), "t": tname})).first()
    if exists:
        return {"ok": True, "duplicate": True}
    db.add(Notification(
        user_id=current_user.id,
        type="title",
        title="🎉 Yeni Ünvan!",
        message=f"{tname} ünvanını kazandın!",
        data={"title": tname, "icon": req.icon or "🎉", "username": current_user.username},
    ))
    await db.commit()
    return {"ok": True}

@router.get("/")
async def get_notifications(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    notifs = result.scalars().all()
    return {"notifications": [
        {
            "id": str(n.id),
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "data": n.data,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        } for n in notifs
    ]}

@router.get("/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    # Hafif presence heartbeat — admin "online" istatistigi icin (60sn'de bir cagrilir)
    from sqlalchemy import text as _t
    try:
        await db.execute(_t("UPDATE users SET last_seen_at = NOW() WHERE id = :uid"), {"uid": str(current_user.id)})
        await db.commit()
    except Exception:
        pass
    result = await db.execute(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
    )
    return {"count": result.scalar_one()}

@router.post("/{notif_id}/read")
async def mark_read(notif_id: str, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    await db.execute(
        update(Notification)
        .where(Notification.id == notif_id, Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}

@router.post("/read-all")
async def mark_all_read(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id)
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}
