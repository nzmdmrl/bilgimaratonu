import asyncio
from fastapi import FastAPI, WebSocket, Query
from fastapi.staticfiles import StaticFiles
import os
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.seed import seed_categories
from app.api.routes import auth, categories, questions, profile, league, admin, marathon, badges, solo, events, pages, blog, announcements, upload, shop, importer, question_generator, notifications
from app.api.routes import settings as settings_router
from app.websocket.match_ws import handle_match_ws

app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    docs_url="/api/docs" if settings.DEBUG else None,
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://www.bilgimaratonu.com", "https://bilgimaratonu.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(categories.router)
app.include_router(questions.router)
app.include_router(profile.router)
app.include_router(league.router)
app.include_router(admin.router)
app.include_router(marathon.router)
app.include_router(notifications.router)
app.include_router(badges.router)
app.include_router(solo.router)
app.include_router(events.router)
app.include_router(pages.router)
app.include_router(blog.router)
app.include_router(announcements.router)
app.include_router(upload.router)
app.include_router(shop.router)
app.include_router(importer.router)
app.include_router(question_generator.router)
app.include_router(settings_router.router)

@app.websocket("/ws/match")
async def match_websocket(websocket: WebSocket, token: str = Query(...)):
    await handle_match_ws(websocket, token)

@app.websocket("/api/arena/ws")
async def arena_websocket(websocket: WebSocket, token: str = Query(...)):
    from app.websocket.arena_ws import handle_arena_ws
    await handle_arena_ws(websocket, token)

from app.services.marathon_scheduler import marathon_scheduler, get_or_create_next_marathon
from app.services.badge import seed_badges
from app.services.settings import seed_settings

@app.on_event("startup")
async def startup():
    async with AsyncSessionLocal() as db:
        await seed_categories(db)
        # Yarim kalmis maratonlari temizle (redeploy sonrasi takilmayi onler)
        from sqlalchemy import text as _sqltext
        await db.execute(_sqltext("UPDATE marathons SET status='finished', finished_at=NOW() WHERE status IN ('waiting','in_progress')"))
        # Solo level ilerleme tablosu (migration olmadan idempotent olustur)
        await db.execute(_sqltext("""
            CREATE TABLE IF NOT EXISTS solo_progress (
                id UUID PRIMARY KEY,
                user_id UUID NOT NULL REFERENCES users(id),
                level INTEGER NOT NULL,
                stars INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_solo_user_level UNIQUE (user_id, level)
            )
        """))
        await db.execute(_sqltext("CREATE INDEX IF NOT EXISTS ix_solo_progress_user_id ON solo_progress(user_id)"))
        # Avatarsiz botlara DiceBear thumbs avatari ata (idempotent)
        await db.execute(_sqltext(
            "UPDATE users SET avatar_url = 'https://api.dicebear.com/9.x/thumbs/svg?seed=' || username "
            "WHERE is_bot = true AND (avatar_url IS NULL OR avatar_url = '')"
        ))
        # Turnuva rozet adlarini guncelle (maraton -> turnuva yeniden adlandirma)
        await db.execute(_sqltext(
            "UPDATE badges SET name='Turnuvacı', description='İlk turnuvaya katıl' WHERE code='marathon_join'"
        ))
        await db.execute(_sqltext(
            "UPDATE badges SET description='Turnuvayı kazan' WHERE code='marathon_champ'"
        ))
        # Bracket kolonlari (idempotent)
        await db.execute(_sqltext("ALTER TABLE marathon_participants ADD COLUMN IF NOT EXISTS seed INTEGER"))
        await db.execute(_sqltext("ALTER TABLE marathon_matches ADD COLUMN IF NOT EXISTS bracket_index INTEGER"))
        # Arena kategori bayragi (idempotent)
        await db.execute(_sqltext("ALTER TABLE categories ADD COLUMN IF NOT EXISTS has_arena_match BOOLEAN DEFAULT FALSE"))
        # Botlarin kupa/madalya/rozet kazanimlarini temizle (profillerine yansimasin)
        await db.execute(_sqltext(
            "DELETE FROM achievements WHERE user_id IN (SELECT id FROM users WHERE is_bot = true)"
        ))
        await db.execute(_sqltext(
            "DELETE FROM user_badges WHERE user_id IN (SELECT id FROM users WHERE is_bot = true)"
        ))
        # Normal kullanicinin cozemeyecegi uzmanlik sorularini pasiflestir (idempotent, geri alinabilir)
        import os as _os, json as _json
        _dq_path = _os.path.join(_os.path.dirname(__file__), "data", "disabled_questions.json")
        try:
            if _os.path.exists(_dq_path):
                _dq = _json.load(open(_dq_path, encoding="utf-8"))
                if _dq:
                    r = await db.execute(_sqltext("UPDATE questions SET is_active=false WHERE text = ANY(:texts) AND is_active=true"), {"texts": _dq})
                    print(f"[Startup] {getattr(r, 'rowcount', '?')} uzmanlik sorusu pasiflestirildi")
        except Exception as _e:
            print(f"[Startup] disabled_questions hata: {_e}")
        await db.commit()
    await seed_badges(db)
    await seed_settings(db)
    # Cache temizle ve zamanlayıcıyı başlat
    from app.services.settings_cache import invalidate_cache
    invalidate_cache()
    # Zorluk config'ini POINTS'e yukle
    try:
        from app.services.elo import reload_points
        from app.services.settings_cache import get_cached_setting as _gcs
        _diff_cfg = await _gcs("difficulty_config")
        reload_points(_diff_cfg)
        print("[Startup] difficulty_config POINTS'e yuklendi")
    except Exception as _e:
        print(f"[Startup] difficulty_config yuklenemedi: {_e}")
    asyncio.ensure_future(marathon_scheduler())  # Maraton scheduler aktif
    from app.services.league_scheduler import league_reward_scheduler
    asyncio.ensure_future(league_reward_scheduler())
    from app.services.kalabalik import kalabalik_scheduler
    asyncio.ensure_future(kalabalik_scheduler())

    # Restart'ta in_progress maratonları kurtar
    from app.websocket.marathon_ws import run_marathon_engine
    from app.models.marathon import Marathon
    from sqlalchemy import select as _select
    async with AsyncSessionLocal() as _db:
        _res = await _db.execute(_select(Marathon).where(Marathon.status == 'in_progress'))
        for _m in _res.scalars().all():
            print(f"[Startup] In-progress maraton kurtarılıyor: {_m.id}")
            asyncio.ensure_future(run_marathon_engine(str(_m.id)))

from app.websocket.marathon_ws import handle_marathon_ws
from app.websocket.category_match_ws import handle_category_match_ws
import asyncio
from fastapi import WebSocket, Query

@app.websocket("/api/category-match/{category_slug}/ws")
async def category_match_ws_endpoint(
    websocket: WebSocket,
    category_slug: str,
    token: str = Query(...),
):
    print(f"[MAIN] category_match_ws_endpoint çağrıldı: {category_slug}")
    try:
        await handle_category_match_ws(websocket, category_slug, token)
    except Exception as e:
        print(f"[MAIN] category_match hata: {e}")
        import traceback; traceback.print_exc()

@app.websocket("/api/marathon/{marathon_id}/ws")
async def marathon_ws_endpoint(
    websocket: WebSocket,
    marathon_id: str,
    token: str = Query(...),
):
    print(f"[WS CONNECT] Marathon:{marathon_id[:8]}")
    await handle_marathon_ws(websocket, marathon_id, token)

@app.get("/api/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
