from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from typing import Optional, List
from app.models.badge import Badge, UserBadge
from app.models.match import Match, MatchAnswer, MatchStatus
from app.models.question import Question
from app.models.marathon import MarathonParticipant, MarathonParticipantStatus

# Tüm rozet tanımları
ALL_BADGES = [
    # Maç rozetleri
    {"code": "first_match",    "name": "İlk Adım",       "icon": "🎮", "category": "match",    "description": "İlk maçını tamamla",                     "requirement": 1},
    {"code": "win_streak_3",   "name": "Seri Avcısı",    "icon": "🔥", "category": "match",    "description": "3 maçı üst üste kazan",                  "requirement": 3},
    {"code": "win_10",         "name": "10 Galibiyet",   "icon": "💪", "category": "match",    "description": "Toplam 10 maç kazan",                    "requirement": 10},
    {"code": "win_50",         "name": "50 Galibiyet",   "icon": "🏆", "category": "match",    "description": "Toplam 50 maç kazan",                    "requirement": 50},
    {"code": "perfect_match",  "name": "Mükemmel Maç",   "icon": "🎯", "category": "match",    "description": "Tüm soruları doğru cevapla",              "requirement": 1},
    {"code": "quick_answer",   "name": "Hızlı El",       "icon": "⚡", "category": "match",    "description": "5 saniye içinde doğru cevap ver",         "requirement": 1},
    # Maraton rozetleri
    {"code": "marathon_join",  "name": "Maratoncu",      "icon": "🏅", "category": "marathon", "description": "İlk maratona katıl",                     "requirement": 1},
    {"code": "marathon_semi",  "name": "Final Yolcusu",  "icon": "🥉", "category": "marathon", "description": "Yarı finale çık (Son 4)",                 "requirement": 1},
    {"code": "marathon_champ", "name": "Şampiyon",       "icon": "🥇", "category": "marathon", "description": "Maratonu kazan",                         "requirement": 1},
]

async def seed_badges(db: AsyncSession):
    """Rozet tanımlarını DB'ye ekle."""
    for b in ALL_BADGES:
        existing = await db.execute(select(Badge).where(Badge.code == b["code"]))
        if not existing.scalar_one_or_none():
            db.add(Badge(**b))
    await db.commit()

async def get_user_badges(db: AsyncSession, user_id: str) -> List[dict]:
    """Kullanıcının rozetlerini döndür."""
    result = await db.execute(
        select(UserBadge, Badge)
        .join(Badge, Badge.id == UserBadge.badge_id)
        .where(UserBadge.user_id == user_id)
        .order_by(UserBadge.earned_at.desc())
    )
    rows = result.fetchall()
    return [{
        "code": b.code,
        "name": b.name,
        "icon": b.icon,
        "description": b.description,
        "category": b.category,
        "earned_at": ub.earned_at.strftime("%d.%m.%Y"),
        "seen": ub.seen,
    } for ub, b in rows]

async def award_badge(db: AsyncSession, user_id: str, badge_code: str) -> Optional[dict]:
    """Rozet ver — zaten varsa atla."""
    # Rozeti bul
    b_result = await db.execute(select(Badge).where(Badge.code == badge_code))
    badge = b_result.scalar_one_or_none()
    if not badge:
        return None

    # Zaten var mı?
    existing = await db.execute(
        select(UserBadge).where(
            UserBadge.user_id == user_id,
            UserBadge.badge_id == badge.id,
        )
    )
    if existing.scalar_one_or_none():
        return None

    # Ver
    user_badge = UserBadge(user_id=user_id, badge_id=badge.id)
    db.add(user_badge)
    await db.commit()

    # Yeni achievements tablosuna da yaz (profil buradan okur)
    try:
        from app.services.achievement import award_badge_achievement
        await award_badge_achievement(db, user_id, badge.code)
    except Exception as _e:
        print(f"[BADGE] achievements köprü hatası: {_e}")

    return {
        "code": badge.code,
        "name": badge.name,
        "icon": badge.icon,
        "description": badge.description,
    }

async def check_and_award_match_badges(
    db: AsyncSession,
    user_id: str,
    match_id: str,
    won: bool,
    total_matches: int,
    total_wins: int,
) -> List[dict]:
    """Maç sonrası rozet kontrolü."""
    earned = []
    print(f"[BADGE] user:{user_id[:8]} matches:{total_matches} wins:{total_wins} won:{won}")

    # İlk maç — ilk kez oynandı
    if total_matches >= 1:
        b = await award_badge(db, user_id, "first_match")
        if b:
            earned.append(b)
            print(f"[BADGE] first_match verildi!")

    # 100 galibiyet
    if won and total_wins == 100:
        b = await award_badge(db, user_id, "win_100")
        if b: earned.append(b)

    # 500 galibiyet
    if won and total_wins == 500:
        b = await award_badge(db, user_id, "win_500")
        if b: earned.append(b)

    # 1000 galibiyet
    if won and total_wins == 1000:
        b = await award_badge(db, user_id, "win_1000")
        if b: earned.append(b)

    # Mükemmel maç — tüm cevaplar doğru
    if won:
        ans_result = await db.execute(
            select(MatchAnswer).where(
                MatchAnswer.match_id == match_id,
                MatchAnswer.user_id == user_id,
            )
        )
        answers = ans_result.scalars().all()
        if answers and all(a.is_correct for a in answers):
            b = await award_badge(db, user_id, "perfect_match")
            if b: earned.append(b)

    # Hızlı cevap — 5sn içinde doğru
    fast_result = await db.execute(
        select(MatchAnswer).where(
            MatchAnswer.match_id == match_id,
            MatchAnswer.user_id == user_id,
            MatchAnswer.is_correct == True,
            MatchAnswer.response_time_ms <= 5000,
        )
    )
    if fast_result.scalar_one_or_none():
        b = await award_badge(db, user_id, "quick_answer")
        if b: earned.append(b)

    # 3 üst üste galibiyet — son 3 maça bak
    if won:
        recent = await db.execute(
            select(Match).where(
                (Match.player1_id == user_id) | (Match.player2_id == user_id),
                Match.status == MatchStatus.finished,
            ).order_by(Match.finished_at.desc()).limit(3)
        )
        recent_matches = recent.scalars().all()
        if len(recent_matches) == 3 and all(str(m.winner_id) == user_id for m in recent_matches):
            b = await award_badge(db, user_id, "win_streak_3")
            if b: earned.append(b)

    return earned

async def check_category_badges(
    db: AsyncSession,
    user_id: str,
) -> List[dict]:
    """Kategori bazlı rozet kontrolü — her kategori için 50/100/250 doğru cevap.
    Rozet kodları: cat_{slug}_meraklisi / _bilgini / _ustasi
    Yalnızca has_category_match=True kategoriler için rozet verilir."""
    from app.models.question import Question, Category

    earned = []

    # Kademeler (badge.py CATEGORY_BADGE_TEMPLATE ile aynı eşikler)
    tiers = [(50, "meraklisi"), (100, "bilgini"), (250, "ustasi")]

    # Kategori maçı açık kategoriler: id -> slug
    cat_res = await db.execute(
        select(Category.id, Category.slug).where(Category.has_category_match == True)
    )
    cat_slug = {str(cid): slug for cid, slug in cat_res.fetchall()}
    if not cat_slug:
        return earned

    # Kullanıcının tüm cevapları
    all_ans = await db.execute(
        select(MatchAnswer.question_id, MatchAnswer.is_correct)
        .where(MatchAnswer.user_id == user_id)
    )
    answers = all_ans.fetchall()

    # Soru -> kategori
    all_q = await db.execute(select(Question.id, Question.category_id))
    q_cat = {str(qid): str(cid) for qid, cid in all_q.fetchall()}

    # Kategori bazlı doğru cevap sayısı
    correct_by_cat = {}
    for qid, is_correct in answers:
        if not is_correct:
            continue
        cid = q_cat.get(str(qid))
        if cid and cid in cat_slug:
            correct_by_cat[cid] = correct_by_cat.get(cid, 0) + 1

    for cid, correct in correct_by_cat.items():
        slug_key = cat_slug[cid].replace("-", "_")
        for threshold, suffix in tiers:
            if correct >= threshold:
                code = f"cat_{slug_key}_{suffix}"
                b = await award_badge(db, user_id, code)
                if b:
                    earned.append(b)

    return earned


async def check_marathon_badges(
    db: AsyncSession,
    user_id: str,
    status: str,  # 'active', 'eliminated', 'champion', 'second', 'third'
    eliminated_at_round: Optional[int],
) -> List[dict]:
    """Maraton rozet kontrolü."""
    earned = []

    # İlk maraton katılımı
    b = await award_badge(db, user_id, "marathon_join")
    if b: earned.append(b)

    # Yarı final (tur 6+)
    if eliminated_at_round and eliminated_at_round >= 6 or status in ['champion', 'second']:
        b = await award_badge(db, user_id, "marathon_semi")
        if b: earned.append(b)

    # Şampiyon
    if status == 'champion':
        b = await award_badge(db, user_id, "marathon_champ")
        if b: earned.append(b)

    return earned



# ── Kategori Rozet Şablonu ──────────────────────────────────────────────
# Her has_category_match=True kategori için otomatik üretilen 3 kademe.
CATEGORY_BADGE_TEMPLATE = [
    {"suffix": "meraklisi", "title": "Meraklısı", "icon": "🌱", "requirement": 50},
    {"suffix": "bilgini",   "title": "Bilgini",   "icon": "⭐", "requirement": 100},
    {"suffix": "ustasi",    "title": "Ustası",    "icon": "👑", "requirement": 250},
]


def _slug_key(slug: str) -> str:
    """Slug'ı rozet kodunda kullanılabilir hale getir (tire -> alt çizgi)."""
    return (slug or "").replace("-", "_")


def category_badge_defs(slug: str, category_name: str) -> list:
    """Bir kategori için 3 rozet tanımını (badges tablosu formatında) üret."""
    key = _slug_key(slug)
    defs = []
    for t in CATEGORY_BADGE_TEMPLATE:
        defs.append({
            "code": f"cat_{key}_{t['suffix']}",
            "name": f"{category_name} {t['title']}",
            "icon": t["icon"],
            "category": "category",
            "description": f"{category_name} kategorisinde {t['requirement']} doğru cevap ver",
            "requirement": t["requirement"],
        })
    return defs


async def sync_category_badges(db: AsyncSession, slug: str, category_name: str):
    """Bir kategori için rozet tanımlarını badges tablosuna ekle (varsa atla).
    Admin kategori kaydettiğinde çağrılır."""
    for b in category_badge_defs(slug, category_name):
        existing = await db.execute(select(Badge).where(Badge.code == b["code"]))
        if not existing.scalar_one_or_none():
            db.add(Badge(**b))
    await db.commit()


async def sync_all_category_badges(db: AsyncSession):
    """Tüm has_category_match=True kategoriler için rozetleri senkronize et."""
    from app.models.question import Category
    res = await db.execute(select(Category).where(Category.has_category_match == True))
    cats = res.scalars().all()
    for c in cats:
        await sync_category_badges(db, c.slug, c.name)
    return len(cats)
