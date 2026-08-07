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
        "arena": True,             # Arena aktif mi
        "league_daily": True,      # Günlük lig
        "league_weekly": False,    # Haftalık lig
        "league_monthly": True,    # Aylık lig
        "league_yearly": True,     # Yıllık lig
    },

    # ─ Arkadaşlık
    "friendship": {
        "requests_per_hour": 5,    # Saatte gönderilebilecek maks arkadaşlık isteği
    },

    # ─ Arayüz
    "ui": {
        "mobile_match_header": False,  # Mobilde maç ekranlarında üst menü görünsün mü (varsayılan: hayır)
        "default_theme": "dark",       # Varsayılan tema: dark(gece) | light(gündüz) | auto
        "background_animation": True,  # Gece gökyüzü animasyonu (yıldız/kayan yıldız/bulut) açık mı
        "background_theme": "night",   # Gökyüzü modu: night | sunset | aurora | galaxy
    },

    # ─ Turnuva faz müzikleri (çoklu MP3, random çalar) — {key: {tracks:[{url,name}], volume}}
    "music": {
        "music_wait":  {"tracks": [], "volume": 40},
        "music_lobby": {"tracks": [], "volume": 40},
        "music_round": {"tracks": [], "volume": 40},
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
        "only_easy": True,  # Turnuvada sadece KOLAY sorular çıksın (admin iptal edebilir)
        "xp_per_match": 5,  # Her turnuva maçı sonrası XP
        "xp_1": 500,   # Şampiyon (1.) XP
        "xp_2": 200,   # 2. XP
        "xp_3": 100,   # 3. XP (yarı final kaybedenleri)
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

    # ─ Solo Level Ayarları
    "solo": {
        "xp_per_star": 20,  # Kazanılan her yeni yıldız için verilecek XP
    },

    # ─ Arena (5 kişilik eşzamanlı yarış)
    "arena": {
        "enabled": True,
        "players": 5,
        "questions": 7,
        "answer_seconds": 10,
        "bot_enabled": True,
        "bot_start_seconds": 15,   # üye gelmezse bu kadar sonra botlar girmeye başlar
        "bot_interval_seconds": 2,
        "only_easy": True,          # Arena kategorilerinden sadece KOLAY soru çek
        "xp_1": 100,                # 1. olana XP
        "xp_2": 60,                 # 2. olana XP
        "xp_3": 40,                 # 3. olana XP
        "xp_other": 20,             # 4./5. olana XP
    },

    # ─ Kalabalık (bot maçlarıyla ligleri doldurma)
    "kalabalik": {
        "enabled": False,          # Sistem açık mı
        "start_hour": 0,           # TR saati — başlangıç
        "end_hour": 8,             # TR saati — bitiş
        "matches_per_league": 10,  # Genel ve her kategori için toplam maç
    },

    # ─ API Ayarları
    "api_keys": {
        "openai": "",  # OpenAI API key
    },

    # ─ Unvan Sistemi
    # 20 unvan — başta hızlı (0/20/50/100), sonra aralık kademeli açılır.
    "titles": [
        {"min_xp": 0,     "title": "Çaylak",       "color": "#B0BEC5", "icon": "🌱"},
        {"min_xp": 20,    "title": "Meraklı",      "color": "#90CAF9", "icon": "🔎"},
        {"min_xp": 50,    "title": "Kaşif",        "color": "#4FC3F7", "icon": "🧭"},
        {"min_xp": 100,   "title": "Bilgin",       "color": "#4DD0E1", "icon": "📚"},
        {"min_xp": 180,   "title": "Düşünür",      "color": "#4DB6AC", "icon": "💡"},
        {"min_xp": 300,   "title": "Araştırmacı",  "color": "#81C784", "icon": "📝"},
        {"min_xp": 480,   "title": "Usta",         "color": "#AED581", "icon": "⚒️"},
        {"min_xp": 720,   "title": "Uzman",        "color": "#DCE775", "icon": "🎯"},
        {"min_xp": 1050,  "title": "Âlim",         "color": "#FFD54F", "icon": "📖"},
        {"min_xp": 1500,  "title": "Deha",         "color": "#FFCA28", "icon": "🧠"},
        {"min_xp": 2100,  "title": "Üstat",        "color": "#FFB300", "icon": "🏅"},
        {"min_xp": 2900,  "title": "Fenomen",      "color": "#FFA726", "icon": "🌟"},
        {"min_xp": 3900,  "title": "Şampiyon",     "color": "#FF8A65", "icon": "👑"},
        {"min_xp": 5200,  "title": "Titan",        "color": "#FF7043", "icon": "⚔️"},
        {"min_xp": 6800,  "title": "Efsane",       "color": "#F4511E", "icon": "🔥"},
        {"min_xp": 8800,  "title": "İkon",         "color": "#EC407A", "icon": "💎"},
        {"min_xp": 11300, "title": "Zirve",        "color": "#E91E63", "icon": "🏔️"},
        {"min_xp": 14400, "title": "Öncü",         "color": "#AB47BC", "icon": "🚀"},
        {"min_xp": 18200, "title": "Mit",          "color": "#7E57C2", "icon": "⚡"},
        {"min_xp": 22800, "title": "Ölümsüz",      "color": "#5C6BC0", "icon": "♾️"},
    ],

    # ─ Ses Ayarları (boş = sentetik ses, dolu = yüklenen MP3 url'i)
    "sounds": {
        "radar": "",
        "match_found": "",
        "countdown": "",
        "correct": "",
        "wrong": "",
        "both_wrong": "",
        "opponent_correct": "",
        "opponent_wrong": "",
        "new_question": "",
        "win": "",
        "lose": "",
        "badge": "",
        "notification": "",
    },

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
    default = DEFAULT_SETTINGS.get(key, {})
    if setting:
        # Eksik alt anahtarlar (ör. modules.arena, arena.*) varsayilana dussun
        if isinstance(default, dict) and isinstance(setting.value, dict):
            return {**default, **setting.value}
        return setting.value
    return default

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
        stored = setting_map.get(key)
        if stored is None:
            merged[key] = default
        elif isinstance(default, dict) and isinstance(stored, dict):
            merged[key] = {**default, **stored}  # eksik alt anahtarlar varsayilana dussun
        else:
            merged[key] = stored

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
