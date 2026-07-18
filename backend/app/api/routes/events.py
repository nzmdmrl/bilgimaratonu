from fastapi import APIRouter, Depends, HTTPException, Header, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date
import uuid, random, string

from app.core.database import get_db, AsyncSessionLocal
from app.core.deps import get_current_user
from app.models.user import User
from app.models.event import Event, EventQuestion, EventParticipant, EventAnswer
from app.models.question import Question, Category

router = APIRouter(prefix="/api/events", tags=["events"])

@router.websocket("/{slug}/duel/ws")
async def duel_websocket(websocket: WebSocket, slug: str, token: str = ""):
    from app.websocket.duel_ws import handle_duel_ws
    await handle_duel_ws(websocket, slug, token)

def generate_slug(length=8):
    return ''.join(random.choices(string.ascii_lowercase + string.digits, k=length))

def title_to_slug(title: str) -> str:
    """Başlıktan URL dostu slug oluştur."""
    import re
    tr_map = str.maketrans('çğıöşüÇĞİÖŞÜ', 'cgiosucgiosu')
    slug = title.lower().translate(tr_map)
    slug = re.sub(r'[^a-z0-9]+', '-', slug)
    slug = slug.strip('-')[:40]
    return slug

def get_period_key(scoreboard_type: str) -> str:
    today = date.today()
    if scoreboard_type == "daily": return str(today)
    elif scoreboard_type == "monthly": return f"{today.year}-{today.month:02d}"
    elif scoreboard_type == "yearly": return str(today.year)
    return "all"

class EventCreateRequest(BaseModel):
    title: str
    description: Optional[str] = None
    type: str = "quiz"
    visibility: str = "public"
    password: Optional[str] = None
    scoreboard_type: str = "single"
    scoreboard_types: List[str] = ["all"]
    max_participants: int = 1000
    question_count: int = 15
    category_ids: List[str] = []
    difficulty: str = "mixed"
    distribution: dict = {}
    time_limit_per_question: int = 30

class JoinRequest(BaseModel):
    guest_name: Optional[str] = None
    password: Optional[str] = None
    guest_token: Optional[str] = None

class SubmitRequest(BaseModel):
    participant_id: str
    answers: List[dict]
    total_time_seconds: int

@router.post("/create")
async def create_event(
    req: EventCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = title_to_slug(req.title)[:20]  # Max 20 karakter
    rand = generate_slug(6)
    slug = f"{base}-{rand}" if base else rand
    while (await db.execute(select(Event).where(Event.slug == slug))).scalar_one_or_none():
        rand = generate_slug(6)
        slug = f"{base}-{rand}" if base else rand

    event = Event(
        slug=slug, title=req.title, description=req.description,
        creator_id=str(current_user.id), type=req.type,
        visibility=req.visibility, password=req.password,
        scoreboard_type=req.scoreboard_type,
        max_participants=req.max_participants,
        question_count=req.question_count, category_ids=req.category_ids,
        difficulty=req.difficulty, distribution=req.distribution,
        time_limit_per_question=req.time_limit_per_question,
    )
    db.add(event)
    await db.flush()

    questions = await _pick_questions(db, req)
    for i, q in enumerate(questions):
        db.add(EventQuestion(event_id=str(event.id), question_id=str(q.id), order=i))

    # Gerçek soru sayısını güncelle
    event.question_count = len(questions)
    await db.commit()

    # Arka planda moderasyon
    import asyncio
    print(f"[Moderation] Başlatılıyor: {req.title}")
    asyncio.ensure_future(_moderate_event_bg(str(event.id), req.title, req.description or ""))

    return {"slug": slug, "event_id": str(event.id), "question_count": len(questions)}

@router.get("/list")
async def list_events(db: AsyncSession = Depends(get_db), page: int = 1, search: str = ""):
    q = select(Event).where(Event.visibility == "public", Event.is_active == True).order_by(Event.created_at.desc())
    if search:
        q = q.where(Event.title.ilike(f"%{search}%"))
    result = await db.execute(q.offset((page-1)*20).limit(20))
    events = result.scalars().all()
    count = await db.execute(select(func.count(Event.id)).where(Event.visibility == "public", Event.is_active == True))
    return {"events": [await _event_summary(db, e) for e in events], "total": count.scalar(), "page": page}

@router.get("/my")
async def my_events(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Event).where(Event.creator_id == str(current_user.id)).order_by(Event.is_active.desc(), Event.created_at.desc()))
    events = result.scalars().all()
    return {"events": [await _event_summary(db, e) for e in events]}

@router.get("/{slug}")
async def get_event(slug: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).options(selectinload(Event.creator)).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Test bulunamadı.")
    return await _event_detail(db, event)

@router.post("/{slug}/join")
async def join_event(slug: str, req: JoinRequest, db: AsyncSession = Depends(get_db),
                     authorization: Optional[str] = Header(None)):
    result = await db.execute(
        select(Event).options(
            selectinload(Event.questions).selectinload(EventQuestion.question).selectinload(Question.category)
        ).where(Event.slug == slug)
    )
    event = result.scalar_one_or_none()
    if not event: raise HTTPException(status_code=404, detail="Test bulunamadı.")
    if not event.is_active: raise HTTPException(status_code=400, detail="Test aktif değil.")

    # Kullanıcıyı çek (opsiyonel)
    current_user = None
    if authorization and authorization.startswith("Bearer "):
        try:
            from app.core.security import decode_token
            token = authorization.replace("Bearer ", "")
            payload = decode_token(token)
            if payload:
                u = await db.execute(select(User).where(User.id == payload.get("sub")))
                current_user = u.scalar_one_or_none()
        except Exception:
            pass

    # Şifre kontrolü
    if event.visibility == "private" and event.password:
        if req.password != event.password:
            raise HTTPException(status_code=403, detail="Yanlış şifre.")

    # Tek çözüm kontrolü — series modunda sınırsız
    if event.scoreboard_type in ("single",):
        if current_user:
            ex = await db.execute(select(EventParticipant).where(
                EventParticipant.event_id == str(event.id),
                EventParticipant.user_id == str(current_user.id),
            ))
            if ex.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Bu testi daha önce çözdünüz.")
        elif req.guest_token:
            ex = await db.execute(select(EventParticipant).where(
                EventParticipant.event_id == str(event.id),
                EventParticipant.guest_token == req.guest_token,
            ))
            if ex.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Bu testi daha önce çözdünüz.")

    period_key = get_period_key(event.scoreboard_type)
    import random
    auto_guest_name = f"misafir-{random.randint(1000,9999)}"
    participant = EventParticipant(
        event_id=str(event.id),
        user_id=str(current_user.id) if current_user else None,
        guest_name=(req.guest_name or auto_guest_name) if not current_user else current_user.username,
        guest_token=req.guest_token,
        period_key=period_key,
    )
    db.add(participant)
    await db.commit()
    await db.refresh(participant)

    questions = []
    for eq in event.questions:
        q = eq.question
        questions.append({
            "id": str(q.id), "text": q.text, "question_image": q.question_image or "", "difficulty": q.difficulty,
            "category_name": q.category.name if q.category else "",
            "option_a": q.option_a, "option_b": q.option_b,
            "option_c": q.option_c, "option_d": q.option_d,
            "correct_answer": q.correct_answer,
            "time_limit": event.time_limit_per_question,
            "index": eq.order, "total": len(event.questions),
        })

    return {"participant_id": str(participant.id), "questions": questions, "event_title": event.title}

@router.post("/{slug}/submit")
async def submit_event(slug: str, req: SubmitRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event: raise HTTPException(status_code=404, detail="Test bulunamadı.")

    p_result = await db.execute(select(EventParticipant).where(EventParticipant.id == req.participant_id))
    participant = p_result.scalar_one_or_none()
    if not participant: raise HTTPException(status_code=404, detail="Katılımcı bulunamadı.")

    eq_result = await db.execute(
        select(EventQuestion, Question).join(Question, Question.id == EventQuestion.question_id)
        .where(EventQuestion.event_id == str(event.id))
    )
    q_map = {str(eq.question_id): q.correct_answer for eq, q in eq_result.fetchall()}

    correct = 0
    for answer in req.answers:
        qid = answer.get("question_id")
        selected = answer.get("selected")
        is_correct = selected == q_map.get(qid)
        if is_correct: correct += 1
        db.add(EventAnswer(
            participant_id=req.participant_id, question_id=qid,
            selected_answer=selected, is_correct=is_correct,
            response_time_ms=answer.get("time_ms", 0),
        ))

    total = len(req.answers)
    participant.score = correct * 10
    participant.correct_count = correct
    participant.total_time_seconds = req.total_time_seconds
    participant.finished_at = datetime.utcnow()

    # Misafir skoru skorboard'a eklenmesin
    if not participant.user_id:
        participant.is_hidden = True

    await db.commit()

    return {
        "correct": correct, "total": total, "score": correct * 10,
        "accuracy": round(correct / total * 100, 1) if total > 0 else 0,
        "total_time_seconds": req.total_time_seconds,
    }

@router.get("/{slug}/scoreboard")
async def get_scoreboard(slug: str, period: str = "all", db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Event).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event: raise HTTPException(status_code=404, detail="Test bulunamadı.")

    q = select(EventParticipant).where(
        EventParticipant.event_id == str(event.id),
        EventParticipant.finished_at != None,
        EventParticipant.is_hidden == False,
    )
    if period != "all":
        q = q.where(EventParticipant.period_key == period)
    q = q.order_by(EventParticipant.score.desc(), EventParticipant.total_time_seconds.asc()).limit(100)

    p_result = await db.execute(q)
    participants = p_result.scalars().all()

    # Düello ise istatistikleri hesapla
    if event.type == 'duel':
        # Tüm maçları çek
        all_parts = await db.execute(
            select(EventParticipant)
            .where(EventParticipant.event_id == str(event.id), EventParticipant.finished_at != None)
            .order_by(EventParticipant.finished_at.desc())
        )
        all_participants = all_parts.scalars().all()

        # Kullanıcı bazlı istatistik
        user_stats: dict = {}
        for p in all_participants:
            uid = str(p.user_id) if p.user_id else p.guest_name
            name = p.guest_name or "Misafir"
            if uid not in user_stats:
                user_stats[uid] = {"name": name, "wins": 0, "total": 0, "best_score": 0}
            user_stats[uid]["total"] += 1
            if p.score > user_stats[uid]["best_score"]:
                user_stats[uid]["best_score"] = p.score

        # Son maçın kazananını bul
        recent_matches: dict = {}
        for p in all_participants:
            key = p.finished_at.strftime("%Y-%m-%d %H:%M") if p.finished_at else ""
            if key not in recent_matches:
                recent_matches[key] = []
            recent_matches[key].append(p)

        for match_time, match_parts in recent_matches.items():
            if match_parts:
                winner = max(match_parts, key=lambda x: x.score)
                wid = str(winner.user_id) if winner.user_id else winner.guest_name
                if wid in user_stats:
                    user_stats[wid]["wins"] += 1

        board = sorted(user_stats.values(), key=lambda x: x["wins"], reverse=True)
        for i, entry in enumerate(board):
            entry["rank"] = i + 1

        return {
            "scoreboard": board,
            "event_title": event.title,
            "scoreboard_type": event.scoreboard_type,
            "is_duel": True,
        }

    board = []
    for i, p in enumerate(participants):
        board.append({
            "rank": i+1, "name": p.guest_name or "Misafir",
            "score": p.score, "correct": p.correct_count,
            "time_seconds": p.total_time_seconds,
            "finished_at": p.finished_at.strftime("%d.%m.%Y %H:%M") if p.finished_at else "",
        })

    return {"scoreboard": board, "event_title": event.title, "scoreboard_type": event.scoreboard_type}

@router.delete("/{slug}")
async def delete_event(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Testi sil — sadece admin."""
    if current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Sadece admin silebilir.")
    result = await db.execute(select(Event).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Test bulunamadı.")
    # Önce ilişkili kayıtları sil
    from sqlalchemy import delete
    await db.execute(delete(EventAnswer).where(
        EventAnswer.participant_id.in_(
            select(EventParticipant.id).where(EventParticipant.event_id == str(event.id))
        )
    ))
    await db.execute(delete(EventParticipant).where(EventParticipant.event_id == str(event.id)))
    await db.execute(delete(EventQuestion).where(EventQuestion.event_id == str(event.id)))
    await db.delete(event)
    await db.commit()
    return {"ok": True, "message": "Test silindi."}

@router.patch("/{slug}/archive")
async def archive_event(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Testi arşivle — listeden gizle ama 404 verme."""
    result = await db.execute(select(Event).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Test bulunamadı.")
    if str(event.creator_id) != str(current_user.id) and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Yetkisiz erişim.")
    event.is_active = False
    await db.commit()
    return {"ok": True, "message": "Test arşivlendi."}

@router.patch("/{slug}/restore")
async def restore_event(
    slug: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Arşivlenen testi geri getir."""
    result = await db.execute(select(Event).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Test bulunamadı.")
    if str(event.creator_id) != str(current_user.id) and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Yetkisiz erişim.")
    event.is_active = True
    await db.commit()
    return {"ok": True, "message": "Test yeniden yayında."}

class EventUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    visibility: Optional[str] = None
    password: Optional[str] = None
    scoreboard_type: Optional[str] = None
    max_participants: Optional[int] = None
    time_limit_per_question: Optional[int] = None

@router.patch("/{slug}/update")
async def update_event(
    slug: str,
    req: EventUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Test bilgilerini güncelle — sorular değişmez."""
    result = await db.execute(select(Event).where(Event.slug == slug))
    event = result.scalar_one_or_none()
    if not event:
        raise HTTPException(status_code=404, detail="Test bulunamadı.")
    if str(event.creator_id) != str(current_user.id) and current_user.role != 'admin':
        raise HTTPException(status_code=403, detail="Yetkisiz erişim.")

    if req.title is not None: event.title = req.title
    if req.description is not None: event.description = req.description
    if req.visibility is not None: event.visibility = req.visibility
    if req.password is not None: event.password = req.password
    if req.scoreboard_type is not None: event.scoreboard_type = req.scoreboard_type
    if req.max_participants is not None: event.max_participants = req.max_participants
    if req.time_limit_per_question is not None: event.time_limit_per_question = req.time_limit_per_question

    await db.commit()
    return {"ok": True}

@router.get("/admin/pending")
async def pending_events(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz.")
    result = await db.execute(
        select(Event).where(Event.moderation_status == "pending").order_by(Event.created_at.desc())
    )
    events = result.scalars().all()
    return {"events": [{"id": str(e.id), "slug": e.slug, "title": e.title,
        "description": e.description, "reason": e.moderation_reason,
        "created_at": e.created_at.strftime("%d.%m.%Y %H:%M")} for e in events]}

@router.post("/admin/{event_id}/approve")
async def approve_event(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Yetkisiz.")
    from sqlalchemy import update as _upd
    await db.execute(_upd(Event).where(Event.id == event_id).values(is_active=True, moderation_status="approved"))
    await db.commit()
    return {"ok": True}

@router.delete("/admin/{event_id}/reject")
async def reject_event(event_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role != "admin": raise HTTPException(status_code=403, detail="Yetkisiz.")
    from sqlalchemy import update as _upd
    await db.execute(_upd(Event).where(Event.id == event_id).values(is_active=False, moderation_status="rejected"))
    await db.commit()
    return {"ok": True}

async def _moderate_event_bg(event_id: str, title: str, description: str):
    try:
        from app.services.moderation import moderate_event
        from sqlalchemy import update as _update
        result = await moderate_event(title, description)
        async with AsyncSessionLocal() as db:
            if not result.get("safe", True):
                await db.execute(
                    _update(Event).where(Event.id == event_id).values(
                        is_active=False,
                        moderation_status="pending",
                        moderation_reason=result.get("reason", ""),
                    )
                )
                await db.commit()
                print(f"[Moderation] Test arşivlendi: {event_id} — {result.get('reason')}")
            else:
                print(f"[Moderation] Test onaylandı: {event_id}")
    except Exception as e:
        print(f"[Moderation] Hata: {e}")

async def _pick_questions(db, req):
    q = select(Question).where(Question.is_active == True)
    if req.category_ids:
        q = q.where(Question.category_id.in_(req.category_ids))
    dist = req.distribution or {"easy": 5, "medium": 5, "hard": 3, "very_hard": 2}
    questions = []
    for diff, count in dist.items():
        if count <= 0: continue
        r = await db.execute(q.where(Question.difficulty == diff).order_by(func.random()).limit(count))
        questions.extend(r.scalars().all())
    if not questions:
        r = await db.execute(q.order_by(func.random()).limit(req.question_count))
        questions = r.scalars().all()
    return questions

async def _event_summary(db, event):
    count = await db.execute(select(func.count(EventParticipant.id)).where(
        EventParticipant.event_id == str(event.id), EventParticipant.finished_at != None,
    ))
    return {
        "id": str(event.id), "slug": event.slug, "title": event.title,
        "type": event.type, "visibility": event.visibility,
        "scoreboard_type": event.scoreboard_type,
        "question_count": event.question_count,
        "participant_count": count.scalar(),
        "created_at": event.created_at.strftime("%d.%m.%Y") if event.created_at else "",
        "is_active": event.is_active,
    }

async def _event_detail(db, event):
    summary = await _event_summary(db, event)
    summary.update({
        "description": event.description,
        "creator": event.creator.username if event.creator else "",
        "max_participants": event.max_participants,
        "difficulty": event.difficulty,
        "time_limit_per_question": event.time_limit_per_question,
        "is_active": event.is_active,
        "needs_password": event.visibility == "private" and bool(event.password),
    })
    return summary
