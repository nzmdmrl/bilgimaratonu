from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, EmailStr
from typing import Optional
import uuid

from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token, create_refresh_token
from app.core.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    xp: int
    elo_rating: float
    trust_level: int
    role: str
    total_matches: int
    total_wins: int
    total_losses: int
    avatar_url: str = ""

    class Config:
        from_attributes = True

@router.post("/register", response_model=TokenResponse)
async def register(data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış.")
    
    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu email zaten kayıtlı.")
    
    if len(data.username) < 3 or len(data.username) > 30:
        raise HTTPException(status_code=400, detail="Kullanıcı adı 3-30 karakter olmalı.")

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=get_password_hash(data.password),
        avatar_seed=data.username,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    token_data = {"sub": str(user.id), "username": user.username}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )

@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı.")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hesabınız askıya alınmış.")
    
    token_data = {"sub": str(user.id), "username": user.username}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )

class RefreshRequest(BaseModel):
    refresh_token: str

@router.post("/refresh")
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    from app.core.security import decode_token, create_access_token
    payload = decode_token(data.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Geçersiz refresh token.")
    
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")
    
    token_data = {"sub": str(user.id), "username": user.username}
    return {"access_token": create_access_token(token_data)}

@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        xp=current_user.xp,
        elo_rating=current_user.elo_rating,
        trust_level=current_user.trust_level,
        role=current_user.role.value,
        total_matches=current_user.total_matches,
        total_wins=current_user.total_wins,
        total_losses=current_user.total_losses,
        avatar_url=current_user.avatar_url or "",
    )


# ─── Google OAuth ─────────────────────────────────────────────────────────────

class GoogleLoginRequest(BaseModel):
    token: str  # Google ID token

@router.post("/google")
async def google_login(req: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """Google ID token ile giriş/kayıt."""
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests

    GOOGLE_CLIENT_ID = "567100837956-svlujc1p8tskl8j49p9gnu43hg1l2e7j.apps.googleusercontent.com"

    try:
        idinfo = id_token.verify_oauth2_token(req.token, grequests.Request(), GOOGLE_CLIENT_ID)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Geçersiz Google token: {e}")

    google_id = idinfo["sub"]
    email = idinfo.get("email", "")
    name = idinfo.get("name", "")

    # Kullanıcı var mı?
    result = await db.execute(select(User).where(User.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        # Email ile var mı?
        result2 = await db.execute(select(User).where(User.email == email))
        user = result2.scalar_one_or_none()
        if user:
            user.google_id = google_id
        else:
            # Yeni kullanıcı oluştur
            import re, random
            base = re.sub(r'[^a-zA-Z0-9]', '', name.split()[0] if name else email.split('@')[0])
            username = base[:12] or "user"
            # Unique username
            existing = await db.execute(select(User).where(User.username == username))
            if existing.scalar_one_or_none():
                username = f"{username}{random.randint(100,999)}"
            user = User(
                username=username,
                email=email,
                google_id=google_id,
                hashed_password="",
                is_active=True,
                is_verified=True,
            )
            db.add(user)
        await db.commit()
        await db.refresh(user)

    from app.core.security import create_access_token, create_refresh_token
    from datetime import timedelta
    from app.core.config import settings
    access_token = create_access_token(
        {"sub": str(user.id), "username": user.username},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token({"sub": str(user.id)})

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {"id": str(user.id), "username": user.username, "email": user.email}
    }
