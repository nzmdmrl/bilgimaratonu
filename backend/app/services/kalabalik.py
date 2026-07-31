"""
Kalabalık — botların kendi aralarında simüle ettiği maçlarla lig tablolarını doldurur.
Admin'den açılır/kapanır. TR saatiyle belirlenen pencerede (varsayılan 00:00–08:00)
genel 1v1 ve her kategori için, farklı bot çiftleriyle N maç yapılır; maçlar pencere
boyunca yayılır, böylece lig sayfaları dolu görünür.
"""
import asyncio
import random
from datetime import datetime, timedelta, date

from sqlalchemy import select, func, text as _t

from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.question import Category
from app.services.league import update_league_score
from app.services.bot import bot_accuracy
from app.services.settings import get_settings, set_settings

# 15 soruluk dağılım (1v1 genel maçla aynı) ve puanlar
_DIST = [("easy", 5), ("medium", 5), ("hard", 3), ("very_hard", 2)]
_POINTS = {"easy": (10, -3), "medium": (20, -5), "hard": (30, -8), "very_hard": (50, -10)}

_MAX_PER_TICK = 5   # bir tur'da lig başına en fazla maç (patlama önler)
_TICK_SECONDS = 600  # 10 dakika


def _tr_now() -> datetime:
    return datetime.utcnow() + timedelta(hours=3)  # Europe/Istanbul (UTC+3)


def _simulate_score(elo: float) -> float:
    acc = bot_accuracy(elo or 1000)
    s = 0.0
    for diff, n in _DIST:
        cp, wp = _POINTS[diff]
        for _ in range(n):
            if random.random() < acc:
                s += cp + random.uniform(0, 0.15)  # küçük hız bonusu
            else:
                s += wp
    return round(s, 2)


async def _cfg(db) -> dict:
    c = await get_settings(db, "kalabalik")
    return {
        "enabled": bool(c.get("enabled", False)),
        "start_hour": int(c.get("start_hour", 0)),
        "end_hour": int(c.get("end_hour", 8)),
        "matches_per_league": int(c.get("matches_per_league", 10)),
    }


async def _run_matches(db, category_id, n: int) -> int:
    """n maç: her maç farklı iki bot; ikisinin skorunu ilgili lige yazar."""
    if n <= 0:
        return 0
    pool = (await db.execute(
        select(User).where(User.is_bot == True, User.is_active == True)
        .order_by(func.random()).limit(n * 2)
    )).scalars().all()
    if len(pool) < 2:
        return 0
    done = 0
    for i in range(0, len(pool) - 1, 2):
        a, b = pool[i], pool[i + 1]
        try:
            await update_league_score(db, str(a.id), _simulate_score(a.elo_rating), None, date.today(), category_id=category_id)
            await update_league_score(db, str(b.id), _simulate_score(b.elo_rating), None, date.today(), category_id=category_id)
            done += 1
        except Exception as e:
            print(f"[Kalabalik] maç hata: {e}")
        if done >= n:
            break
    return done


def _in_window(hour: int, sh: int, eh: int) -> bool:
    if sh == eh:
        return False
    if sh < eh:
        return sh <= hour < eh
    return hour >= sh or hour < eh  # gece yarısını aşan aralık


async def reset_bot_leagues(db) -> None:
    """Liglerdeki bot sıralamalarını sıfırla + günlük skorlarını ve ilerlemeyi temizle."""
    await db.execute(_t("DELETE FROM league_entries WHERE user_id IN (SELECT id FROM users WHERE is_bot = true)"))
    await db.execute(_t("DELETE FROM daily_scores WHERE user_id IN (SELECT id FROM users WHERE is_bot = true)"))
    await db.commit()
    await set_settings(db, "kalabalik_state", {})
    from app.services.settings_cache import invalidate_cache
    invalidate_cache("kalabalik_state")


async def kalabalik_scheduler():
    print("[Kalabalik] Zamanlayıcı başladı.")
    await asyncio.sleep(10)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                cfg = await _cfg(db)
                if not cfg["enabled"]:
                    await asyncio.sleep(300)
                    continue

                now = _tr_now()
                sh, eh = cfg["start_hour"], cfg["end_hour"]
                if not _in_window(now.hour, sh, eh):
                    await asyncio.sleep(300)
                    continue

                # Günlük ilerleme durumu (DB'de saklanır — restart'ta korunur)
                day_key = now.strftime("%Y-%m-%d")
                state = await get_settings(db, "kalabalik_state") or {}
                if state.get("day") != day_key:
                    state = {"day": day_key, "done": {}}
                done = dict(state.get("done", {}))

                # Hedef = N * pencerede geçen oran
                window_min = (((eh - sh) % 24) or 24) * 60
                elapsed_min = ((now.hour - sh) % 24) * 60 + now.minute
                frac = min(1.0, max(0.0, elapsed_min / window_min))
                N = cfg["matches_per_league"]
                target = N if frac >= 1.0 else round(N * frac)

                # Ligler: genel + kategori maçı açık kategoriler
                leagues = [("genel", None)]
                cats = (await db.execute(select(Category).where(Category.has_category_match == True))).scalars().all()
                leagues += [(c.slug, str(c.id)) for c in cats]

                ran_total = 0
                for key, cid in leagues:
                    already = int(done.get(key, 0))
                    need = min(target - already, _MAX_PER_TICK)
                    if need <= 0:
                        continue
                    ran = await _run_matches(db, cid, need)
                    done[key] = already + ran
                    ran_total += ran

                state["done"] = done
                await set_settings(db, "kalabalik_state", state)
                from app.services.settings_cache import invalidate_cache
                invalidate_cache("kalabalik_state")
                print(f"[Kalabalik] TR {now:%H:%M} frac={frac:.2f} target={target} ran={ran_total} ligler={len(leagues)}")

            await asyncio.sleep(_TICK_SECONDS)
        except Exception as e:
            print(f"[Kalabalik] Hata: {e}")
            await asyncio.sleep(300)
