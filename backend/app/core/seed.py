from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.question import Category

INITIAL_CATEGORIES = [
    {"name": "Tarih", "slug": "tarih", "icon": "🏛️", "display_order": 1},
    {"name": "Coğrafya", "slug": "cografya", "icon": "🌍", "display_order": 2},
    {"name": "Spor", "slug": "spor", "icon": "⚽", "display_order": 3},
    {"name": "Bilim", "slug": "bilim", "icon": "🔬", "display_order": 4},
    {"name": "Sanat & Edebiyat", "slug": "sanat-edebiyat", "icon": "🎨", "display_order": 5},
    {"name": "Sinema & Dizi", "slug": "sinema-dizi", "icon": "🎬", "display_order": 6},
    {"name": "Müzik", "slug": "muzik", "icon": "🎵", "display_order": 7},
    {"name": "Genel Kültür", "slug": "genel-kultur", "icon": "💡", "display_order": 8},
    {"name": "Matematik", "slug": "matematik", "icon": "🔢", "display_order": 9},
    {"name": "Gündem", "slug": "gundem", "icon": "📰", "display_order": 10, "is_dynamic": True},
]

async def seed_categories(db: AsyncSession):
    result = await db.execute(select(Category))
    existing = result.scalars().all()
    if existing:
        print(f"Kategoriler zaten mevcut ({len(existing)} adet), seed atlandı.")
        return

    for cat_data in INITIAL_CATEGORIES:
        category = Category(**cat_data)
        db.add(category)
    
    await db.commit()
    print(f"{len(INITIAL_CATEGORIES)} kategori eklendi.")
