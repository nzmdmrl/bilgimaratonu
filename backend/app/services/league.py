# YOL: backend/app/services/league.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text as _t
from datetime import date
import uuid as _uuid

from app.models.league import DailyScore, LeagueEntry

# category_id NULL'ı temsil eden sentinel (SQL COALESCE ile eşleşir)
_NULL_CAT = "00000000-0000-0000-0000-000000000000"


async def update_league_score(
    db: AsyncSession,
    user_id: str,
    match_score: float,
    match_id: str,
    score_date: date = None,
    category_id: str = None,   # None -> genel lig, dolu -> o kategorinin ligi
):
    """
    Maç bitince çağrılır.
    Günlük en yüksek skoru günceller, lig tablosuna yansıtır.
    category_id verilirse SADECE o kategorinin ligine yazar (genele karışmaz).
    Doküman Bölüm 7.3.1: Günlük en yüksek tek skor kuralı.
    """
    if score_date is None:
        score_date = date.today()

    cat = str(category_id) if category_id else None

    # Bugünkü mevcut skoru çek (aynı kategori kırılımında)
    q = select(DailyScore).where(
        DailyScore.user_id == user_id,
        DailyScore.score_date == score_date,
    )
    if cat is None:
        q = q.where(DailyScore.category_id.is_(None))
    else:
        q = q.where(DailyScore.category_id == cat)
    result = await db.execute(q)
    daily = result.scalar_one_or_none()

    old_best = 0
    new_record = False

    if daily is None:
        daily = DailyScore(
            user_id=user_id,
            score_date=score_date,
            best_score=match_score,
            match_id=match_id,
            category_id=cat,
        )
        db.add(daily)
        old_best = 0
        new_record = True
    elif match_score > daily.best_score:
        old_best = daily.best_score
        daily.best_score = match_score
        daily.match_id = match_id
        new_record = True

    if not new_record:
        await db.commit()
        return {"new_record": False, "best_score": daily.best_score}

    score_diff = float(match_score) - float(old_best)
    print(f"[LEAGUE] cat={cat} match_score={match_score} old_best={old_best} diff={score_diff}")

    year = score_date.year
    month = score_date.month
    day = score_date.day

    # cat parametresini SQL'e güvenli geçirmek için değer
    cat_val = cat  # None ya da uuid string

    # ── Günlük lig ──
    dq = select(LeagueEntry).where(
        LeagueEntry.user_id == user_id,
        LeagueEntry.period_type == "daily",
        LeagueEntry.period_year == year,
        LeagueEntry.period_month == month,
        LeagueEntry.period_day == day,
    )
    dq = dq.where(LeagueEntry.category_id.is_(None)) if cat is None else dq.where(LeagueEntry.category_id == cat)
    daily_entry = (await db.execute(dq)).scalar_one_or_none()
    if daily_entry is None:
        await db.execute(_t("""
            INSERT INTO league_entries (id, user_id, category_id, period_type, period_year, period_month, period_day, total_score, days_played)
            VALUES (:id, :uid, :cat, 'daily', :year, :month, :day, :score, 1)
        """), {"id": str(_uuid.uuid4()), "uid": user_id, "cat": cat_val, "year": year, "month": month, "day": day, "score": float(match_score)})
    else:
        new_score = round(float(daily_entry.total_score) + float(score_diff), 2)
        daily_entry.total_score = new_score
        if old_best == 0:
            daily_entry.days_played += 1

    # ── Aylık lig ──
    mq = select(LeagueEntry).where(
        LeagueEntry.user_id == user_id,
        LeagueEntry.period_type == "monthly",
        LeagueEntry.period_year == year,
        LeagueEntry.period_month == month,
    )
    mq = mq.where(LeagueEntry.category_id.is_(None)) if cat is None else mq.where(LeagueEntry.category_id == cat)
    monthly_entry = (await db.execute(mq)).scalar_one_or_none()
    if monthly_entry is None:
        await db.execute(_t("""
            INSERT INTO league_entries (id, user_id, category_id, period_type, period_year, period_month, total_score, days_played)
            VALUES (:id, :uid, :cat, 'monthly', :year, :month, :score, 1)
        """), {"id": str(_uuid.uuid4()), "uid": user_id, "cat": cat_val, "year": year, "month": month, "score": float(match_score)})
    else:
        new_monthly = round(float(monthly_entry.total_score) + float(score_diff), 2)
        await db.execute(_t("UPDATE league_entries SET total_score = :score WHERE id = :id"),
                         {"score": new_monthly, "id": str(monthly_entry.id)})
        if old_best == 0:
            monthly_entry.days_played += 1

    # ── Yıllık lig ──
    yq = select(LeagueEntry).where(
        LeagueEntry.user_id == user_id,
        LeagueEntry.period_type == "yearly",
        LeagueEntry.period_year == year,
        LeagueEntry.period_month.is_(None),
    )
    yq = yq.where(LeagueEntry.category_id.is_(None)) if cat is None else yq.where(LeagueEntry.category_id == cat)
    yearly_entry = (await db.execute(yq)).scalar_one_or_none()
    if yearly_entry is None:
        await db.execute(_t("""
            INSERT INTO league_entries (id, user_id, category_id, period_type, period_year, period_month, total_score, days_played)
            VALUES (:id, :uid, :cat, 'yearly', :year, NULL, :score, 1)
        """), {"id": str(_uuid.uuid4()), "uid": user_id, "cat": cat_val, "year": year, "score": float(match_score)})
    else:
        new_yearly = round(float(yearly_entry.total_score) + float(score_diff), 2)
        await db.execute(_t("UPDATE league_entries SET total_score = :score WHERE id = :id"),
                         {"score": new_yearly, "id": str(yearly_entry.id)})
        if old_best == 0:
            yearly_entry.days_played += 1

    await db.commit()

    return {
        "new_record": True,
        "best_score": match_score,
        "old_best": old_best,
        "score_diff": score_diff,
    }


async def get_league_table(
    db: AsyncSession,
    period_type: str,
    year: int,
    month: int = None,
    limit: int = 50,
    day: int = None,
    category_id: str = None,   # None -> genel lig, dolu -> kategori ligi
):
    """Lig tablosunu döndür."""
    from app.models.user import User

    query = select(
        LeagueEntry.user_id,
        LeagueEntry.total_score,
        LeagueEntry.days_played,
        User.username,
        User.elo_rating,
        User.xp,
    ).join(
        User, User.id == LeagueEntry.user_id
    ).where(
        LeagueEntry.period_type == period_type,
        LeagueEntry.period_year == year,
    )

    # Kategori kırılımı
    if category_id is None:
        query = query.where(LeagueEntry.category_id.is_(None))
    else:
        query = query.where(LeagueEntry.category_id == str(category_id))

    if period_type == "daily" and month and day:
        query = query.where(LeagueEntry.period_month == month)
        query = query.where(LeagueEntry.period_day == day)
    elif period_type == "monthly" and month:
        query = query.where(LeagueEntry.period_month == month)
    elif period_type == "yearly":
        query = query.where(LeagueEntry.period_month.is_(None))

    query = query.order_by(LeagueEntry.total_score.desc()).limit(limit)

    result = await db.execute(query)
    rows = result.fetchall()

    return [
        {
            "rank": i + 1,
            "username": row.username,
            "total_score": row.total_score,
            "days_played": row.days_played,
            "elo_rating": round(row.elo_rating),
        }
        for i, row in enumerate(rows)
    ]
