"""
Sistem Ayarları Servisi
Tüm ayarlar DB'de JSON olarak saklanır.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.settings import SystemSettings

# Varsayılan ayarlar
DEFAULT_SETTINGS = {
    # ─ Modül Açık/Kapalı
    "modules": {
        "match_1v1": True,        # 1v1 maç aktif mi
        "match_bot": True,        # Bot maç aktif mi
        "marathon": True,          # Maraton aktif mi
        "league_daily": True,      # Günlük lig
        "league_weekly": False,    # Haftalık lig
        "league_monthly": True,    # Aylık lig
        "league_yearly": True,     # Yıllık lig
    },

    # ─ Maç Ayarları
    "match": {
        "total_questions": 15,
        "distribution": {
            "easy": 5,
            "medium": 5,
            "hard": 3,
            "very_hard": 2,
        },
        "time_limits": {
            "easy": 30,
            "medium": 30,
            "hard": 45,
            "very_hard": 60,
        },
        "bot_enabled": True,       # Rakip bulunamazsa bot devreye girsin mi
        "bot_wait_seconds": 10,    # Bot devreye girmeden önce kaç sn bekle
    },

    # ─ Zorluk Puan ve Süre Ayarları (tüm maç tipleri)
    "difficulty_config": {
        "easy": {"correct": 10, "wrong": -3, "time_limit": 10},
        "medium": {"correct": 20, "wrong": -5, "time_limit": 20},
        "hard": {"correct": 30, "wrong": -8, "time_limit": 30},
        "very_hard": {"correct": 50, "wrong": -10, "time_limit": 35},
    },

    # ─ Maraton Ayarları
    "marathon": {
        "max_participants": 128,
        "lobby_duration_seconds": 180,
        "questions_per_round": 3,
        "time_per_question": 15,
        "interval_minutes": 15,
        "round_difficulties": {
            "1": "easy",
            "2": "easy",
            "3": "medium",
            "4": "medium",
            "5": "hard",
            "6": "hard",
            "7": "very_hard",
        },
        "allowed_categories": [],  # Boşsa tüm kategoriler
    },

    # ─ Lig Ayarları
    "league": {
        "daily_score_rule": True,  # Günlük en yüksek skor kuralı
    },

    # ─ API Ayarları
    "api_keys": {
        "openai": "",  # OpenAI API key
    },

    # ─ Unvan Sistemi
    "titles": [
        {"min_xp": 0,     "title": "Çaylak",         "color": "#B0BEC5", "icon": "🌱"},
        {"min_xp": 500,   "title": "Sohbetçi",        "color": "#4FC3F7", "icon": "💬"},
        {"min_xp": 2000,  "title": "Mahalli Ünlü",    "color": "#81C784", "icon": "⭐"},
        {"min_xp": 5000,  "title": "Şehir Efsanesi",  "color": "#FFD700", "icon": "🏆"},
        {"min_xp": 15000, "title": "Sanal Efsane",    "color": "#E91E63", "icon": "👑"},
    ],

    # ─ Bot Ayarları
    "bots": {
        "total_count": 500,
        "elo_distribution": [
            {"min": 800, "max": 900, "count": 50},
            {"min": 900, "max": 1000, "count": 100},
            {"min": 1000, "max": 1100, "count": 150},
            {"min": 1100, "max": 1200, "count": 100},
            {"min": 1200, "max": 1300, "count": 60},
            {"min": 1300, "max": 1400, "count": 25},
            {"min": 1400, "max": 1600, "count": 10},
            {"min": 1600, "max": 1800, "count": 5},
        ],
        "speed_multiplier": 1.0,   # 1.0 = normal, 0.5 = 2x hızlı, 2.0 = 2x yavaş
    },
}

async def get_settings(db: AsyncSession, key: str) -> dict:
    """Ayarı çek, yoksa varsayılanı döndür."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    if setting:
        return setting.value
    return DEFAULT_SETTINGS.get(key, {})

async def set_settings(db: AsyncSession, key: str, value: dict) -> dict:
    """Ayarı kaydet."""
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = value
    else:
        setting = SystemSettings(key=key, value=value)
        db.add(setting)

    await db.commit()
    return value

async def get_all_settings(db: AsyncSession) -> dict:
    """Tüm ayarları çek."""
    result = await db.execute(select(SystemSettings))
    settings = result.scalars().all()
    setting_map = {s.key: s.value for s in settings}

    # Varsayılanlarla birleştir
    merged = {}
    for key, default in DEFAULT_SETTINGS.items():
        merged[key] = setting_map.get(key, default)

    return merged

async def seed_settings(db: AsyncSession):
    """Varsayılan ayarları DB'ye ekle."""
    for key, value in DEFAULT_SETTINGS.items():
        existing = await db.execute(
            select(SystemSettings).where(SystemSettings.key == key)
        )
        if not existing.scalar_one_or_none():
            db.add(SystemSettings(key=key, value=value))
    await db.commit()
