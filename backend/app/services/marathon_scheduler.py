"""
Maraton Zamanlayıcı
"""
import asyncio
from datetime import datetime, timedelta
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.marathon import Marathon, MarathonStatus, MarathonParticipant, MarathonParticipantStatus
from app.models.user import User

BOT_FILL_INTERVAL = 3


async def get_marathon_settings() -> dict:
    from app.services.settings_cache import get_cached_setting, invalidate_cache
    invalidate_cache("marathon")
    s = await get_cached_setting("marathon")
    return {
        "interval_minutes": int(s.get("interval_minutes", 15)),
        "max_participants": int(s.get("max_participants", 32)),
        "lobby_duration_seconds": int(s.get("lobby_duration_seconds", 30)),
        "questions_per_round": int(s.get("questions_per_round", 3)),
    }


async def marathon_scheduler():
    print("[Scheduler] Maraton zamanlayıcı başladı.")
    await asyncio.sleep(5)

    while True:
        try:
            settings = await get_marathon_settings()
            interval = settings["interval_minutes"]

            now = datetime.utcnow()
            minutes = now.minute
            current_slot = (minutes // interval) * interval
            next_slot = current_slot + interval

            if next_slot >= 60:
                next_time = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
            else:
                next_time = now.replace(minute=next_slot, second=0, microsecond=0)

            wait = (next_time - now).total_seconds()
            print(f"[Scheduler] Sonraki maraton: {next_time.strftime('%H:%M')} ({int(wait)}sn sonra)")
            await asyncio.sleep(wait)

            await create_and_run_marathon()

        except Exception as e:
            print(f"[Scheduler] Hata: {e}")
            import traceback; traceback.print_exc()
            await asyncio.sleep(60)


async def create_and_run_marathon():
    from app.websocket.marathon_ws import run_marathon_engine, marathon_manager

    settings = await get_marathon_settings()
    max_p = settings["max_participants"]
    lobby_dur = settings["lobby_duration_seconds"]
    questions_per_round = settings["questions_per_round"]

    async with AsyncSessionLocal() as db:
        # Kontrol + olusturma ayni session'da (race condition onlenir)
        existing = await db.execute(
            select(Marathon).where(
                Marathon.status.in_([MarathonStatus.waiting, MarathonStatus.in_progress])
            )
        )
        if existing.scalars().first():
            print("[Scheduler] Aktif maraton var, atlanıyor.")
            return

        marathon = Marathon(
            status=MarathonStatus.waiting,
            max_participants=max_p,
            questions_per_round=questions_per_round,
            lobby_opens_at=datetime.utcnow(),
        )
        db.add(marathon)
        await db.commit()
        await db.refresh(marathon)
        marathon_id = str(marathon.id)

    print(f"[Scheduler] Maraton oluşturuldu: {marathon_id[:8]} (max:{max_p}, lobi:{lobby_dur}sn)")

    await fill_lobby(marathon_id, max_p, lobby_dur, marathon_manager)

    print(f"[Scheduler] Maraton başlatılıyor: {marathon_id[:8]}")
    asyncio.ensure_future(run_marathon_engine(marathon_id))


async def fill_lobby(marathon_id: str, max_p: int, lobby_dur: int, marathon_manager):
    import random
    start = datetime.utcnow()
    hold_at = max(1, max_p - 1)        # son slotu insana beklet
    final_window = 2                   # son 2 sn kala tamamla
    # botları öncesine yay: her ~step_interval'da 1 bot
    step_interval = max(0.5, (lobby_dur - final_window) / hold_at)

    async def _add_one_bot(db, participants):
        bot = (await db.execute(
            select(User).where(
                User.is_bot == True, User.is_active == True,
                ~User.id.in_([p.user_id for p in participants])
            ).order_by(User.elo_rating).limit(1)
        )).scalar_one_or_none()
        if not bot:
            return None
        db.add(MarathonParticipant(marathon_id=marathon_id, user_id=str(bot.id), status=MarathonParticipantStatus.active))
        await db.commit()
        return bot

    # 1) Yavaş yavaş botlar — hold_at'e kadar, son 2 sn'ye kadar
    while True:
        elapsed = (datetime.utcnow() - start).total_seconds()
        if elapsed >= lobby_dur - final_window:
            break
        async with AsyncSessionLocal() as db:
            participants = (await db.execute(
                select(MarathonParticipant).where(MarathonParticipant.marathon_id == marathon_id)
            )).scalars().all()
            current = len(participants)
            if current >= max_p:
                break
            if current < hold_at:
                bot = await _add_one_bot(db, participants)
                if bot:
                    current += 1
                    await marathon_manager.broadcast(marathon_id, {
                        "type": "lobby_join", "username": bot.username,
                        "count": current, "max": max_p, "is_bot": True,
                    })
                    print(f"[BotFill] {current}/{max_p} (+{bot.username})")
        await asyncio.sleep(step_interval)

    # 2) Son 2 sn: kalan slotları doldur (son bot dahil) → max_p
    async with AsyncSessionLocal() as db:
        participants = (await db.execute(
            select(MarathonParticipant).where(MarathonParticipant.marathon_id == marathon_id)
        )).scalars().all()
        cnt = len(participants)
        needed = max_p - cnt
        if needed > 0:
            bots = (await db.execute(
                select(User).where(
                    User.is_bot == True, User.is_active == True,
                    ~User.id.in_([p.user_id for p in participants])
                ).order_by(User.elo_rating).limit(needed)
            )).scalars().all()
            for bot in bots:
                db.add(MarathonParticipant(marathon_id=marathon_id, user_id=str(bot.id), status=MarathonParticipantStatus.active))
                cnt += 1
            await db.commit()
        await marathon_manager.broadcast(marathon_id, {"type": "lobby_join", "count": cnt, "max": max_p, "final": True})
        print(f"[BotFill] Tamamlandı: {cnt}/{max_p}")

    # 3) Süre dolana kadar bekle, sonra 5→1 geri sayım
    remaining = lobby_dur - (datetime.utcnow() - start).total_seconds()
    if remaining > 0:
        await asyncio.sleep(remaining)
    for i in range(5, 0, -1):
        await marathon_manager.broadcast(marathon_id, {
            "type": "countdown", "seconds": i,
            "message": f"Turnuva {i} saniye içinde başlıyor!"
        })
        await asyncio.sleep(1)


async def get_or_create_next_marathon():
    """Bir sonraki maraton zamanını hesapla."""
    settings = await get_marathon_settings()
    interval = settings["interval_minutes"]
    
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    minutes = now.minute
    current_slot = (minutes // interval) * interval
    next_slot = current_slot + interval
    
    if next_slot >= 60:
        next_time = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    else:
        next_time = now.replace(minute=next_slot, second=0, microsecond=0)
    
    return {"next_marathon_at": next_time.isoformat()}
