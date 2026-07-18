# YOL: backend/app/services/league_scheduler.py
"""
Lig Ödül Zamanlayıcı
- Her gün 23:59:59 (TR) günlük ligleri kapat: genel + her kategori için 1/2/3 kupa/madalya
- Ayın son günü: aylık ligler
- Yılın son günü: yıllık ligler
Ödüller achievements tablosuna yazılır (kupa=trophy rank1, madalya=medal rank2/3).
"""
import asyncio
from datetime import datetime, timedelta, date
import calendar

MONTHS_TR = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran",
             "Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"]


async def league_reward_scheduler():
    print("[LeagueScheduler] Lig ödül zamanlayıcı başladı.")
    while True:
        try:
            tr_now = datetime.utcnow() + timedelta(hours=3)
            target = tr_now.replace(hour=23, minute=59, second=59, microsecond=0)
            if tr_now >= target:
                target = target + timedelta(days=1)
            wait = (target - tr_now).total_seconds()
            print(f"[LeagueScheduler] TR: {tr_now.strftime('%d/%m/%Y %H:%M:%S')} — ödül: {int(wait)}sn sonra")
            await asyncio.sleep(wait)

            today = (datetime.utcnow() + timedelta(hours=3)).date()

            await give_period_rewards("daily", today)

            last_day = calendar.monthrange(today.year, today.month)[1]
            if today.day == last_day:
                await give_period_rewards("monthly", today)

            if today.month == 12 and today.day == 31:
                await give_period_rewards("yearly", today)

            await asyncio.sleep(2)
        except Exception as e:
            print(f"[LeagueScheduler] Hata: {e}")
            import traceback; traceback.print_exc()
            await asyncio.sleep(300)


def _period_key(period_type: str, d: date) -> str:
    if period_type == "daily":
        return d.strftime("%Y-%m-%d")
    if period_type == "monthly":
        return f"{d.year}-{d.month:02d}"
    return str(d.year)


def _period_label(period_type: str, d: date) -> str:
    if period_type == "daily":
        return d.strftime("%d/%m/%Y")
    if period_type == "monthly":
        return f"{MONTHS_TR[d.month-1]} {d.year}"
    return f"{d.year}"


async def give_period_rewards(period_type: str, d: date):
    """Bir dönem için genel + tüm kategori liglerinde 1/2/3 kupa-madalya dağıt."""
    from sqlalchemy import text, select
    from app.core.database import AsyncSessionLocal
    from app.models.question import Category

    pkey = _period_key(period_type, d)
    label = _period_label(period_type, d)

    async with AsyncSessionLocal() as db:
        # Dağıtılacak ligler: genel (None) + kategori maçı açık kategoriler
        cats = await db.execute(select(Category.id, Category.name).where(Category.has_category_match == True))
        leagues = [(None, "Genel")] + [(str(cid), name) for cid, name in cats.fetchall()]

        for category_id, league_name in leagues:
            await _award_one_league(db, period_type, d, pkey, label, category_id, league_name)


async def _award_one_league(db, period_type, d, pkey, label, category_id, league_name):
    from sqlalchemy import text
    from app.services.achievement import award_trophy_or_medal

    # period_type'a göre WHERE koşulu
    where = "period_type=:pt AND period_year=:y"
    params = {"pt": period_type, "y": d.year}
    if period_type == "daily":
        where += " AND period_month=:m AND period_day=:dd"
        params.update({"m": d.month, "dd": d.day})
    elif period_type == "monthly":
        where += " AND period_month=:m"
        params["m"] = d.month
    else:  # yearly
        where += " AND period_month IS NULL"

    # Kategori kırılımı
    if category_id is None:
        where += " AND category_id IS NULL"
    else:
        where += " AND category_id = :cat"
        params["cat"] = category_id

    rows = (await db.execute(text(f"""
        SELECT user_id, total_score FROM league_entries
        WHERE {where}
        ORDER BY total_score DESC
        LIMIT 3
    """), params)).fetchall()

    if not rows:
        return

    icons = {1: "🏆", 2: "🥈", 3: "🥉"}
    for i, row in enumerate(rows):
        rank = i + 1
        user_id = str(row[0])
        score = row[1]
        try:
            new = await award_trophy_or_medal(db, user_id, period_type, pkey, rank, category_id)
            if new:
                await _notify(db, user_id, rank, period_type, league_name, label, score, icons[rank])
                print(f"[LeagueScheduler] {league_name} {period_type} {rank}. → {user_id[:8]} ({score})")
        except Exception as e:
            print(f"[LeagueScheduler] ödül hatası ({league_name} {rank}): {e}")


async def _notify(db, user_id, rank, period_type, league_name, label, score, icon):
    """Kupa/madalya bildirimi oluştur."""
    from app.models.notification import Notification
    pt_tr = {"daily": "Günlük", "monthly": "Aylık", "yearly": "Yıllık"}.get(period_type, period_type)
    rank_tr = {1: "şampiyonu", 2: "ikincisi", 3: "üçüncüsü"}[rank]
    lig_str = "genel" if league_name == "Genel" else f"{league_name}"
    try:
        db.add(Notification(
            user_id=user_id,
            type="trophy" if rank == 1 else "medal",
            title=f"{icon} {league_name} {pt_tr} Lig {rank_tr.capitalize()}!",
            message=f"{label} {pt_tr.lower()} {lig_str} liginde {score:.2f} puanla {rank}. oldunuz!",
            data={"rank": rank, "period_type": period_type, "league": league_name},
        ))
        await db.commit()
    except Exception as ne:
        print(f"[LeagueScheduler] bildirim hatası: {ne}")
        await db.rollback()
