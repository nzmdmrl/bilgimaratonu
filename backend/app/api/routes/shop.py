from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
import uuid

router = APIRouter(prefix="/api/shop", tags=["shop"])

@router.get("/items")
async def list_items(db: AsyncSession = Depends(get_db)):
    result = await db.execute(text("SELECT * FROM shop_items WHERE is_active = TRUE ORDER BY price_xp"))
    items = result.mappings().fetchall()
    return {"items": [dict(i) for i in items]}

@router.get("/my-items")
async def my_items(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(text(
        "SELECT item_id, value FROM user_purchases WHERE user_id = :uid"
    ), {"uid": str(current_user.id)})
    purchases = result.mappings().fetchall()
    
    settings = await db.execute(text(
        "SELECT * FROM user_shop_settings WHERE user_id = :uid"
    ), {"uid": str(current_user.id)})
    s = settings.mappings().fetchone()
    
    return {
        "purchases": [dict(p) for p in purchases],
        "card_color": s["card_color"] if s else None,
        "extra_jokers": s["extra_jokers"] if s else 0,
    }

class PurchaseRequest(BaseModel):
    item_id: str

@router.post("/buy")
async def buy_item(
    req: PurchaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Ürünü bul
    result = await db.execute(text("SELECT * FROM shop_items WHERE id = :id AND is_active = TRUE"), {"id": req.item_id})
    item = result.mappings().fetchone()
    if not item:
        raise HTTPException(status_code=404, detail="Ürün bulunamadı.")
    
    # XP kontrolü
    if current_user.xp < item["price_xp"]:
        raise HTTPException(status_code=400, detail=f"Yetersiz XP. Gerekli: {item['price_xp']} XP")
    
    # Renk ürünlerinde tekrar satın almayı engelle
    if item["type"] == "card_color":
        existing = await db.execute(text(
            "SELECT id FROM user_purchases WHERE user_id = :uid AND item_id = :iid"
        ), {"uid": str(current_user.id), "iid": req.item_id})
        if existing.mappings().fetchone():
            raise HTTPException(status_code=400, detail="Bu ürünü zaten satın aldınız.")
    
    # XP düş
    current_user.xp -= item["price_xp"]
    
    # Satın alım kaydı
    await db.execute(text("""
        INSERT INTO user_purchases (id, user_id, item_id, value)
        VALUES (:id, :uid, :iid, :val)
    """), {"id": str(uuid.uuid4()), "uid": str(current_user.id), 
          "iid": req.item_id, "val": item["value"]})
    
    # Settings güncelle
    if item["type"] == "extra_joker":
        await db.execute(text("""
            INSERT INTO user_shop_settings (user_id, extra_jokers)
            VALUES (:uid, 1)
            ON CONFLICT (user_id) DO UPDATE SET extra_jokers = user_shop_settings.extra_jokers + 1
        """), {"uid": str(current_user.id)})
    
    await db.commit()
    return {"ok": True, "remaining_xp": current_user.xp}

class EquipRequest(BaseModel):
    item_id: str

@router.post("/equip")
async def equip_item(
    req: EquipRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Satın alınan rengi aktif et."""
    result = await db.execute(text(
        "SELECT up.value, si.type FROM user_purchases up JOIN shop_items si ON si.id = up.item_id WHERE up.user_id = :uid AND up.item_id = :iid"
    ), {"uid": str(current_user.id), "iid": req.item_id})
    purchase = result.mappings().fetchone()
    if not purchase:
        raise HTTPException(status_code=404, detail="Bu ürüne sahip değilsiniz.")
    
    if purchase["type"] == "card_color":
        await db.execute(text("""
            INSERT INTO user_shop_settings (user_id, card_color)
            VALUES (:uid, :color)
            ON CONFLICT (user_id) DO UPDATE SET card_color = :color
        """), {"uid": str(current_user.id), "color": purchase["value"]})
    
    await db.commit()
    return {"ok": True}

# ── Admin Shop Endpoint'leri ──────────────────────────────────────────────────

@router.get("/admin/items")
async def admin_list_items(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    result = await db.execute(text("SELECT * FROM shop_items ORDER BY type, price_xp"))
    items = result.mappings().fetchall()
    return {"items": [dict(i) for i in items]}

class ShopItemUpdate(BaseModel):
    name: str = None
    description: str = None
    price_xp: int = None
    is_active: bool = None
    value: str = None

@router.patch("/admin/items/{item_id}")
async def admin_update_item(item_id: str, req: ShopItemUpdate, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    
    fields = []
    params = {"id": item_id}
    if req.name is not None:
        fields.append("name = :name"); params["name"] = req.name
    if req.description is not None:
        fields.append("description = :description"); params["description"] = req.description
    if req.price_xp is not None:
        fields.append("price_xp = :price_xp"); params["price_xp"] = req.price_xp
    if req.is_active is not None:
        fields.append("is_active = :is_active"); params["is_active"] = req.is_active
    if req.value is not None:
        fields.append("value = :value"); params["value"] = req.value
    
    if fields:
        await db.execute(text(f"UPDATE shop_items SET {', '.join(fields)} WHERE id = :id"), params)
        await db.commit()
    return {"ok": True}

class NewColorItem(BaseModel):
    name: str
    value: str  # hex renk kodu
    price_xp: int = 500

@router.post("/admin/items/color")
async def admin_add_color(req: NewColorItem, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    import uuid
    await db.execute(text("""
        INSERT INTO shop_items (id, name, description, type, value, price_xp, is_active)
        VALUES (:id, :name, 'Maç ekranında profil kartınızın rengi', 'card_color', :value, :price, true)
    """), {"id": str(uuid.uuid4()), "name": req.name, "value": req.value, "price": req.price_xp})
    await db.commit()
    return {"ok": True}

@router.delete("/admin/items/{item_id}")
async def admin_delete_item(item_id: str, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    await db.execute(text("DELETE FROM shop_items WHERE id = :id"), {"id": item_id})
    await db.commit()
    return {"ok": True}
