from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.models.blog import BlogPost
from app.core.deps import get_current_user
from app.models.user import User
import uuid, re

router = APIRouter(prefix="/api/blog", tags=["blog"])

def slugify(text: str) -> str:
    tr_map = str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosucgiosu')
    text = text.translate(tr_map).lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    return re.sub(r'[\s-]+', '-', text).strip('-')[:80]

@router.get("")
async def list_posts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BlogPost).where(BlogPost.is_active == True)
        .order_by(BlogPost.created_at.desc())
    )
    posts = result.scalars().all()
    return {"posts": [{
        "id": p.id, "slug": p.slug, "title": p.title,
        "summary": p.summary, "cover_image": p.cover_image,
        "view_count": p.view_count,
        "created_at": p.created_at.strftime("%d.%m.%Y") if p.created_at else ""
    } for p in posts]}

@router.get("/{slug}")
async def get_post(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BlogPost).where(BlogPost.slug == slug))
    post = result.scalar_one_or_none()
    if not post or not post.is_active:
        raise HTTPException(status_code=404, detail="Yazı bulunamadı.")
    post.view_count += 1
    await db.commit()
    return {
        "id": post.id, "slug": post.slug, "title": post.title,
        "summary": post.summary, "content": post.content,
        "cover_image": post.cover_image, "view_count": post.view_count,
        "created_at": post.created_at.strftime("%d.%m.%Y") if post.created_at else ""
    }

class PostCreate(BaseModel):
    title: str
    summary: Optional[str] = ""
    content: str
    cover_image: Optional[str] = ""
    is_active: bool = True

@router.post("")
async def create_post(
    req: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    slug = slugify(req.title)
    # Benzersiz slug
    base = slug
    i = 1
    while (await db.execute(select(BlogPost).where(BlogPost.slug == slug))).scalar_one_or_none():
        slug = f"{base}-{i}"; i += 1
    post = BlogPost(id=str(uuid.uuid4()), slug=slug, title=req.title,
        summary=req.summary, content=req.content,
        cover_image=req.cover_image, is_active=req.is_active)
    db.add(post)
    await db.commit()
    return {"ok": True, "slug": slug}

@router.put("/{post_id}")
async def update_post(
    post_id: str,
    req: PostCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Bulunamadı.")
    post.title = req.title
    post.summary = req.summary
    post.content = req.content
    post.cover_image = req.cover_image
    post.is_active = req.is_active
    await db.commit()
    return {"ok": True}

@router.delete("/{post_id}")
async def delete_post(
    post_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    result = await db.execute(select(BlogPost).where(BlogPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Bulunamadı.")
    post.is_active = False
    await db.commit()
    return {"ok": True}
