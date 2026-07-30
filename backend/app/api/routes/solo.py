from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List
from datetime import datetime
import uuid
import json

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.question import Question, Category
from app.models.match import MatchAnswer
from app.models.solo import SoloProgress

router = APIRouter(prefix="/api/solo", tags=["solo"])

# Her level 7 soru: 3 kolay, 2 orta, 1 zor, 1 çok zor (genel havuz)
LEVEL_DISTRIBUTION = [("easy", 3), ("medium", 2), ("hard", 1), ("very_hard", 1)]
LEVEL_QUESTION_COUNT = 7


class SoloStartRequest(BaseModel):
    level: int = 1


class SoloSubmitRequest(BaseModel):
    session_id: str
    answers: List[dict]  # [{question_id, selected, time_ms}]
    total_time_seconds: int


async def _get_redis():
    import redis.asyncio as aioredis
    import os
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    return await aioredis.from_url(redis_url, decode_responses=True)


def _stars_for(correct: int) -> int:
    """7 sorudan doğru sayısına göre yıldız."""
    if correct >= 6:
        return 3
    if correct >= 3:
        return 2
    if correct >= 1:
        return 1
    return 0


async def _progress_map(db: AsyncSession, user_id) -> dict:
    """{level: stars} — kullanıcının level başına en iyi yıldızları."""
    r = await db.execute(select(SoloProgress).where(SoloProgress.user_id == user_id))
    return {p.level: p.stars for p in r.scalars().all()}


def _unlocked_level(pmap: dict) -> int:
    """Oynanabilir en yüksek level. Level N için N-1 en az 1 yıldızla bitmeli."""
    k = 0
    while pmap.get(k + 1, 0) >= 1:
        k += 1
    return k + 1


async def _xp_per_star(db: AsyncSession) -> int:
    from app.services.settings import get_settings
    solo = await get_settings(db, "solo")
    try:
        return int(solo.get("xp_per_star", 20))
    except Exception:
        return 20


@router.get("/progress")
async def solo_progress(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Level haritası verisi."""
    pmap = await _progress_map(db, current_user.id)
    return {
        "unlocked_level": _unlocked_level(pmap),
        "total_stars": sum(pmap.values()),
        "xp_per_star": await _xp_per_star(db),
        "levels": {str(k): v for k, v in pmap.items()},
    }


@router.post("/start")
async def start_solo(
    req: SoloStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Bir level başlat — 7 soru (3/2/1/1) genel havuzdan rastgele."""
    level = max(1, int(req.level or 1))
    pmap = await _progress_map(db, current_user.id)
    if level > _unlocked_level(pmap):
        raise HTTPException(status_code=403, detail="Bu level henüz açılmadı.")

    # Genel havuz temel filtresi
    base = (
        select(Question)
        .options(selectinload(Question.category))
        .join(Question.category)
        .where(
            Question.is_active == True,
            Question.is_approved == True,
            Category.in_general_match == True,
        )
    )

    questions = []
    picked = set()
    for diff, n in LEVEL_DISTRIBUTION:
        r = await db.execute(
            base.where(Question.difficulty == diff).order_by(func.random()).limit(n)
        )
        for question in r.scalars().all():
            questions.append(question)
            picked.add(str(question.id))

    # Eksik kaldıysa (bir zorlukta yeterli soru yoksa) genel havuzdan tamamla
    if len(questions) < LEVEL_QUESTION_COUNT:
        need = LEVEL_QUESTION_COUNT - len(questions)
        r = await db.execute(base.order_by(func.random()).limit(need + len(picked) + 5))
        for question in r.scalars().all():
            if str(question.id) in picked:
                continue
            questions.append(question)
            picked.add(str(question.id))
            if len(questions) >= LEVEL_QUESTION_COUNT:
                break

    if not questions:
        raise HTTPException(status_code=404, detail="Yeterli soru bulunamadı.")

    session_id = str(uuid.uuid4())
    q_data = []
    for i, question in enumerate(questions):
        q_data.append({
            "id": str(question.id),
            "text": question.text,
            "question_image": question.question_image or "",
            "difficulty": question.difficulty,
            "category_name": question.category.name if question.category else "",
            "category_id": str(question.category_id),
            "option_a": question.option_a,
            "option_b": question.option_b,
            "option_c": question.option_c,
            "option_d": question.option_d,
            "correct_answer": question.correct_answer,
            "time_limit": 30,
            "index": i,
            "total": len(questions),
        })

    session_data = {
        "user_id": str(current_user.id),
        "level": level,
        "questions": q_data,
        "created_at": datetime.utcnow().isoformat(),
    }
    redis = await _get_redis()
    await redis.setex(f"solo:{session_id}", 3600, json.dumps(session_data, ensure_ascii=False))

    return {
        "session_id": session_id,
        "level": level,
        "questions": q_data,  # solo modda doğru cevap anlık geri bildirim için gönderilir
    }


@router.post("/submit")
async def submit_solo(
    req: SoloSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Level sonucu — yıldız hesapla, yeni yıldız başına XP ver, ilerlemeyi kaydet."""
    redis = await _get_redis()
    session_raw = await redis.get(f"solo:{req.session_id}")
    session = json.loads(session_raw) if session_raw else None
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı veya süresi doldu.")
    if session["user_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Yetkisiz erişim.")

    level = int(session.get("level", 1))
    questions = {q["id"]: q for q in session["questions"]}
    results = []
    correct_count = 0

    for answer in req.answers:
        qid = answer.get("question_id")
        selected = answer.get("selected")
        time_ms = answer.get("time_ms", 0)

        q = questions.get(qid)
        if not q:
            continue

        is_correct = selected == q["correct_answer"]
        if is_correct:
            correct_count += 1

        results.append({
            "question_id": qid,
            "question_text": q["text"],
            "selected": selected,
            "correct_answer": q["correct_answer"],
            "is_correct": is_correct,
            "time_ms": time_ms,
            "difficulty": q["difficulty"],
            "category_name": q["category_name"],
            "option_a": q.get("option_a", ""),
            "option_b": q.get("option_b", ""),
            "option_c": q.get("option_c", ""),
            "option_d": q.get("option_d", ""),
        })

        db.add(MatchAnswer(
            match_id=None,
            question_id=qid,
            user_id=str(current_user.id),
            selected_answer=selected or "",
            is_correct=is_correct,
            points_earned=10 if is_correct else 0,
            response_time_ms=time_ms,
        ))

    total = len(results)
    accuracy = round(correct_count / total * 100, 1) if total > 0 else 0
    stars = _stars_for(correct_count)

    # Önceki en iyi yıldız
    r = await db.execute(
        select(SoloProgress).where(
            SoloProgress.user_id == current_user.id, SoloProgress.level == level
        )
    )
    row = r.scalar_one_or_none()
    prev_stars = row.stars if row else 0
    is_replay = row is not None
    new_best = max(prev_stars, stars)
    delta_stars = max(0, stars - prev_stars)

    # Sadece yeni kazanılan yıldızlar için XP
    xp_per_star = await _xp_per_star(db)
    xp_gained = delta_stars * xp_per_star
    if xp_gained > 0:
        current_user.xp += xp_gained

    # İlerlemeyi kaydet (en iyi yıldız)
    if row:
        if new_best != row.stars:
            row.stars = new_best
    else:
        db.add(SoloProgress(user_id=current_user.id, level=level, stars=new_best))

    await db.commit()
    await redis.delete(f"solo:{req.session_id}")

    pmap = await _progress_map(db, current_user.id)

    return {
        "level": level,
        "correct": correct_count,
        "total": total,
        "accuracy": accuracy,
        "stars": stars,
        "prev_stars": prev_stars,
        "new_stars": delta_stars,       # bu oynanışta kazanılan yeni yıldız
        "xp_per_star": xp_per_star,
        "xp_gained": xp_gained,
        "is_replay": is_replay,
        "improved": delta_stars > 0,
        "unlocked_next": stars >= 1,     # sonraki level açıldı mı
        "next_level": level + 1,
        "total_stars": sum(pmap.values()),
        "total_time_seconds": req.total_time_seconds,
        "results": results,
    }


@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Aktif kategorileri döndür (geriye dönük uyumluluk)."""
    r = await db.execute(select(Category).where(Category.is_active == True).order_by(Category.name))
    cats = r.scalars().all()
    return {"categories": [{"id": str(c.id), "name": c.name, "icon": c.icon} for c in cats]}
