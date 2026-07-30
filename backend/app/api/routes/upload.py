from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin
from app.models.user import User
import os, uuid

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/avatars")
ALLOWED = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 2 * 1024 * 1024  # 2MB

SOUND_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/sounds")
SOUND_ALLOWED = {"audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg"}
SOUND_MAX_SIZE = 5 * 1024 * 1024  # 5MB
SOUND_KEYS = {
    "radar", "match_found", "countdown", "correct", "wrong", "both_wrong",
    "opponent_correct", "opponent_wrong",
    "new_question", "win", "lose", "badge", "notification",
}

@router.post("/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="Sadece JPG, PNG veya WebP yüklenebilir.")

    contents = await file.read()
    if len(contents) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Dosya 2MB'dan büyük olamaz.")

    # Orijinali saklama — kucult + JPG olarak dusuk kaliteyle yeniden kodla
    from PIL import Image
    import io
    try:
        img = Image.open(io.BytesIO(contents))
        if img.mode in ("RGBA", "LA", "P"):
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.convert("RGBA").split()[-1])
            img = bg
        else:
            img = img.convert("RGB")
        img.thumbnail((400, 400), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70, optimize=True)
        jpg_bytes = buf.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Görsel işlenemedi. Geçerli bir resim yükleyin.")

    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(UPLOAD_DIR, filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    with open(filepath, "wb") as f:
        f.write(jpg_bytes)

    avatar_url = f"/uploads/avatars/{filename}"
    
    # Admin onayına gönder
    await db.execute(text("""
        INSERT INTO avatar_requests (id, user_id, avatar_url, status)
        VALUES (:id, :user_id, :avatar_url, 'pending')
    """), {"id": str(uuid.uuid4()), "user_id": str(current_user.id), "avatar_url": avatar_url})
    await db.commit()

    return {"ok": True, "message": "Fotoğrafınız admin onayına gönderildi.", "pending": True}

@router.get("/avatar-requests")
async def list_requests(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    result = await db.execute(text("""
        SELECT ar.id, ar.avatar_url, ar.status, ar.created_at,
               u.username, u.id as user_id
        FROM avatar_requests ar
        JOIN users u ON u.id = ar.user_id
        WHERE ar.status = 'pending'
        ORDER BY ar.created_at DESC
    """))
    rows = result.mappings().fetchall()
    return {"requests": [dict(r) for r in rows]}

@router.post("/avatar-requests/{req_id}/approve")
async def approve_avatar(
    req_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    
    result = await db.execute(text(
        "SELECT * FROM avatar_requests WHERE id = :id"
    ), {"id": req_id})
    req = result.mappings().fetchone()
    if not req:
        raise HTTPException(status_code=404)
    
    # Kullanıcının avatar_url'ini güncelle
    await db.execute(text(
        "UPDATE users SET avatar_url = :url WHERE id = :uid"
    ), {"url": req["avatar_url"], "uid": str(req["user_id"])})
    await db.execute(text(
        "UPDATE avatar_requests SET status = 'approved' WHERE id = :id"
    ), {"id": req_id})
    await db.commit()
    return {"ok": True}

@router.post("/avatar-requests/{req_id}/reject")
async def reject_avatar(
    req_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    await db.execute(text(
        "UPDATE avatar_requests SET status = 'rejected' WHERE id = :id"
    ), {"id": req_id})
    await db.commit()
    return {"ok": True}


@router.post("/sound/{sound_key}")
async def upload_sound(
    sound_key: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Bir ses yuvasına MP3 yükle — sentetik ses yerine bu çalar. (Admin)"""
    if sound_key not in SOUND_KEYS:
        raise HTTPException(status_code=400, detail="Geçersiz ses anahtarı.")
    if file.content_type not in SOUND_ALLOWED:
        raise HTTPException(status_code=400, detail="Sadece MP3/WAV/OGG yüklenebilir.")

    contents = await file.read()
    if len(contents) > SOUND_MAX_SIZE:
        raise HTTPException(status_code=400, detail="Dosya 5MB'dan büyük olamaz.")

    ext = (file.filename or "ses.mp3").split(".")[-1].lower()
    filename = f"{sound_key}_{uuid.uuid4().hex[:8]}.{ext}"
    os.makedirs(SOUND_DIR, exist_ok=True)
    with open(os.path.join(SOUND_DIR, filename), "wb") as f:
        f.write(contents)

    url = f"/uploads/sounds/{filename}"

    from app.services.settings import get_settings, set_settings
    from app.services.settings_cache import invalidate_cache
    sounds = dict(await get_settings(db, "sounds"))
    sounds[sound_key] = url
    await set_settings(db, "sounds", sounds)
    invalidate_cache("sounds")

    return {"ok": True, "sound_key": sound_key, "url": url}


@router.delete("/sound/{sound_key}")
async def delete_sound(
    sound_key: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Ses yuvasındaki MP3'ü kaldır — sentetik sese geri dön. (Admin)"""
    if sound_key not in SOUND_KEYS:
        raise HTTPException(status_code=400, detail="Geçersiz ses anahtarı.")

    from app.services.settings import get_settings, set_settings
    from app.services.settings_cache import invalidate_cache
    sounds = dict(await get_settings(db, "sounds"))
    sounds[sound_key] = ""
    await set_settings(db, "sounds", sounds)
    invalidate_cache("sounds")

    return {"ok": True, "sound_key": sound_key}


@router.get("/my-pending-avatar")
async def my_pending_avatar(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kullanıcının onay bekleyen avatarını döndür."""
    result = await db.execute(text("""
        SELECT avatar_url FROM avatar_requests 
        WHERE user_id = :uid AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
    """), {"uid": str(current_user.id)})
    row = result.mappings().fetchone()
    return {"pending_avatar_url": row["avatar_url"] if row else None}
