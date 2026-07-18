from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.question import Category

router = APIRouter(prefix="/api/categories", tags=["categories"])

class CategoryResponse(BaseModel):
    id: str
    name: str
    slug: str
    icon: Optional[str]
    is_active: bool
    display_order: int
    in_general_match: bool
    has_category_match: bool

    class Config:
        from_attributes = True

class CategoryUpdate(BaseModel):
    in_general_match: Optional[bool] = None
    has_category_match: Optional[bool] = None
    is_active: Optional[bool] = None

@router.get("", response_model=List[CategoryResponse])
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category)
        .where(Category.is_active == True, Category.deleted_at == None)
        .order_by(Category.display_order)
    )
    categories = result.scalars().all()
    return [CategoryResponse(
        id=str(c.id),
        name=c.name,
        slug=c.slug,
        icon=c.icon,
        is_active=c.is_active,
        display_order=c.display_order,
        in_general_match=c.in_general_match if c.in_general_match is not None else True,
        has_category_match=c.has_category_match if c.has_category_match is not None else False,
    ) for c in categories]

@router.get("/all")
async def get_all_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Category)
        .where(Category.deleted_at == None)
        .order_by(Category.display_order)
    )
    categories = result.scalars().all()
    return {"categories": [CategoryResponse(
        id=str(c.id),
        name=c.name,
        slug=c.slug,
        icon=c.icon,
        is_active=c.is_active,
        display_order=c.display_order,
        in_general_match=c.in_general_match if c.in_general_match is not None else True,
        has_category_match=c.has_category_match if c.has_category_match is not None else False,
    ) for c in categories]}

@router.patch("/{category_id}")
async def update_category(
    category_id: str,
    req: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz")
    
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı")
    
    if req.in_general_match is not None:
        cat.in_general_match = req.in_general_match
    if req.has_category_match is not None:
        cat.has_category_match = req.has_category_match
    if req.is_active is not None:
        cat.is_active = req.is_active
    
    await db.commit()

    # Kategori maçı açıldıysa o kategori için rozetleri otomatik üret
    if cat.has_category_match:
        try:
            from app.services.badge import sync_category_badges
            await sync_category_badges(db, cat.slug, cat.name)
        except Exception as _e:
            print(f"[CATEGORY] Rozet senkron hatası: {_e}")

    return {"ok": True}
