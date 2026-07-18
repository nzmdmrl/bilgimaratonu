"""
Başarı Motoru — Tüm maç tiplerinden çağrılır.
XP, lig, rozet, bildirim işlemlerini merkezi yönetir.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date
from typing import Optional
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.match import Match, MatchAnswer, MatchStatus
from app.models.badge import Badge, UserBadge

# ─── XP Kuralları ────────────────────────────────────────────────────────────

XP_RULES = {
    "match_win":       50,
    "match_lose":      10,
    "match_draw":      25,
    "correct_answer":   2,
    "perfect_match":   30,
    "first_win_day":   20,
}

# ─── Rozet Kuralları ─────────────────────────────────────────────────────────

BADGE_RULES = [
    # kod,              kontrol fonksiyonu
    ("first_match",    lambda ctx: ctx["total_matches"] >= 1),
    ("win_10",         lambda ctx: ctx["won"] and ctx["total_wins"] >= 10),
    ("win_50",         lambda ctx: ctx["won"] and ctx["total_wins"] >= 50),
    ("perfect_match",  lambda ctx: ctx["won"] and ctx["correct"] == ctx["total_questions"]),
    ("quick_answer",   lambda ctx: ctx["has_quick_answer"]),
    ("win_streak_3",   lambda ctx: ctx["won"] and ctx["win_streak"] >= 3),
    ("win_streak_10",  lambda ctx: ctx["won"] and ctx["win_streak"] >= 10),
    ("marathon_join",  lambda ctx: ctx.get("marathon_join", False)),
    ("marathon_semi",  lambda ctx: ctx.get("marathon_semi", False)),
    ("marathon_champ", lambda ctx: ctx.get("marathon_champ", False)),
    # Kategori rozetleri ayrı işlenir
]

# ─── Ana Fonksiyon ───────────────────────────────────────────────────────────

async def process_match_result(
    user_id: str,
    match_id: str,
    match_type: str,          # '1v1', 'bot', 'marathon'
    won: bool,
    draw: bool = False,
    correct_answers: int = 0,
    total_questions: int = 15,
    min_response_time_ms: int = 99999,  # En hızlı doğru cevap
    marathon_data: dict = None,          # Maraton özel verileri
    my_score: float = None,              # Maç puanı (küsüratlı)
) -> dict:
    """
    Maç sonucu işle — XP, lig, rozet, bildirim.
    Returns: {xp_gained, xp_breakdown, new_badges, league_record}
    """
    result = {
        "xp_gained": 0,
        "xp_breakdown": [],
        "new_badges": [],
        "league_record": False,
        "title_changed": False,
        "new_title": None,
    }

    async with AsyncSessionLocal() as db:
        # Kullanıcıyı çek
        u_res = await db.execute(select(User).where(User.id == user_id))
        user = u_res.scalar_one_or_none()
        if not user or user.is_bot:
            return result

        # ── XP Hesapla ────────────────────────────────────────────────────
        xp = 0
        breakdown = []

        if won:
            xp += XP_RULES["match_win"]
            breakdown.append({"reason": "Maç kazandın", "xp": XP_RULES["match_win"]})
        elif draw:
            xp += XP_RULES["match_draw"]
            breakdown.append({"reason": "Beraberlik", "xp": XP_RULES["match_draw"]})
        else:
            xp += XP_RULES["match_lose"]
            breakdown.append({"reason": "Maça katıldın", "xp": XP_RULES["match_lose"]})

        if correct_answers > 0:
            ca_xp = correct_answers * XP_RULES["correct_answer"]
            xp += ca_xp
            breakdown.append({"reason": f"{correct_answers} doğru cevap", "xp": ca_xp})

        if won and correct_answers == total_questions and total_questions > 0:
            xp += XP_RULES["perfect_match"]
            breakdown.append({"reason": "Mükemmel maç!", "xp": XP_RULES["perfect_match"]})

        # Günün ilk galibiyeti
        if won:
            from datetime import datetime
            today_start = datetime.combine(date.today(), datetime.min.time())
            prev_wins = await db.execute(
                select(Match.id).where(
                    Match.winner_id == user_id,
                    Match.finished_at >= today_start,
                    Match.id != match_id,
                ).limit(1)
            )
            if prev_wins.scalar_one_or_none() is None:
                xp += XP_RULES["first_win_day"]
                breakdown.append({"reason": "Günün ilk galibiyeti", "xp": XP_RULES["first_win_day"]})

        # XP uygula
        from app.services.xp import get_title, TITLES
        old_title = get_title(user.xp)
        user.xp += xp
        new_title = get_title(user.xp)
        title_changed = old_title["title"] != new_title["title"]

        result["xp_gained"] = xp
        result["xp_breakdown"] = breakdown
        result["title_changed"] = title_changed
        result["new_title"] = new_title if title_changed else None

        await db.commit()

        # ── Lig Güncelle ─────────────────────────────────────────────────
        if match_type != "marathon" and match_type != "bot":
            from app.services.league import update_league_score

            # Maç skorunu ve kategorisini bul
            _match_category_id = None
            match_res = await db.execute(select(Match).where(Match.id == match_id))
            match_obj = match_res.scalar_one_or_none()
            if match_obj:
                _match_category_id = match_obj.category_id
                if my_score is None:
                    is_p1 = str(match_obj.player1_id) == user_id
                    my_score = float(match_obj.player1_score if is_p1 else match_obj.player2_score)

            if my_score is not None:
                async with AsyncSessionLocal() as league_db:
                    league_res = await update_league_score(
                        league_db, user_id, float(my_score), match_id, date.today(),
                        category_id=_match_category_id,
                    )
                    result["league_record"] = league_res.get("new_record", False)
                    

        # ── Rozet Kontrolü ───────────────────────────────────────────────
        # Win streak hesapla
        from app.models.match import Match as MatchModel
        recent_res = await db.execute(
            select(MatchModel).where(
                (MatchModel.player1_id == user_id) | (MatchModel.player2_id == user_id),
                MatchModel.status == MatchStatus.finished,
            ).order_by(MatchModel.finished_at.desc()).limit(3)
        )
        recent = recent_res.scalars().all()
        win_streak = sum(1 for m in recent if str(m.winner_id) == user_id)

        # Hızlı cevap var mı?
        has_quick = min_response_time_ms <= 5000

        ctx = {
            "won": won,
            "draw": draw,
            "total_matches": user.total_matches,
            "total_wins": user.total_wins,
            "correct": correct_answers,
            "total_questions": total_questions,
            "has_quick_answer": has_quick,
            "win_streak": win_streak,
        }

        # Maraton verileri
        if marathon_data:
            ctx.update(marathon_data)

        new_badges = []
        for badge_code, check_fn in BADGE_RULES:
            try:
                if check_fn(ctx):
                    badge = await _award_badge(db, user_id, badge_code)
                    if badge:
                        new_badges.append(badge)
            except Exception as _be:
                print(f"[BADGE ERROR] {badge_code}: {_be}")

        # Kategori rozetleri (badge.py — kategori-spesifik 50/100/250)
        from app.services.badge import check_category_badges
        cat_badges = await check_category_badges(db, user_id)
        new_badges.extend(cat_badges)

        result["new_badges"] = new_badges

    return result


async def _award_badge(db: AsyncSession, user_id: str, badge_code: str) -> Optional[dict]:
    """Rozet ver — zaten varsa None döndür."""
    b_res = await db.execute(select(Badge).where(Badge.code == badge_code))
    badge = b_res.scalar_one_or_none()
    if not badge:
        return None

    existing = await db.execute(
        select(UserBadge).where(
            UserBadge.user_id == user_id,
            UserBadge.badge_id == badge.id,
        )
    )
    if existing.scalar_one_or_none():
        return None

    db.add(UserBadge(user_id=user_id, badge_id=badge.id))
    await db.commit()

    # achievements köprüsü — profilde görünsün
    try:
        from app.services.achievement import award_badge_achievement
        await award_badge_achievement(db, user_id, badge_code)
    except Exception as _e:
        print(f"[BADGE BRIDGE ERROR] {badge_code}: {_e}")

    return {
        "code": badge.code,
        "name": badge.name,
        "icon": badge.icon,
        "description": badge.description,
    }


async def _check_category_badges(db: AsyncSession, user_id: str) -> list:
    """Kategori bazlı rozet kontrolü."""
    from app.models.match import MatchAnswer
    from app.models.question import Question

    earned = []

    all_ans = await db.execute(
        select(MatchAnswer.question_id, MatchAnswer.is_correct)
        .where(MatchAnswer.user_id == user_id)
    )
    answers = all_ans.fetchall()

    all_q = await db.execute(select(Question.id, Question.category_id))
    q_cat = {str(qid): str(cid) for qid, cid in all_q.fetchall()}

    cat_stats: dict = {}
    for qid, is_correct in answers:
        cat_id = q_cat.get(str(qid))
        if not cat_id:
            continue
        if cat_id not in cat_stats:
            cat_stats[cat_id] = {"total": 0, "correct": 0}
        cat_stats[cat_id]["total"] += 1
        if is_correct:
            cat_stats[cat_id]["correct"] += 1

    for cat_id, stats in cat_stats.items():
        total = stats["total"]
        accuracy = stats["correct"] / total if total > 0 else 0

        if total >= 10:
            b = await _award_badge(db, user_id, "cat_beginner")
            if b: earned.append(b)
        if total >= 25 and accuracy >= 0.70:
            b = await _award_badge(db, user_id, "cat_expert")
            if b: earned.append(b)
        if total >= 50 and accuracy >= 0.80:
            b = await _award_badge(db, user_id, "cat_master")
            if b: earned.append(b)

    return earned
