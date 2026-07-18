from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.models.page import StaticPage
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/pages", tags=["pages"])

@router.get("")
async def list_pages(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StaticPage).where(StaticPage.is_active == True))
    pages = result.scalars().all()
    return {"pages": [{"id": p.id, "title": p.title} for p in pages]}

@router.get("/slug/{slug}")
async def get_page_by_slug(slug: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    result = await db.execute(text("SELECT id, title, content FROM static_pages WHERE slug=:s AND is_active=true"), {"s": slug})
    row = result.mappings().fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Sayfa bulunamadı")
    return {"title": row["title"], "content": row["content"]}

@router.get("/{page_id}")
async def get_page(page_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StaticPage).where(StaticPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Sayfa bulunamadı.")
    return {"id": page.id, "title": page.title, "content": page.content}

class PageUpdate(BaseModel):
    title: str
    content: str
    is_active: bool = True

@router.put("/{page_id}")
async def update_page(
    page_id: str,
    req: PageUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    result = await db.execute(select(StaticPage).where(StaticPage.id == page_id))
    page = result.scalar_one_or_none()
    if not page:
        raise HTTPException(status_code=404, detail="Sayfa bulunamadı.")
    page.title = req.title
    page.content = req.content
    page.is_active = req.is_active
    await db.commit()
    return {"ok": True}
