"""
Düello WebSocket — 1v1 maç motorundan türetildi.
Max 4 kişi, anlık karşılıklı yarış.
"""
import asyncio
from typing import Dict
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import User
from app.models.event import Event, EventQuestion, EventParticipant, EventAnswer
from app.models.question import Question
from datetime import datetime

duel_rooms: Dict[str, Dict] = {}

async def broadcast(slug: str, msg: dict, exclude: str = None):
    room = duel_rooms.get(slug)
    if not room: return
    dead = []
    for uid, ws in room["connections"].items():
        if uid == exclude: continue
        try:
            await ws.send_json(msg)
        except:
            dead.append(uid)
    for uid in dead:
        room["connections"].pop(uid, None)

async def send_to(slug: str, user_id: str, msg: dict):
    room = duel_rooms.get(slug)
    if not room: return
    ws = room["connections"].get(user_id)
    if ws:
        try:
            await ws.send_json(msg)
        except:
            room["connections"].pop(user_id, None)

async def handle_duel_ws(websocket: WebSocket, slug: str, token: str):
    await websocket.accept()

    payload = decode_token(token)
    if not payload:
        await websocket.send_json({"type": "error", "message": "Geçersiz token."})
        await websocket.close()
        return

    user_id = payload.get("sub")

    async with AsyncSessionLocal() as db:
        u = await db.execute(select(User).where(User.id == user_id))
        user = u.scalar_one_or_none()
        if not user:
            await websocket.close()
            return

        e = await db.execute(
            select(Event)
            .options(selectinload(Event.questions).selectinload(EventQuestion.question).selectinload(Question.category))
            .where(Event.slug == slug)
        )
        event = e.scalar_one_or_none()
        if not event or event.type != 'duel':
            await websocket.send_json({"type": "error", "message": "Düello bulunamadı."})
            await websocket.close()
            return

        questions = sorted(event.questions, key=lambda eq: eq.order)

    if slug not in duel_rooms:
        duel_rooms[slug] = {
            "connections": {},
            "usernames": {},
            "host": user_id,
            "started": False,
            "scores": {},
            "questions": questions,
            "current_q": 0,
            "answered": set(),
            "question_solved": False,
        }

    room = duel_rooms[slug]

    if len(room["connections"]) >= 4 and user_id not in room["connections"]:
        await websocket.send_json({"type": "error", "message": "Oda dolu (max 4 kişi)."})
        await websocket.close()
        return

    room["connections"][user_id] = websocket
    room["usernames"][user_id] = user.username
    room["scores"][user_id] = 0

    is_host = room["host"] == user_id

    await websocket.send_json({
        "type": "joined",
        "user_id": user_id,
        "username": user.username,
        "is_host": is_host,
    })

    await broadcast(slug, {
        "type": "room_update",
        "participants": list(room["connections"].keys()),
        "participant_names": room["usernames"],
        "host": room["host"],
        "started": room["started"],
        "count": len(room["connections"]),
    })

    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "start":
                if room["host"] != user_id:
                    continue
                if room["started"]:
                    # Seri maç — sıfırla ve yeniden başlat
                    room["started"] = False
                    room["scores"] = {uid: 0 for uid in room["connections"]}
                    room["answered"] = set()
                    room["question_solved"] = False
                    room["current_q"] = 0
                room["started"] = True
                print(f"[DUEL] Düello başlatılıyor!")
                asyncio.ensure_future(run_duel(slug))

            elif msg_type == "answer":
                if not room["started"]:
                    continue
                await handle_answer(slug, user_id, data.get("question_id"), data.get("answer"))

    except WebSocketDisconnect:
        room["connections"].pop(user_id, None)
        if not room["connections"]:
            duel_rooms.pop(slug, None)
        else:
            await broadcast(slug, {
                "type": "room_update",
                "participants": list(room["connections"].keys()),
                "participant_names": room["usernames"],
                "host": room["host"],
                "started": room["started"],
                "count": len(room["connections"]),
            })

async def run_duel(slug: str):
    room = duel_rooms.get(slug)
    if not room: return

    # Her turda yeni sorular çek
    async with AsyncSessionLocal() as db:
        e_res = await db.execute(select(Event).where(Event.slug == slug))
        event = e_res.scalar_one_or_none()
        if not event:
            return

        from sqlalchemy import func
        from sqlalchemy.orm import selectinload as _sil

        # Event kategorilerinden rastgele sorular çek
        q_query = select(Question).options(_sil(Question.category)).where(Question.is_active == True)
        if event.category_ids:
            q_query = q_query.where(Question.category_id.in_(event.category_ids))

        dist = event.distribution or {"easy": 5, "medium": 5, "hard": 3, "very_hard": 2}
        new_questions = []
        for diff, count in dist.items():
            if count <= 0: continue
            r = await db.execute(q_query.where(Question.difficulty == diff).order_by(func.random()).limit(count))
            new_questions.extend(r.scalars().all())

        if not new_questions:
            # Fallback — event'in orijinal soruları
            eq_res = await db.execute(
                select(EventQuestion).options(_sil(EventQuestion.question).options(_sil(Question.category)))
                .where(EventQuestion.event_id == str(event.id))
                .order_by(EventQuestion.order)
            )
            new_questions = [eq.question for eq in eq_res.scalars().all()]

    questions = new_questions
    await broadcast(slug, {"type": "duel_starting", "question_count": len(questions)})
    await asyncio.sleep(3)

    for i, q in enumerate(questions):
        room = duel_rooms.get(slug)
        if not room or not room["connections"]: break
        room["current_q"] = i
        room["answered"] = set()
        room["question_solved"] = False

        time_limit = 30
        await broadcast(slug, {
            "type": "question",
            "question": {
                "id": str(q.id),
                "text": q.text,
                "difficulty": q.difficulty,
                "category_name": q.category.name if q.category else "",
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "correct_answer": q.correct_answer,
                "time_limit": time_limit,
                "index": i,
                "total": len(questions),
            },
            "scores": room["scores"],
        })

        # Süre boyunca bekle ama herkes cevapladıysa erken bitir
        elapsed = 0
        while elapsed < time_limit:
            await asyncio.sleep(1)
            elapsed += 1
            room = duel_rooms.get(slug)
            if not room: break
            # Soru çözüldüyse (doğru cevap verildi veya hepsi yanlış) dur
            if room.get("question_solved"):
                break

        room = duel_rooms.get(slug)
        if not room: break

        await broadcast(slug, {
            "type": "question_end",
            "correct_answer": q.correct_answer,
            "scores": room["scores"],
        })
        await asyncio.sleep(3)

    room = duel_rooms.get(slug)
    if not room: return

    sorted_scores = sorted(room["scores"].items(), key=lambda x: x[1], reverse=True)
    rankings = [
        {"user_id": uid, "username": room["usernames"].get(uid, uid[:8]), "score": score, "rank": i+1}
        for i, (uid, score) in enumerate(sorted_scores)
    ]

    await broadcast(slug, {
        "type": "duel_end",
        "rankings": rankings,
    })

    # Seri maç için sıfırla
    room = duel_rooms.get(slug)
    if room:
        room["started"] = False
        room["scores"] = {uid: 0 for uid in room["connections"]}
        room["answered"] = set()
        room["question_solved"] = False
        room["current_q"] = 0

    # DB'ye kaydet
    try:
        async with AsyncSessionLocal() as db:
            e_res = await db.execute(select(Event).where(Event.slug == slug))
            event = e_res.scalar_one_or_none()
            if event:
                for r in rankings:
                    p = EventParticipant(
                        event_id=str(event.id),
                        user_id=r["user_id"],
                        guest_name=r["username"],
                        score=r["score"],
                        correct_count=r["score"] // 10,
                        finished_at=datetime.utcnow(),
                        period_key="all",
                    )
                    db.add(p)
                await db.commit()
    except Exception as ex:
        print(f"[DUEL] DB kayıt hatası: {ex}")

async def handle_answer(slug: str, user_id: str, question_id: str, answer: str):
    room = duel_rooms.get(slug)
    if not room: return

    # Zaten cevap verdiyse tekrar cevap veremesin
    if user_id in room["answered"]: return

    # Soru zaten doğru cevaplanmışsa (başkası doğru buldu) cevap veremesin
    if room.get("question_solved"): return

    async with AsyncSessionLocal() as db:
        q = await db.execute(select(Question).where(Question.id == question_id))
        question = q.scalar_one_or_none()
        if not question: return

        is_correct = answer == question.correct_answer
        room["answered"].add(user_id)

        if is_correct:
            # Soru çözüldü — kimse artık cevaplayamaz
            room["question_solved"] = True
            room["scores"][user_id] = room["scores"].get(user_id, 0) + 10

            await broadcast(slug, {
                "type": "correct_answer",
                "user_id": user_id,
                "username": room["usernames"].get(user_id, ""),
                "answer": answer,
                "correct_answer": question.correct_answer,
                "scores": room["scores"],
            })
        else:
            # Yanlış cevap — diğer kullanıcılara göster
            await broadcast(slug, {
                "type": "opponent_wrong",
                "user_id": user_id,
                "username": room["usernames"].get(user_id, ""),
                "wrong_answer": answer,
            })

            # Tüm aktif kullanıcılar yanlış cevap verdi mi?
            active_users = set(room["connections"].keys())
            if room["answered"].issuperset(active_users):
                # Hepsi yanlış
                room["question_solved"] = True
                await broadcast(slug, {
                    "type": "all_wrong",
                    "correct_answer": question.correct_answer,
                    "scores": room["scores"],
                })
