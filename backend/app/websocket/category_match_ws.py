"""
Kategori Bazlı Maç WebSocket
"""
import asyncio
from datetime import datetime
from fastapi import WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import AsyncSessionLocal, get_db
from app.core.security import decode_token
from app.models.user import User
from app.models.question import Category, Question
from app.models.match import Match, MatchStatus
from app.websocket.bot_match import run_bot_match, find_bot_opponent
from app.services.elo import POINTS
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from app.websocket.match_ws import manager

# Kategori bazlı kuyruklar {category_slug: [(user_id, websocket, elo)]}
category_queues: dict = {}
category_queue_locks: dict = {}
# Kullanıcı başına found_event {user_id: asyncio.Event()}
user_found_events: dict = {}
# Kullanıcı başına match_state {user_id: {"match_id": str}}
user_match_states: dict = {}


async def get_category_questions(db: AsyncSession, category_slug: str, count: int = 15):
    from app.services.settings_cache import get_cached_setting
    match_settings = await get_cached_setting("match")
    dist = match_settings.get("distribution", {"easy": 5, "medium": 5, "hard": 3, "very_hard": 2})
    distribution = [
        ("easy", dist.get("easy", 5)),
        ("medium", dist.get("medium", 5)),
        ("hard", dist.get("hard", 3)),
        ("very_hard", dist.get("very_hard", 2)),
    ]
    total_from_dist = sum(q for _, q in distribution)
    total_questions = match_settings.get("total_questions", 15)
    if total_from_dist != total_questions and total_from_dist > 0:
        scale = total_questions / total_from_dist
        distribution = [(d, max(1, round(q * scale))) for d, q in distribution if q > 0]

    questions = []
    for difficulty, q_count in distribution:
        result = await db.execute(
            select(Question)
            .join(Question.category)
            .options(selectinload(Question.category))
            .where(
                Question.is_active == True,
                Question.is_approved == True,
                Question.difficulty == difficulty,
                Category.slug == category_slug,
            )
            .order_by(func.random())
            .limit(q_count)
        )
        questions.extend(result.scalars().all())
    return questions


async def handle_category_match_ws(websocket: WebSocket, category_slug: str, token: str):
    try:
        payload = decode_token(token)
        if not payload:
            await websocket.close(code=4001)
            return

        user_id = payload.get("sub")
        print(f"[CAT] WS isteği: slug={category_slug} user_id={user_id}")

        async with AsyncSessionLocal() as db:
            user_res = await db.execute(select(User).where(User.id == user_id))
            user = user_res.scalar_one_or_none()
            if not user:
                await websocket.close(code=4001)
                return

            cat_res = await db.execute(select(Category).where(Category.slug == category_slug))
            category = cat_res.scalar_one_or_none()
            print(f"[CAT] Kategori: {category}")
            if not category:
                await websocket.close(code=4003)
                return
            _category_id = str(category.id)
    except Exception as e:
        print(f"[CAT] HATA: {e}")
        import traceback; traceback.print_exc()
        return

    print(f"[CAT] WS accepted: {user.username} → {category_slug}")
    await websocket.accept()
    await websocket.send_json({"type": "connected", "user_id": user_id, "elo": user.elo_rating})

    # Kuyruğa ekle
    if category_slug not in category_queues:
        category_queues[category_slug] = []
    if category_slug not in category_queue_locks:
        category_queue_locks[category_slug] = asyncio.Lock()

    async with category_queue_locks[category_slug]:
        category_queues[category_slug].append((user_id, websocket, user.elo_rating))

    print(f"[CAT_QUEUE] {user.username} → {category_slug} kuyruğu: {len(category_queues[category_slug])}")

    # Rakip ara
    match_state = {"match_id": None}
    user_match_states[user_id] = match_state
    found_event = asyncio.Event()
    user_found_events[user_id] = found_event

    async def find_opponent():
        opp_id = None
        opp_ws = None
        opp_elo = 1200

        # 10 saniye boyunca her 1 saniyede bir rakip ara
        for _ in range(10):
            await asyncio.sleep(1)
            async with category_queue_locks[category_slug]:
                queue = category_queues[category_slug]
                me = next((i for i, (uid, _, _) in enumerate(queue) if uid == user_id), None)
                if me is None:
                    return  # Başka biri eşleştirdi
                opponents = [(i, uid, ws, elo) for i, (uid, ws, elo) in enumerate(queue) if uid != user_id]
                if not opponents:
                    continue  # Rakip yok, tekrar dene
                # Rakip bulundu
                opp_idx, opp_id, opp_ws, opp_elo = min(opponents, key=lambda x: abs(x[3] - user.elo_rating))
                queue.pop(max(me, opp_idx))
                queue.pop(min(me, opp_idx))
                break

        if not opp_id:
            return  # Rakip bulunamadı, timeout ile bot eşleşecek

        # Maç oluştur
        async with AsyncSessionLocal() as db:
            questions = await get_category_questions(db, category_slug)
            bot_res = await db.execute(select(User).where(User.id == user_id))
            p1 = bot_res.scalar_one_or_none()
            opp_res = await db.execute(select(User).where(User.id == opp_id))
            p2 = opp_res.scalar_one_or_none()

            match = Match(
                player1_id=user_id,
                player2_id=opp_id,
                question_ids=[str(q.id) for q in questions],
                status=MatchStatus.in_progress,
                player1_elo_before=p1.elo_rating if p1 else 1200,
                player2_elo_before=p2.elo_rating if p2 else 1200,
                started_at=datetime.utcnow(),
                total_questions=len(questions),
                match_type="category",
                category_id=_category_id,
            )
            db.add(match)
            await db.flush()
            match_state["match_id"] = str(match.id)
            match_id = match_state["match_id"]
            await db.commit()

            manager.match_queues[match_id] = {
                user_id: asyncio.Queue(),
                opp_id: asyncio.Queue(),
            }
            await manager.join_match(match_id, user_id, websocket)
            await manager.join_match(match_id, opp_id, opp_ws)

            for num, (pid, pws, pname) in enumerate([(user_id, websocket, p1.username if p1 else '?'), (opp_id, opp_ws, p2.username if p2 else '?')], 1):
                opp_name = p2.username if num == 1 else p1.username
                opp_elo_val = p2.elo_rating if num == 1 else p1.elo_rating
                await pws.send_json({
                    "type": "match_start",
                    "match_id": match_id,
                    "player_number": num,
                    "total_questions": len(questions),
                    "category": category_slug,
                    "extra_jokers": 0,
                    "opponent": {"username": opp_name, "elo": round(opp_elo_val), "is_bot": False},
                })

            from app.websocket.match_ws import run_match as run_1v1_match
            asyncio.ensure_future(run_1v1_match(match_id, user_id, opp_id, questions, p1.elo_rating if p1 else 1200, p2.elo_rating if p2 else 1200))
            found_event.set()
            # Rakibin match_id ve event'ını set et
            if opp_id in user_found_events:
                user_found_events[opp_id].set()
            # Rakibin match_state'ini güncelle
            if opp_id in user_match_states:
                user_match_states[opp_id]["match_id"] = match_id

    asyncio.ensure_future(find_opponent())

    # Admin ayarından bot bekleme süresi
    try:
        await asyncio.wait_for(found_event.wait(), timeout=10)
    except asyncio.TimeoutError:
        # Bot ile eşleştir
        async with category_queue_locks[category_slug]:
            queue = category_queues[category_slug]
            idx = next((i for i, (uid, _, _) in enumerate(queue) if uid == user_id), None)
            if idx is not None:
                queue.pop(idx)

        await websocket.send_json({"type": "bot_match", "message": "Rakip bulunamadı, bot ile eşleştiriliyorsunuz..."})
        await asyncio.sleep(1)

        async with AsyncSessionLocal() as db:
            bot = await find_bot_opponent(db, user.elo_rating)
            questions = await get_category_questions(db, category_slug)

            if not questions or not bot:
                await websocket.send_json({"type": "no_opponent", "message": "Yeterli soru bulunamadı."})
                return

            match = Match(
                player1_id=user_id,
                player2_id=str(bot.id),
                question_ids=[str(q.id) for q in questions],
                status=MatchStatus.in_progress,
                player1_elo_before=user.elo_rating,
                player2_elo_before=bot.elo_rating,
                started_at=datetime.utcnow(),
                total_questions=len(questions),
                match_type="category",
                category_id=_category_id,
            )
            db.add(match)
            await db.flush()
            match_state["match_id"] = str(match.id)
            match_id = match_state["match_id"]
            await db.commit()

            manager.match_queues[match_id] = {
                user_id: asyncio.Queue(),
                str(bot.id): asyncio.Queue(),
            }
            await manager.join_match(match_id, user_id, websocket)

            await websocket.send_json({
                "type": "match_start",
                "match_id": match_id,
                "player_number": 1,
                "total_questions": len(questions),
                "category": category_slug,
                "extra_jokers": 0,
                "opponent": {"username": bot.username, "elo": round(bot.elo_rating), "is_bot": True},
            })

            asyncio.ensure_future(run_bot_match(
                match_id, user_id, str(bot.id),
                questions, user.elo_rating, bot.elo_rating,
                player_number=1,
            ))

    # WS mesajları dinle
    try:
        while True:
            data = await websocket.receive_json()
            current_match_id = match_state.get("match_id") or user_match_states.get(user_id, {}).get("match_id") or match_id
            if current_match_id and data.get("type") in ["answer", "joker", "pass"]:
                q = manager.match_queues.get(current_match_id, {}).get(user_id)
                if q:
                    await q.put(data)
    except Exception:
        pass
    finally:
        async with category_queue_locks.get(category_slug, asyncio.Lock()):
            if category_slug in category_queues:
                category_queues[category_slug] = [(uid, ws, elo) for uid, ws, elo in category_queues[category_slug] if uid != user_id]
        manager.disconnect_from_match(match_id, user_id)
        print(f"[CAT_QUEUE] {user.username} ayrıldı: {category_slug}")
