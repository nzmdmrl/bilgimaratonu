"""
Ayarları cache'leyerek hızlı erişim sağlar.
Her 60 saniyede bir yeniler.
"""
import asyncio
from datetime import datetime, timedelta
from app.services.settings import DEFAULT_SETTINGS

_cache = {}
_cache_time = {}
CACHE_TTL = 60  # saniye

async def get_cached_setting(key: str) -> dict:
    """Cache'den ayar çek, süresi dolmuşsa DB'den yenile."""
    now = datetime.utcnow()
    if key in _cache and (now - _cache_time.get(key, datetime.min)) < timedelta(seconds=CACHE_TTL):
        return _cache[key]
    
    # DB'den çek
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.settings import get_settings
        async with AsyncSessionLocal() as db:
            value = await get_settings(db, key)
            _cache[key] = value
            _cache_time[key] = now
            return value
    except Exception:
        return DEFAULT_SETTINGS.get(key, {})

def invalidate_cache(key: str = None):
    """Cache'i temizle."""
    if key:
        _cache.pop(key, None)
        _cache_time.pop(key, None)
    else:
        _cache.clear()
        _cache_time.clear()
