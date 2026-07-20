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
