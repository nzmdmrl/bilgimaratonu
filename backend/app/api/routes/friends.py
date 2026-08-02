from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func, text as _t
from datetime import datetime, timedelta, timezone

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.friendship import Friendship
from app.models.notification import Notification
from app.services.settings import get_settings

router = APIRouter(prefix="/api/friends", tags=["friends"])


async def friend_count(db: AsyncSession, user_id) -> int:
    res = await db.execute(
        select(func.count()).select_from(Friendship).where(
            Friendship.status == "accepted",
            or_(Friendship.requester_id == user_id, Friendship.addressee_id == user_id),
        )
    )
    return int(res.scalar_one() or 0)


async def _relationship(db: AsyncSession, me, other_id):
    """me ile other_id arasındaki ilişki kaydı (varsa)."""
    res = await db.execute(
        select(Friendship).where(
            or_(
                and_(Friendship.requester_id == me, Friendship.addressee_id == other_id),
                and_(Friendship.requester_id == other_id, Friendship.addressee_id == me),
            )
        )
    )
    return res.scalar_one_or_none()


@router.get("/status/{username}")
async def status(username: str, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    other = (await db.execute(select(User).where(User.username == username, User.deleted_at == None))).scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if str(other.id) == str(current_user.id):
        return {"status": "self", "is_bot": bool(other.is_bot), "friend_count": await friend_count(db, other.id)}
    fr = await _relationship(db, current_user.id, other.id)
    st = "none"
    fid = None
    if fr:
        fid = str(fr.id)
        if fr.status == "accepted":
            st = "friends"
        elif str(fr.requester_id) == str(current_user.id):
            st = "request_sent"
        else:
            st = "request_received"
    return {
        "status": st,
        "friendship_id": fid,
        "is_bot": bool(other.is_bot),
        "friend_count": await friend_count(db, other.id),
    }


@router.post("/request/{username}")
async def send_request(username: str, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    other = (await db.execute(select(User).where(User.username == username, User.deleted_at == None))).scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    if str(other.id) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Kendine arkadaşlık isteği gönderemezsin.")
    if other.is_bot:
        raise HTTPException(status_code=400, detail="Botlara arkadaşlık isteği gönderilemez.")

    existing = await _relationship(db, current_user.id, other.id)
    if existing:
        if existing.status == "accepted":
            raise HTTPException(status_code=400, detail="Zaten arkadaşsınız.")
        raise HTTPException(status_code=400, detail="Zaten bekleyen bir istek var.")

    # Saatlik limit
    cfg = await get_settings(db, "friendship")
    limit = int(cfg.get("requests_per_hour", 5))
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    sent = (await db.execute(
        select(func.count()).select_from(Friendship).where(
            Friendship.requester_id == current_user.id,
            Friendship.created_at >= since,
        )
    )).scalar_one()
    if int(sent) >= limit:
        raise HTTPException(status_code=429, detail=f"Saatte en fazla {limit} arkadaşlık isteği gönderebilirsin.")

    fr = Friendship(requester_id=current_user.id, addressee_id=other.id, status="pending")
    db.add(fr)
    await db.flush()
    db.add(Notification(
        user_id=other.id,
        type="friend_request",
        title="🤝 Arkadaşlık İsteği",
        message=f"{current_user.username} sana arkadaşlık isteği gönderdi.",
        data={"from_user_id": str(current_user.id), "from_username": current_user.username, "friendship_id": str(fr.id)},
    ))
    await db.commit()
    return {"ok": True, "status": "request_sent", "friendship_id": str(fr.id)}


@router.post("/accept/{friendship_id}")
async def accept_request(friendship_id: str, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    fr = (await db.execute(select(Friendship).where(Friendship.id == friendship_id))).scalar_one_or_none()
    if not fr or str(fr.addressee_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="İstek bulunamadı.")
    if fr.status == "accepted":
        return {"ok": True, "status": "friends"}
    fr.status = "accepted"
    # İstek gönderene haber ver
    db.add(Notification(
        user_id=fr.requester_id,
        type="friend_accepted",
        title="🤝 Arkadaşlık Kabul Edildi",
        message=f"{current_user.username} arkadaşlık isteğini kabul etti.",
        data={"from_username": current_user.username},
    ))
    # İlgili istek bildirimini okundu işaretle
    await db.execute(_t(
        "UPDATE notifications SET is_read = true WHERE user_id = :uid AND type = 'friend_request' "
        "AND (data->>'friendship_id') = :fid"
    ), {"uid": str(current_user.id), "fid": str(fr.id)})
    await db.commit()
    return {"ok": True, "status": "friends"}


@router.post("/reject/{friendship_id}")
async def reject_request(friendship_id: str, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    fr = (await db.execute(select(Friendship).where(Friendship.id == friendship_id))).scalar_one_or_none()
    if not fr or str(fr.addressee_id) != str(current_user.id):
        raise HTTPException(status_code=404, detail="İstek bulunamadı.")
    await db.execute(_t(
        "UPDATE notifications SET is_read = true WHERE user_id = :uid AND type = 'friend_request' "
        "AND (data->>'friendship_id') = :fid"
    ), {"uid": str(current_user.id), "fid": str(fr.id)})
    await db.delete(fr)
    await db.commit()
    return {"ok": True, "status": "none"}


@router.delete("/{username}")
async def remove_friend(username: str, db: AsyncSession = Depends(get_db), current_user=Depends(get_current_user)):
    other = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if not other:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    fr = await _relationship(db, current_user.id, other.id)
    if fr:
        await db.delete(fr)
        await db.commit()
    return {"ok": True, "status": "none"}
