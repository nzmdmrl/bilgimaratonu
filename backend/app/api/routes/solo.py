from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import uuid
import json

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.question import Question, Category
from app.models.match import MatchAnswer

router = APIRouter(prefix="/api/solo", tags=["solo"])

class SoloStartRequest(BaseModel):
    category_ids: List[str] = []   # Boşsa tüm kategoriler
    difficulty: str = "mixed"       # mixed, easy, medium, hard, very_hard, ascending
    question_count: int = 15

class SoloSubmitRequest(BaseModel):
    session_id: str
    answers: List[dict]             # [{question_id, selected, time_ms}]
    total_time_seconds: int

class SoloSession(BaseModel):
    session_id: str
    questions: List[dict]
    settings: dict

async def _get_redis():
    import redis.asyncio as aioredis
    import os
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    return await aioredis.from_url(redis_url, decode_responses=True)

@router.post("/start")
async def start_solo(
    req: SoloStartRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Solo pratik başlat — sorular döndür."""
    count = max(7, min(50, req.question_count))

    # Soruları çek
    q = select(Question).options(selectinload(Question.category)).where(Question.is_active == True)

    if req.category_ids:
        q = q.where(Question.category_id.in_(req.category_ids))

    if req.difficulty == "mixed":
        # Karma dağılım
        questions = []
        dists = [("easy", count//3 + (1 if count%3>0 else 0)),
                 ("medium", count//3 + (1 if count%3>1 else 0)),
                 ("hard", count//3)]
        for diff, n in dists:
            r = await db.execute(q.where(Question.difficulty == diff).order_by(func.random()).limit(n))
            questions.extend(r.scalars().all())
    elif req.difficulty == "ascending":
        # Yükselen zorluk
        questions = []
        easy_n = count // 3 + (count % 3 > 0)
        med_n = count // 3 + (count % 3 > 1)
        hard_n = count // 3
        for diff, n in [("easy", easy_n), ("medium", med_n), ("hard", hard_n)]:
            r = await db.execute(q.where(Question.difficulty == diff).order_by(func.random()).limit(n))
            questions.extend(r.scalars().all())
    else:
        r = await db.execute(q.where(Question.difficulty == req.difficulty).order_by(func.random()).limit(count))
        questions = r.scalars().all()

    if not questions:
        raise HTTPException(status_code=404, detail="Yeterli soru bulunamadı.")

    # Session oluştur
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
            "correct_answer": question.correct_answer,  # Session'da saklanır, frontend'e gönderilmez
            "time_limit": 30,
            "index": i,
            "total": len(questions),
        })

    session_data = {
        "user_id": str(current_user.id),
        "questions": q_data,
        "created_at": datetime.utcnow().isoformat(),
        "settings": {
            "difficulty": req.difficulty,
            "question_count": len(questions),
        }
    }
    redis = await _get_redis()
    await redis.setex(f"solo:{session_id}", 3600, json.dumps(session_data, ensure_ascii=False))

    # Solo modda correct_answer frontend'e gönderilir (anlık geri bildirim için)
    safe_questions = q_data

    return {
        "session_id": session_id,
        "questions": safe_questions,
        "settings": session_data["settings"],
    }

@router.post("/submit")
async def submit_solo(
    req: SoloSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Solo pratik sonuçlarını kaydet."""
    redis = await _get_redis()
    session_raw = await redis.get(f"solo:{req.session_id}")
    session = json.loads(session_raw) if session_raw else None
    if not session:
        raise HTTPException(status_code=404, detail="Oturum bulunamadı veya süresi doldu.")
    if session["user_id"] != str(current_user.id):
        raise HTTPException(status_code=403, detail="Yetkisiz erişim.")

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

        # MatchAnswer tablosuna kaydet (kategori istatistikleri için)
        # Solo maçlar için dummy match oluştur veya match_id nullable yap
        db.add(MatchAnswer(
            match_id=None,
            question_id=qid,
            user_id=str(current_user.id),
            selected_answer=selected or "",
            is_correct=is_correct,
            points_earned=10 if is_correct else 0,
            response_time_ms=time_ms,
        ))

    await db.commit()

    # XP ver (lig kaydı yok)
    total = len(results)
    accuracy = round(correct_count / total * 100, 1) if total > 0 else 0

    xp_gained = correct_count * 2  # Doğru başına 2 XP
    if xp_gained > 0:
        current_user.xp += xp_gained
        await db.commit()

    # Session'ı temizle
    await redis.delete(f"solo:{req.session_id}")

    return {
        "correct": correct_count,
        "total": total,
        "accuracy": accuracy,
        "xp_gained": xp_gained,
        "total_time_seconds": req.total_time_seconds,
        "results": results,
    }

@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    """Aktif kategorileri döndür."""
    r = await db.execute(select(Category).where(Category.is_active == True).order_by(Category.name))
    cats = r.scalars().all()
    return {"categories": [{"id": str(c.id), "name": c.name, "icon": c.icon} for c in cats]}
