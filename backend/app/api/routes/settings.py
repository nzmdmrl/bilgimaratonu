from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Any

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User
from app.services.settings import get_all_settings, set_settings, get_settings

router = APIRouter(prefix="/api/admin/settings", tags=["settings"])

class SettingUpdate(BaseModel):
    key: str
    value: Any

@router.get("/")
async def get_settings_endpoint(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    settings = await get_all_settings(db)
    return {"settings": settings}

@router.post("/")
async def update_settings(
    data: SettingUpdate,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    updated = await set_settings(db, data.key, data.value)
    # Cache'i temizle
    from app.services.settings_cache import invalidate_cache
    invalidate_cache(data.key)
    # Zorluk config'i degistiyse POINTS'i yeniden yukle (aninda etkili olsun)
    if data.key == "difficulty_config":
        from app.services.elo import reload_points
        reload_points(data.value)
    return {"key": data.key, "value": updated}

@router.get("/public")
async def get_public_settings(db: AsyncSession = Depends(get_db)):
    """Frontend için açık ayarlar — auth gerektirmez."""
    modules = await get_settings(db, "modules")
    marathon = await get_settings(db, "marathon")
    app_settings = await get_settings(db, "app")
    return {
        "modules": modules,
        "marathon_interval": marathon.get("interval_minutes", 15),
        "version": app_settings.get("version", "1.0"),
    }
