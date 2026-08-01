from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.match import Match, MatchAnswer, MatchStatus
from app.models.question import Category, Question

router = APIRouter(prefix="/api/profile", tags=["profile"])

@router.get("/{username}")
async def get_profile(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == username, User.deleted_at == None)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    total = user.total_matches
    wins = user.total_wins
    win_rate = round((wins / total * 100), 1) if total > 0 else 0.0

    from sqlalchemy import func as _func
    from app.models.solo import SoloProgress
    stars_res = await db.execute(
        select(_func.coalesce(_func.sum(SoloProgress.stars), 0)).where(SoloProgress.user_id == user.id)
    )
    solo_stars = int(stars_res.scalar() or 0)

    return {
        "id": str(user.id),
        "username": user.username,
        "xp": user.xp,
        "elo_rating": round(user.elo_rating, 0),
        "trust_level": user.trust_level,
        "total_matches": total,
        "total_wins": wins,
        "total_losses": user.total_losses,
        "win_rate": win_rate,
        "solo_stars": solo_stars,
        "created_at": user.created_at.strftime("%B %Y") if user.created_at else "",
        "avatar_url": user.avatar_url or "",
    }

@router.get("/{username}/stats")
async def get_profile_stats(username: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.username == username, User.deleted_at == None)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    # Tüm kategoriler
    cats_result = await db.execute(
        select(Category).where(Category.is_active == True).order_by(Category.display_order)
    )
    categories = cats_result.scalars().all()



    # Kategori bazlı istatistik — direkt JOIN ile
    from sqlalchemy import func, case
    category_stats = []
    for cat in categories:
        result = await db.execute(
            select(
                func.count(MatchAnswer.id).label("total"),
                func.sum(case((MatchAnswer.is_correct == True, 1), else_=0)).label("correct")
            )
            .join(Question, Question.id == MatchAnswer.question_id)
            .where(
                MatchAnswer.user_id == user.id,
                Question.category_id == cat.id,
            )
        )
        row = result.fetchone()
        total_ans = row.total or 0
        correct_ans = row.correct or 0
        wrong_ans = total_ans - correct_ans
        accuracy = round((correct_ans / total_ans * 100), 1) if total_ans > 0 else 0.0
        category_stats.append({
            "category": cat.name,
            "slug": cat.slug,
            "icon": cat.icon,
            "total": total_ans,
            "correct": correct_ans,
            "wrong": wrong_ans,
            "accuracy": accuracy,
        })

    # Zorluk bazlı istatistik — direkt JOIN ile
    diff_labels = {"easy": "Kolay", "medium": "Orta", "hard": "Zor", "very_hard": "Çok Zor"}
    difficulty_stats = []
    for diff in ["easy", "medium", "hard", "very_hard"]:
        result = await db.execute(
            select(
                func.count(MatchAnswer.id).label("total"),
                func.sum(case((MatchAnswer.is_correct == True, 1), else_=0)).label("correct")
            )
            .join(Question, Question.id == MatchAnswer.question_id)
            .where(
                MatchAnswer.user_id == user.id,
                Question.difficulty == diff,
            )
        )
        row = result.fetchone()
        total_ans = row.total or 0
        correct_ans = row.correct or 0
        accuracy = round((correct_ans / total_ans * 100), 1) if total_ans > 0 else 0.0
        difficulty_stats.append({
            "difficulty": diff,
            "label": diff_labels[diff],
            "total": total_ans,
            "correct": correct_ans,
            "accuracy": accuracy,
        })

    # Unvanları ayarlardan çek
    from app.services.settings_cache import get_cached_setting
    titles = await get_cached_setting("titles")

    return {
        "category_stats": category_stats,
        "difficulty_stats": difficulty_stats,
        "titles": titles,
    }

@router.get("/{username}/matches")
async def get_profile_matches(
    username: str,
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(User).where(User.username == username)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")

    matches_result = await db.execute(
        select(Match).where(
            ((Match.player1_id == user.id) | (Match.player2_id == user.id)),
            Match.status == MatchStatus.finished,
            Match.deleted_at == None,
        ).order_by(Match.finished_at.desc()).limit(limit)
    )
    matches = matches_result.scalars().all()

    # Rakip ID'lerini topla
    opp_ids = set()
    for m in matches:
        is_p1 = str(m.player1_id) == str(user.id)
        opp_id = m.player2_id if is_p1 else m.player1_id
        if opp_id:
            opp_ids.add(opp_id)

    # Rakiplerin bilgilerini çek
    opp_map = {}
    if opp_ids:
        opps_result = await db.execute(
            select(User.id, User.username).where(User.id.in_(opp_ids))
        )
        for opp_id, opp_username in opps_result.fetchall():
            opp_map[str(opp_id)] = opp_username

    result_list = []
    for m in matches:
        is_p1 = str(m.player1_id) == str(user.id)
        my_score = m.player1_score if is_p1 else m.player2_score
        opp_score = m.player2_score if is_p1 else m.player1_score
        opp_id = str(m.player2_id) if is_p1 else str(m.player1_id)
        opp_username = opp_map.get(opp_id, "Rakip")
        won = str(m.winner_id) == str(user.id) if m.winner_id else None
        elo_change = 0.0
        if is_p1 and m.player1_elo_after and m.player1_elo_before:
            elo_change = round(m.player1_elo_after - m.player1_elo_before, 1)
        elif not is_p1 and m.player2_elo_after and m.player2_elo_before:
            elo_change = round(m.player2_elo_after - m.player2_elo_before, 1)

        result_list.append({
            "match_id": str(m.id),
            "opponent_username": opp_username,
            "my_score": my_score,
            "opponent_score": opp_score,
            "won": won,
            "elo_change": elo_change,
            "finished_at": m.finished_at.strftime("%d.%m.%Y %H:%M") if m.finished_at else "",
        })

    return {"matches": result_list}


from pydantic import BaseModel as PydanticBaseModel
from datetime import datetime, timedelta

class UsernameUpdate(PydanticBaseModel):
    username: str

class PasswordUpdate(PydanticBaseModel):
    current_password: str
    new_password: str

class EmailUpdate(PydanticBaseModel):
    email: str

@router.get("/username-change-status")
async def username_change_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kullanıcı adı değiştirme durumu."""
    # updated_at kontrolü — ayda bir
    if current_user.updated_at:
        days_passed = (datetime.utcnow() - current_user.updated_at.replace(tzinfo=None)).days
        if days_passed < 30:
            return {"can_change": False, "days_left": 30 - days_passed}
    return {"can_change": True, "days_left": 0}

@router.put("/username")
async def update_username(
    req: UsernameUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    username = req.username.strip()
    if len(username) < 3 or len(username) > 20:
        raise HTTPException(status_code=400, detail="Kullanıcı adı 3-20 karakter olmalı.")
    import re
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        raise HTTPException(status_code=400, detail="Sadece harf, rakam ve _ kullanılabilir.")
    # Benzersizlik kontrolü
    existing = await db.execute(select(User).where(User.username == username, User.id != current_user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı kullanılıyor.")
    # Ayda bir kontrolü
    if current_user.updated_at:
        days_passed = (datetime.utcnow() - current_user.updated_at.replace(tzinfo=None)).days
        if days_passed < 30:
            raise HTTPException(status_code=400, detail=f"Kullanıcı adını {30-days_passed} gün sonra değiştirebilirsiniz.")
    current_user.username = username
    current_user.updated_at = datetime.utcnow()
    await db.commit()
    return {"ok": True}

@router.put("/password")
async def update_password(
    req: PasswordUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.core.security import verify_password, get_password_hash
    if not verify_password(req.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Mevcut şifre yanlış.")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalı.")
    current_user.hashed_password = get_password_hash(req.new_password)
    await db.commit()
    return {"ok": True}

@router.put("/email")
async def update_email(
    req: EmailUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    email = req.email.strip().lower()
    existing = await db.execute(select(User).where(User.email == email, User.id != current_user.id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Bu e-posta kullanılıyor.")
    current_user.email = email
    await db.commit()
    return {"ok": True}


class AvatarUrlUpdate(PydanticBaseModel):
    avatar_url: str

@router.put("/avatar-url")
async def update_avatar_url(
    req: AvatarUrlUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """DiceBear avatarı doğrudan ayarla (onay gerektirmez)."""
    url = (req.avatar_url or "").strip()
    if url:
        if not url.startswith("https://api.dicebear.com/"):
            raise HTTPException(status_code=400, detail="Sadece DiceBear avatarları kabul edilir.")
        if len(url) > 500:
            raise HTTPException(status_code=400, detail="Avatar bağlantısı çok uzun.")
    current_user.avatar_url = url or None
    await db.commit()
    return {"ok": True, "avatar_url": current_user.avatar_url or ""}


@router.get("/me/today")
async def my_today(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kullanıcının bugünkü özeti (TR günü)."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import text as _t
    now_utc = datetime.now(timezone.utc)
    tr = now_utc + timedelta(hours=3)
    start_utc = datetime(tr.year, tr.month, tr.day, tzinfo=timezone.utc) - timedelta(hours=3)
    uid = str(current_user.id)
    p = {"u": uid, "s": start_utc}

    ans = (await db.execute(_t("""
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN is_correct THEN 1 ELSE 0 END), 0) AS correct
        FROM match_answers WHERE user_id::text = :u AND created_at >= :s
    """), p)).mappings().first()

    mt = (await db.execute(_t("""
        SELECT COUNT(*) AS total,
               COALESCE(SUM(CASE WHEN winner_id::text = :u THEN 1 ELSE 0 END), 0) AS wins
        FROM matches
        WHERE status = 'finished' AND finished_at >= :s
              AND (player1_id::text = :u OR player2_id::text = :u)
    """), p)).mappings().first()

    total = int(ans["total"] or 0)
    correct = int(ans["correct"] or 0)
    return {
        "matches": int(mt["total"] or 0),
        "wins": int(mt["wins"] or 0),
        "answers": total,
        "correct": correct,
        "accuracy": round(correct / total * 100, 1) if total else 0.0,
    }


@router.get("/me/answers")
async def my_answered_questions(
    limit: int = 30,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Kullanıcının son cevapladığı sorular (maç + solo)."""
    limit = max(1, min(100, limit))
    offset = max(0, offset)
    rows = (await db.execute(
        select(MatchAnswer, Question, Category)
        .join(Question, Question.id == MatchAnswer.question_id)
        .outerjoin(Category, Category.id == Question.category_id)
        .where(MatchAnswer.user_id == current_user.id)
        .order_by(MatchAnswer.created_at.desc())
        .limit(limit).offset(offset)
    )).all()
    out = []
    for a, q, cat in rows:
        diff = q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty)
        out.append({
            "question_text": q.text,
            "selected": a.selected_answer,
            "correct_answer": q.correct_answer,
            "is_correct": bool(a.is_correct),
            "difficulty": diff,
            "category_name": cat.name if cat else "",
            "option_a": q.option_a, "option_b": q.option_b,
            "option_c": q.option_c, "option_d": q.option_d,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })
    return {"answers": out, "has_more": len(rows) >= limit}


@router.get("/{username}/achievements")
async def get_profile_achievements(username: str, db: AsyncSession = Depends(get_db)):
    """Kupa / madalya / rozet — kazanılan + kilitli slotlar."""
    from sqlalchemy import text as _t

    u = await db.execute(select(User).where(User.username == username, User.deleted_at == None))
    user = u.scalar_one_or_none()
    if not user:
        return {"trophies": [], "medals": [], "badges": [],
                "summary": {"trophies": 0, "medals": 0, "badges": 0}}
    uid = str(user.id)

    PT_TR = {"daily": "Günlük", "monthly": "Aylık", "yearly": "Yıllık"}
    PERIODS = ["daily", "monthly", "yearly"]

    # Ligler: Genel + kategori maçı açık kategoriler
    cats = (await db.execute(_t(
        "SELECT id, name FROM categories WHERE has_category_match = true ORDER BY name"
    ))).fetchall()
    leagues = [(None, "Genel")] + [(str(cid), name) for cid, name in cats]

    # Kazanılan kupa/madalya: (rank, period_type, category_id) -> adet
    won = {}
    wrows = (await db.execute(_t("""
        SELECT rank, period_type, category_id, COUNT(*) AS adet
        FROM achievements
        WHERE user_id = :uid AND ach_type IN ('trophy','medal')
        GROUP BY rank, period_type, category_id
    """), {"uid": uid})).fetchall()
    for rank, period_type, category_id, adet in wrows:
        won[(rank, period_type, str(category_id) if category_id else None)] = adet

    trophies = []
    for cat_id, lig_name in leagues:
        for pt in PERIODS:
            cnt = won.get((1, pt, cat_id), 0)
            trophies.append({
                "icon": "🏆",
                "title": f"{lig_name} {PT_TR[pt]} Şampiyon",
                "count": cnt, "earned": cnt > 0,
                "league": lig_name, "period_type": pt,
            })

    # Turnuva kupasi
    m_trophy = won.get((1, "marathon", None), 0)
    trophies.append({
        "icon": "🏆",
        "title": "Turnuva Şampiyonu",
        "count": m_trophy, "earned": m_trophy > 0,
        "league": "Turnuva", "period_type": "marathon",
    })

    medals = []
    for cat_id, lig_name in leagues:
        for pt in PERIODS:
            for rank, ic, rk in [(2, "🥈", "İkinci"), (3, "🥉", "Üçüncü")]:
                cnt = won.get((rank, pt, cat_id), 0)
                medals.append({
                    "icon": ic,
                    "title": f"{lig_name} {PT_TR[pt]} {rk}",
                    "count": cnt, "earned": cnt > 0,
                    "league": lig_name, "period_type": pt, "rank": rank,
                })

    # Turnuva madalyasi (2.lik)
    m_medal = won.get((2, "marathon", None), 0)
    medals.append({
        "icon": "🥈",
        "title": "Turnuva İkincisi",
        "count": m_medal, "earned": m_medal > 0,
        "league": "Turnuva", "period_type": "marathon", "rank": 2,
    })

    # Rozetler: tüm aktif tanımlar + kazanım durumu (kilitli/açık)
    all_badges = (await db.execute(_t("""
        SELECT code, name, icon, description, category
        FROM badges WHERE is_active = true ORDER BY category, requirement
    """))).fetchall()

    earned_codes = set()
    for (code,) in (await db.execute(_t(
        "SELECT ach_code FROM achievements WHERE user_id = :uid AND ach_type = 'badge'"
    ), {"uid": uid})).fetchall():
        if code:
            earned_codes.add(code)

    badges = [{
        "code": code, "name": name, "icon": icon,
        "description": desc, "category": category,
        "earned": code in earned_codes,
    } for code, name, icon, desc, category in all_badges]

    return {
        "trophies": trophies,
        "medals": medals,
        "badges": badges,
        "summary": {
            "trophies": sum(t["count"] for t in trophies),
            "medals": sum(m["count"] for m in medals),
            "badges": sum(1 for b in badges if b["earned"]),
        },
    }
