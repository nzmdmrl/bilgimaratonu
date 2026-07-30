# YOL: backend/app/api/routes/league.py
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from datetime import datetime, date
from app.core.database import get_db
from app.services.league import get_league_table
from app.models.question import Category

MONTHS_TR = {
    1: "Ocak", 2: "Şubat", 3: "Mart", 4: "Nisan",
    5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
    9: "Eylül", 10: "Ekim", 11: "Kasım", 12: "Aralık"
}

router = APIRouter(prefix="/api/league", tags=["league"])


async def _resolve_category_id(db: AsyncSession, category: str = None):
    """slug -> category UUID. None/'genel' ise None (genel lig)."""
    if not category or category == "genel":
        return None
    res = await db.execute(select(Category).where(Category.slug == category))
    cat = res.scalar_one_or_none()
    return str(cat.id) if cat else None


@router.get("/categories")
async def league_categories(db: AsyncSession = Depends(get_db)):
    """Buton grubu için: kategori maçı açık kategoriler."""
    res = await db.execute(
        select(Category).where(Category.has_category_match == True).order_by(Category.name)
    )
    cats = res.scalars().all()
    return {
        "categories": [
            {"slug": c.slug, "name": c.name}
            for c in cats
        ]
    }


@router.get("/daily")
async def daily_league(
    category: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    cat_id = await _resolve_category_id(db, category)
    table = await get_league_table(db, "daily", today.year, today.month, limit, day=today.day, category_id=cat_id)
    return {
        "period": str(today),
        "period_label": f"{today.day} {MONTHS_TR[today.month]} {today.year}",
        "category": category or "genel",
        "table": table,
    }


@router.get("/monthly")
async def monthly_league(
    year: int = None,
    month: int = None,
    category: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now()
    year = year or now.year
    month = month or now.month
    cat_id = await _resolve_category_id(db, category)
    table = await get_league_table(db, "monthly", year, month, limit, category_id=cat_id)
    return {
        "period": f"{year}-{month:02d}",
        "period_label": f"{MONTHS_TR[month]} {year}",
        "category": category or "genel",
        "table": table,
    }


@router.get("/yearly")
async def yearly_league(
    year: int = None,
    category: str = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now()
    year = year or now.year
    cat_id = await _resolve_category_id(db, category)
    table = await get_league_table(db, "yearly", year, limit=limit, category_id=cat_id)
    return {
        "period": str(year),
        "period_label": f"{year} Yılı",
        "category": category or "genel",
        "table": table,
    }


def _period_label(period_type: str, pkey: str) -> str:
    """period_key -> okunur etiket."""
    try:
        if period_type == "daily":
            y, m, d = pkey.split("-")
            return f"{int(d)} {MONTHS_TR[int(m)]} {y}"
        if period_type == "monthly":
            y, m = pkey.split("-")
            return f"{MONTHS_TR[int(m)]} {y}"
        return f"{pkey} Yılı"
    except Exception:
        return pkey


@router.get("/past-winners")
async def past_winners(
    period_type: str = "daily",
    category: str = None,
    limit: int = 3,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
):
    """Önceki dönem kazananları (1-2-3). En yeni dönem başta.
    limit = kaç dönem, offset = kaçıncı dönemden itibaren (arşiv için)."""
    if period_type not in ("daily", "monthly", "yearly"):
        period_type = "daily"
    limit = max(1, min(60, limit))
    offset = max(0, offset)
    cat_id = await _resolve_category_id(db, category)

    cat_clause = "category_id IS NULL" if cat_id is None else "category_id = :cat"
    cat_clause_a = "a.category_id IS NULL" if cat_id is None else "a.category_id = :cat"
    params = {"pt": period_type, "lim": limit, "off": offset}
    if cat_id is not None:
        params["cat"] = cat_id

    rows = (await db.execute(text(f"""
        WITH pk AS (
            SELECT DISTINCT period_key FROM achievements
            WHERE ach_type IN ('trophy','medal') AND period_type = :pt
                  AND {cat_clause} AND period_key IS NOT NULL AND rank IN (1,2,3)
            ORDER BY period_key DESC
            LIMIT :lim OFFSET :off
        )
        SELECT a.period_key, a.rank, u.username, u.avatar_url
        FROM achievements a
        JOIN users u ON u.id = a.user_id
        WHERE a.ach_type IN ('trophy','medal') AND a.period_type = :pt
              AND {cat_clause_a} AND a.rank IN (1,2,3)
              AND a.period_key IN (SELECT period_key FROM pk)
        ORDER BY a.period_key DESC, a.rank ASC
    """), params)).fetchall()

    periods = []
    for pkey, rank, username, avatar in rows:
        if not periods or periods[-1]["period_key"] != pkey:
            periods.append({"period_key": pkey, "label": _period_label(period_type, pkey), "winners": []})
        periods[-1]["winners"].append({"rank": rank, "username": username, "avatar_url": avatar or ""})

    return {
        "period_type": period_type,
        "category": category or "genel",
        "periods": periods,
        "has_more": len(periods) >= limit,
    }


@router.get("/recent-matches")
async def recent_matches(limit: int = 8, db: AsyncSession = Depends(get_db)):
    """Herkese açık — son oynanan maçlar."""
    from app.models.match import Match, MatchStatus
    from app.models.user import User as UserModel
    from sqlalchemy.orm import aliased

    P1 = aliased(UserModel)
    P2 = aliased(UserModel)

    result = await db.execute(
        select(Match, P1.username.label("p1_name"), P2.username.label("p2_name"),
               P1.avatar_url.label("p1_avatar"), P2.avatar_url.label("p2_avatar"))
        .join(P1, Match.player1_id == P1.id)
        .join(P2, Match.player2_id == P2.id)
        .where(Match.status == MatchStatus.finished)
        .order_by(Match.finished_at.desc())
        .limit(limit)
    )
    rows = result.fetchall()
    matches = []
    for m, p1_name, p2_name, p1_avatar, p2_avatar in rows:
        matches.append({
            "match_id": str(m.id),
            "player1": p1_name,
            "player2": p2_name,
            "score1": m.player1_score,
            "score2": m.player2_score,
            "elo1": round(m.player1_elo_after or 0),
            "elo2": round(m.player2_elo_after or 0),
            "avatar1": p1_avatar or "",
            "avatar2": p2_avatar or "",
            "winner": p1_name if str(m.winner_id) == str(m.player1_id) else (p2_name if m.winner_id else None),
            "finished_at": m.finished_at.strftime("%d.%m.%Y %H:%M") if m.finished_at else "",
        })
    return {"matches": matches}
