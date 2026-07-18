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

    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(Marathon).where(
                Marathon.status.in_([MarathonStatus.waiting, MarathonStatus.in_progress])
            )
        )
        if existing.scalar_one_or_none():
            print("[Scheduler] Aktif maraton var, atlanıyor.")
            return

    settings = await get_marathon_settings()
    max_p = settings["max_participants"]
    lobby_dur = settings["lobby_duration_seconds"]
    questions_per_round = settings["questions_per_round"]

    async with AsyncSessionLocal() as db:
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
    start = datetime.utcnow()

    while True:
        elapsed = (datetime.utcnow() - start).total_seconds()
        if elapsed >= lobby_dur:
            break

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(MarathonParticipant).where(
                    MarathonParticipant.marathon_id == marathon_id
                )
            )
            participants = result.scalars().all()
            current_count = len(participants)

            if current_count >= max_p:
                print(f"[BotFill] Lobi doldu ({current_count}/{max_p})")
                for i in range(5, 0, -1):
                    await marathon_manager.broadcast(marathon_id, {
                        "type": "countdown",
                        "seconds": i,
                        "message": f"Maraton {i} saniye içinde başlıyor!"
                    })
                    await asyncio.sleep(1)
                return

            needed = max_p - current_count
            fill_rate = min(max(int(elapsed / 5) + 3, 3), needed, 15)

            bots = await db.execute(
                select(User).where(
                    User.is_bot == True,
                    User.is_active == True,
                    ~User.id.in_([p.user_id for p in participants])
                ).order_by(User.elo_rating).limit(fill_rate)
            )
            new_bots = bots.scalars().all()
            for bot in new_bots:
                db.add(MarathonParticipant(
                    marathon_id=marathon_id,
                    user_id=str(bot.id),
                    status=MarathonParticipantStatus.active,
                ))
            await db.commit()
            print(f"[BotFill] {current_count + len(new_bots)}/{max_p}")

        await asyncio.sleep(BOT_FILL_INTERVAL)

    # Lobi süresi bitti — eksikleri doldur
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MarathonParticipant).where(
                MarathonParticipant.marathon_id == marathon_id
            )
        )
        participants = result.scalars().all()
        needed = max_p - len(participants)

        if needed > 0:
            bots = await db.execute(
                select(User).where(
                    User.is_bot == True,
                    User.is_active == True,
                    ~User.id.in_([p.user_id for p in participants])
                ).order_by(User.elo_rating).limit(needed)
            )
            for bot in bots.scalars().all():
                db.add(MarathonParticipant(
                    marathon_id=marathon_id,
                    user_id=str(bot.id),
                    status=MarathonParticipantStatus.active,
                ))
            await db.commit()
            print(f"[BotFill] Tamamlandı: {max_p}/{max_p}")

    for i in range(5, 0, -1):
        await marathon_manager.broadcast(marathon_id, {
            "type": "countdown",
            "seconds": i,
            "message": f"Maraton {i} saniye içinde başlıyor!"
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
