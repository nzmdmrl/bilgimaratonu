from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
import os, uuid

router = APIRouter(prefix="/api/upload", tags=["upload"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/avatars")
ALLOWED = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 2 * 1024 * 1024  # 2MB

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

    ext = file.filename.split(".")[-1].lower()
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    with open(filepath, "wb") as f:
        f.write(contents)

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
