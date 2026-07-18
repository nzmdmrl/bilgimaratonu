from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
import uuid

router = APIRouter(prefix="/api/announcements", tags=["announcements"])

@router.get("/active")
async def get_active(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text(
        "SELECT * FROM announcements WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1"
    ))
    row = result.mappings().fetchone()
    if not row:
        return {"announcement": None}
    return {"announcement": dict(row)}

@router.get("")
async def list_all(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    result = await db.execute(text("SELECT * FROM announcements ORDER BY created_at DESC"))
    rows = result.mappings().fetchall()
    return {"announcements": [dict(r) for r in rows]}

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    link_url: Optional[str] = ""
    link_label: Optional[str] = ""
    bg_color: str = "#FFD700"
    text_color: str = "#000000"
    is_active: bool = True

@router.post("")
async def create(req: AnnouncementCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    # Önce diğerlerini pasife al
    if req.is_active:
        await db.execute(text("UPDATE announcements SET is_active = FALSE"))
    aid = str(uuid.uuid4())
    await db.execute(text("""
        INSERT INTO announcements (id, title, content, link_url, link_label, bg_color, text_color, is_active)
        VALUES (:id, :title, :content, :link_url, :link_label, :bg_color, :text_color, :is_active)
    """), {"id": aid, "title": req.title, "content": req.content,
          "link_url": req.link_url, "link_label": req.link_label,
          "bg_color": req.bg_color, "text_color": req.text_color, "is_active": req.is_active})
    await db.commit()
    return {"ok": True, "id": aid}

@router.put("/{aid}")
async def update(aid: str, req: AnnouncementCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    if req.is_active:
        await db.execute(text("UPDATE announcements SET is_active = FALSE WHERE id != :id"), {"id": aid})
    await db.execute(text("""
        UPDATE announcements SET title=:title, content=:content, link_url=:link_url,
        link_label=:link_label, bg_color=:bg_color, text_color=:text_color, is_active=:is_active
        WHERE id=:id
    """), {"id": aid, "title": req.title, "content": req.content,
          "link_url": req.link_url, "link_label": req.link_label,
          "bg_color": req.bg_color, "text_color": req.text_color, "is_active": req.is_active})
    await db.commit()
    return {"ok": True}

@router.delete("/{aid}")
async def delete(aid: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    await db.execute(text("DELETE FROM announcements WHERE id=:id"), {"id": aid})
    await db.commit()
    return {"ok": True}
