from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from app.models.user import User

# XP kazanım kuralları (Bölüm 12)
XP_RULES = {
    "match_win": 50,        # Maç kazanma
    "match_lose": 10,       # Maç kaybetme (oynamak da değerli)
    "match_draw": 25,       # Beraberlik
    "correct_answer": 2,    # Her doğru cevap
    "perfect_match": 30,    # Tüm soruları doğru cevaplama bonusu
    "first_win_day": 20,    # Günün ilk galibiyeti bonusu
    "streak_3": 15,         # 3 gün üst üste oynama bonusu
    "streak_7": 50,         # 7 gün üst üste oynama bonusu
}

# Unvan sistemi (Bölüm 12)
TITLES = [
    {"min_xp": 0,     "title": "Çaylak",         "color": "#B0BEC5"},
    {"min_xp": 500,   "title": "Sohbetçi",        "color": "#4FC3F7"},
    {"min_xp": 2000,  "title": "Mahalli Ünlü",    "color": "#81C784"},
    {"min_xp": 5000,  "title": "Şehir Efsanesi",  "color": "#FFD700"},
    {"min_xp": 15000, "title": "Sanal Efsane",    "color": "#E91E63"},
]

def get_title(xp: int, titles: list = None) -> dict:
    """XP'ye göre unvan döndür."""
    title_list = titles or TITLES
    current = title_list[0]
    for t in title_list:
        if xp >= t["min_xp"]:
            current = t
    return current

def get_next_title(xp: int) -> Optional[dict]:
    """Bir sonraki unvanı döndür."""
    for t in TITLES:
        if xp < t["min_xp"]:
            return t
    return None

async def award_xp(
    db: AsyncSession,
    user_id: str,
    match_result: str,  # 'win', 'lose', 'draw'
    correct_answers: int,
    total_questions: int,
    is_first_match_today: bool = False,
) -> dict:
    """
    Maç sonunda XP ver.
    Bölüm 12 — XP kazanım kuralları.
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"xp_gained": 0, "total_xp": 0}

    xp_gained = 0
    breakdown = []

    # Maç sonucu XP
    if match_result == "win":
        xp = XP_RULES["match_win"]
        xp_gained += xp
        breakdown.append({"reason": "Maç kazandın", "xp": xp})
    elif match_result == "lose":
        xp = XP_RULES["match_lose"]
        xp_gained += xp
        breakdown.append({"reason": "Maça katıldın", "xp": xp})
    else:
        xp = XP_RULES["match_draw"]
        xp_gained += xp
        breakdown.append({"reason": "Beraberlik", "xp": xp})

    # Doğru cevap XP
    if correct_answers > 0:
        xp = correct_answers * XP_RULES["correct_answer"]
        xp_gained += xp
        breakdown.append({"reason": f"{correct_answers} doğru cevap", "xp": xp})

    # Perfect match bonusu
    if correct_answers == total_questions and total_questions > 0:
        xp = XP_RULES["perfect_match"]
        xp_gained += xp
        breakdown.append({"reason": "Mükemmel maç!", "xp": xp})

    # Günün ilk galibiyeti bonusu
    if is_first_match_today and match_result == "win":
        xp = XP_RULES["first_win_day"]
        xp_gained += xp
        breakdown.append({"reason": "Günün ilk galibiyeti", "xp": xp})

    # Unvan değişimi kontrolü
    old_title = get_title(user.xp)
    user.xp += xp_gained
    new_title = get_title(user.xp)
    title_changed = old_title["title"] != new_title["title"]

    await db.commit()

    return {
        "xp_gained": xp_gained,
        "total_xp": user.xp,
        "breakdown": breakdown,
        "title_changed": title_changed,
        "new_title": new_title if title_changed else None,
        "current_title": new_title,
    }
