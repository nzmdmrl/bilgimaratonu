"""
Arena — 5 kişilik eşzamanlı yarış.
- Eşleştirme: açık bir odaya oyuncular katılır; 5 olunca başlar.
- Bot: bot_start_seconds içinde dolmazsa, bot_interval_seconds aralıkla botlar eklenir.
- Her soru answer_seconds içinde çözülür. Doğru + hız + ilk 3sn flash bonusu.
- Sonunda 1.'ye Arena kupası, 2.'ye Arena madalyası (sadece insanlar).
Durum bellekte tutulur (arena kısa sürer).
"""
import asyncio
import random
import uuid
import time as _time

from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select, func, text as _sqltext

from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import User
from app.models.question import Question, Category
from app.services.settings import get_settings
from app.services.bot import bot_accuracy, bot_response_time

FLASH_SECONDS = 3
FLASH_BONUS = 20

_pending = None          # dolmakta olan oda (genel havuz)
_private_rooms = {}      # event_id -> ArenaRoom (davet arenaları)
_lock = asyncio.Lock()


def _q_dict(q):
    return {
        "id": str(q.id), "text": q.text, "image": q.question_image or "",
        "option_a": q.option_a, "option_b": q.option_b, "option_c": q.option_c, "option_d": q.option_d,
        "correct_answer": q.correct_answer,
        "difficulty": q.difficulty.value if hasattr(q.difficulty, "value") else str(q.difficulty),
        "category_name": q.category.name if q.category else "",
    }


async def notify_host_decline(event_id, username):
    """Davet reddedildiğinde ev sahibine (sadece ona) haber ver."""
    room = _private_rooms.get(str(event_id))
    if not room or not room.host_id:
        return
    host = room.players.get(str(room.host_id))
    if host:
        await _send(host, {"type": "invite_declined", "username": username})


class ArenaRoom:
    def __init__(self, cfg):
        self.id = str(uuid.uuid4())
        self.cfg = cfg
        self.players = {}     # uid -> {ws, username, avatar, is_bot, elo}
        self.status = "waiting"  # waiting | sealing | running | finished
        self.answers = {}     # q_index -> {uid: {answer, t}}
        self.scores = {}
        self.correct = {}
        self.flash = {}
        self.bonus = {}
        self.cur_q = -1
        self.q_start = 0.0
        self.created_at = _time.time()
        # Özel (davet) arena
        self.is_private = False
        self.host_id = None
        self.event_id = None
        self.qlist = None

    def _init_player(self, uid, username, avatar, is_bot, elo, ws=None):
        self.players[uid] = {"ws": ws, "username": username, "avatar": avatar or "", "is_bot": is_bot, "elo": elo or 1000}
        self.scores.setdefault(uid, 0.0)
        self.correct.setdefault(uid, 0)
        self.flash.setdefault(uid, 0)
        self.bonus.setdefault(uid, 0.0)


async def _cfg(db):
    c = await get_settings(db, "arena")
    return {
        "enabled": bool(c.get("enabled", True)),
        "players": int(c.get("players", 5)),
        "bot_enabled": bool(c.get("bot_enabled", True)),
        "bot_start_seconds": int(c.get("bot_start_seconds", 15)),
        "bot_interval_seconds": max(1, int(c.get("bot_interval_seconds", 2))),
        "answer_seconds": int(c.get("answer_seconds", 10)),
        "questions": int(c.get("questions", 7)),
        "only_easy": bool(c.get("only_easy", True)),
    }


def _players_payload(room):
    return [{
        "user_id": uid, "username": p["username"], "avatar_url": p["avatar"], "is_bot": p["is_bot"],
    } for uid, p in room.players.items()]


async def _send(p, data):
    ws = p.get("ws")
    if ws:
        try:
            await ws.send_json(data)
        except Exception:
            pass


async def _broadcast(room, data):
    for p in list(room.players.values()):
        if not p["is_bot"]:
            await _send(p, data)


async def _arena_questions(db, count, only_easy=True):
    # Arena işaretli kategorilerden çek; ayar açıksa sadece KOLAY
    conds = [Question.is_active == True, Question.is_approved == True, Category.has_arena_match == True]
    if only_easy:
        from app.models.question import DifficultyLevel
        conds.append(Question.difficulty == DifficultyLevel.easy)
    rows = (await db.execute(
        select(Question).options()
        .join(Question.category)
        .where(*conds)
        .order_by(func.random()).limit(count * 6)
    )).scalars().all()
    # kategori çeşitliliği
    out, used = [], set()
    for q in rows:
        if len(out) >= count:
            break
        if q.category_id in used:
            continue
        out.append(q)
        used.add(q.category_id)
    if len(out) < count:
        for q in rows:
            if len(out) >= count:
                break
            if q not in out:
                out.append(q)
    # kategori adlarını yükle
    for q in out:
        await db.refresh(q, ["category"])
    return out[:count]


# ─────────── eşleştirme ───────────

async def handle_arena_ws(websocket: WebSocket, token: str, event: str = None):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return
    uid = payload.get("sub")

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.id == uid))).scalar_one_or_none()
        cfg = await _cfg(db)
    if not user:
        await websocket.close(code=4001)
        return

    if event:
        await _handle_private_ws(websocket, user, event)
        return

    if not cfg["enabled"]:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Arena şu an kapalı."})
        await websocket.close()
        return

    await websocket.accept()
    room = await _join(websocket, user, cfg)

    await websocket.send_json({
        "type": "connected", "arena_id": room.id,
        "me": str(user.id), "target": cfg["players"],
        "questions": cfg["questions"], "players": _players_payload(room),
    })
    await _broadcast(room, {"type": "lobby", "players": _players_payload(room), "target": cfg["players"]})

    try:
        while True:
            data = await websocket.receive_json()
            t = data.get("type")
            if t == "answer":
                await _record_answer(room, str(user.id), data)
            elif t == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _lock:
            if room.status == "waiting" and str(user.id) in room.players:
                del room.players[str(user.id)]
                await _broadcast(room, {"type": "lobby", "players": _players_payload(room), "target": cfg["players"]})
            else:
                p = room.players.get(str(user.id))
                if p:
                    p["ws"] = None  # oyun sürüyorsa bağlantıyı bırak


async def _join(websocket, user, cfg):
    global _pending
    async with _lock:
        if _pending is None or _pending.status != "waiting":
            _pending = ArenaRoom(cfg)
            first = True
        else:
            first = len(_pending.players) == 0
        room = _pending
        room._init_player(str(user.id), user.username, user.avatar_url or "", False, user.elo_rating or 1000, ws=websocket)

        if len(room.players) >= cfg["players"]:
            room.status = "sealing"
            asyncio.ensure_future(_start(room))
        elif first and cfg["bot_enabled"]:
            asyncio.ensure_future(_bot_filler(room, cfg))
    return room


async def _bot_filler(room, cfg):
    await asyncio.sleep(cfg["bot_start_seconds"])
    while True:
        async with _lock:
            if room.status != "waiting":
                return
            if len(room.players) >= cfg["players"]:
                room.status = "sealing"
                asyncio.ensure_future(_start(room))
                return
            existing = list(room.players.keys())
        # bir bot çek
        async with AsyncSessionLocal() as db:
            bot = (await db.execute(
                select(User).where(User.is_bot == True, User.is_active == True, ~User.id.in_(existing))
                .order_by(func.random()).limit(1)
            )).scalar_one_or_none()
        async with _lock:
            if room.status != "waiting":
                return
            if bot and str(bot.id) not in room.players:
                room._init_player(str(bot.id), bot.username, bot.avatar_url or "", True, bot.elo_rating or 1000)
                await _broadcast(room, {"type": "lobby", "players": _players_payload(room), "target": cfg["players"]})
            if len(room.players) >= cfg["players"]:
                room.status = "sealing"
                asyncio.ensure_future(_start(room))
                return
        await asyncio.sleep(cfg["bot_interval_seconds"])


# ─────────── özel (davet) arena ───────────

async def _handle_private_ws(websocket: WebSocket, user, slug: str):
    from app.models.event import Event, EventQuestion
    from app.models.question import Question as _Q
    from sqlalchemy.orm import selectinload

    async with AsyncSessionLocal() as db:
        ev = (await db.execute(
            select(Event).options(
                selectinload(Event.questions).selectinload(EventQuestion.question).selectinload(_Q.category)
            ).where(Event.slug == slug)
        )).scalar_one_or_none()
        if not ev or ev.type != "arena":
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Arena bulunamadı."})
            await websocket.close()
            return
        qlist = [_q_dict(eq.question) for eq in ev.questions if eq.question]
        cfg = {
            "players": int(ev.max_participants or 5),
            "answer_seconds": int(ev.time_limit_per_question or 10),
            "questions": len(qlist),
            "bot_enabled": False,
        }
        host_id = str(ev.creator_id)
        event_id = str(ev.id)

    await websocket.accept()

    async with _lock:
        room = _private_rooms.get(event_id)
        if room is None or room.status == "finished":
            room = ArenaRoom(cfg)
            room.is_private = True
            room.host_id = host_id
            room.event_id = event_id
            room.qlist = qlist
            _private_rooms[event_id] = room
        if str(user.id) in room.players:
            room.players[str(user.id)]["ws"] = websocket  # yeniden bağlanma
        elif room.status == "waiting":
            room._init_player(str(user.id), user.username, user.avatar_url or "", False, user.elo_rating or 1000, ws=websocket)
        else:
            await websocket.send_json({"type": "error", "message": "Arena çoktan başladı."})
            await websocket.close()
            return

    is_host = str(user.id) == host_id
    await websocket.send_json({
        "type": "connected", "arena_id": room.id, "me": str(user.id),
        "target": cfg["players"], "questions": len(qlist),
        "players": _players_payload(room), "private": True,
        "is_host": is_host, "min_start": 2,
    })
    await _broadcast(room, {"type": "lobby", "players": _players_payload(room), "target": cfg["players"], "private": True, "host_id": host_id})

    try:
        while True:
            data = await websocket.receive_json()
            t = data.get("type")
            if t == "answer":
                await _record_answer(room, str(user.id), data)
            elif t == "start" and is_host and room.status == "waiting":
                if len(room.players) >= 2:
                    room.status = "sealing"
                    asyncio.ensure_future(_start_private(room))
                else:
                    await websocket.send_json({"type": "error", "message": "Başlatmak için en az 2 kişi gerekli."})
            elif t == "restart" and is_host and room.status == "finished":
                asyncio.ensure_future(_restart_private(room))
            elif t == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        async with _lock:
            if room.status == "waiting" and str(user.id) in room.players:
                del room.players[str(user.id)]
                await _broadcast(room, {"type": "lobby", "players": _players_payload(room), "target": cfg["players"], "private": True, "host_id": host_id})
                if not room.players:
                    _private_rooms.pop(event_id, None)
            else:
                p = room.players.get(str(user.id))
                if p:
                    p["ws"] = None


# ─────────── motor ───────────

async def _start(room):
    """Genel havuz arenası: rastgele arena soruları çek, tanıt+geri sayım, çalıştır."""
    global _pending
    if _pending is room:
        _pending = None
    room.status = "running"
    cfg = room.cfg

    async with AsyncSessionLocal() as db:
        questions = await _arena_questions(db, cfg["questions"], cfg.get("only_easy", True))
        qlist = [_q_dict(q) for q in questions]
    if not qlist:
        await _broadcast(room, {"type": "error", "message": "Yeterli arena sorusu yok."})
        room.status = "finished"
        return

    # 5 kisi bulundu — 3 sn tanit ekrani, sonra geri sayim
    await _broadcast(room, {"type": "lobby_full", "players": _players_payload(room)})
    await asyncio.sleep(3.0)
    await _broadcast(room, {"type": "starting", "players": _players_payload(room), "questions": len(qlist), "countdown": 3})
    await asyncio.sleep(3.3)
    await _run_questions(room, qlist)


async def _start_private(room):
    """Davet arenası: ev sahibi başlat dedi. Testin sorularını kullan."""
    if str(room.event_id) in _private_rooms and _private_rooms[str(room.event_id)] is room:
        _private_rooms.pop(str(room.event_id), None)  # yeni katılım almasın
    room.status = "running"
    qlist = room.qlist or []
    if not qlist:
        await _broadcast(room, {"type": "error", "message": "Bu arenada soru yok."})
        room.status = "finished"
        return
    await _broadcast(room, {"type": "starting", "players": _players_payload(room), "questions": len(qlist), "countdown": 3})
    await asyncio.sleep(3.3)
    await _run_questions(room, qlist)


async def _run_questions(room, qlist):
    cfg = room.cfg
    total = len(qlist)
    for qi, q in enumerate(qlist):
        room.cur_q = qi
        room.answers[qi] = {}
        room.q_start = _time.time()
        await _broadcast(room, {
            "type": "question", "index": qi, "total": total,
            "time_limit": cfg["answer_seconds"],
            "question": {
                "id": q["id"], "text": q["text"], "image": q["image"],
                "option_a": q["option_a"], "option_b": q["option_b"], "option_c": q["option_c"], "option_d": q["option_d"],
                "difficulty": q["difficulty"], "category_name": q["category_name"],
            },
        })
        for uid, p in room.players.items():
            if p["is_bot"]:
                asyncio.ensure_future(_bot_answer(room, uid, qi, q["correct_answer"]))

        deadline = room.q_start + cfg["answer_seconds"]
        while _time.time() < deadline:
            if len(room.answers[qi]) >= len(room.players):
                break
            await asyncio.sleep(0.15)

        # puanla
        correct = q["correct_answer"]
        results = {}
        for uid, p in room.players.items():
            a = room.answers[qi].get(uid)
            if a:
                is_c = a["answer"] == correct
                elapsed = max(0.0, a["t"] - room.q_start)
                remaining = max(0.0, cfg["answer_seconds"] - elapsed)
                pts = 0.0
                flash = False
                if is_c:
                    pts = 10 + round((remaining / max(1, cfg["answer_seconds"])) * 50)
                    room.correct[uid] += 1
                    if elapsed <= FLASH_SECONDS:
                        flash = True
                        room.flash[uid] += 1
                        room.bonus[uid] += FLASH_BONUS
                room.scores[uid] += pts
                results[uid] = {"answer": a["answer"], "is_correct": is_c, "points": round(pts), "flash": flash}
            else:
                results[uid] = {"answer": None, "is_correct": False, "points": 0, "flash": False}

        await _broadcast(room, {
            "type": "question_result", "index": qi, "correct_answer": correct,
            "results": results,
            "scores": {u: round(room.scores[u] + room.bonus[u]) for u in room.players},
        })
        await asyncio.sleep(4.5)

    await _finish(room)


async def _event_arena_questions(db, ev):
    """Testin kategori+dağılımından TAZE rastgele soru seç (tekrarda farklı sorular)."""
    from app.models.question import Question as _Q
    from sqlalchemy.orm import selectinload
    base = select(_Q).options(selectinload(_Q.category)).where(_Q.is_active == True)
    cats = ev.category_ids or []
    if cats:
        base = base.where(_Q.category_id.in_(cats))
    dist = ev.distribution or {"easy": 5, "medium": 2}
    out = []
    for diff, count in dist.items():
        if not count or int(count) <= 0:
            continue
        r = await db.execute(base.where(_Q.difficulty == diff).order_by(func.random()).limit(int(count)))
        out.extend(r.scalars().all())
    if not out:
        r = await db.execute(base.order_by(func.random()).limit(ev.question_count or 7))
        out = r.scalars().all()
    return [_q_dict(x) for x in out]


async def _restart_private(room):
    """Aynı katılımcılarla, yeni sorularla tekrar başlat (yeni davet gitmez)."""
    if room.status == "running":
        return
    room.status = "running"
    # bağlantısı kopanları çıkar
    for uid in [u for u, p in list(room.players.items()) if not p.get("ws")]:
        del room.players[uid]
    if not room.players:
        room.status = "finished"
        return
    async with AsyncSessionLocal() as db:
        from app.models.event import Event
        ev = (await db.execute(select(Event).where(Event.id == room.event_id))).scalar_one_or_none()
        qlist = await _event_arena_questions(db, ev) if ev else []
    if not qlist:
        await _broadcast(room, {"type": "error", "message": "Bu arenada soru yok."})
        room.status = "finished"
        return
    # skorları sıfırla, oyuncuları koru
    for uid in room.players:
        room.scores[uid] = 0.0
        room.correct[uid] = 0
        room.flash[uid] = 0
        room.bonus[uid] = 0.0
    room.answers = {}
    room.cur_q = -1
    room.qlist = qlist
    await _broadcast(room, {"type": "starting", "players": _players_payload(room), "questions": len(qlist), "countdown": 3})
    await asyncio.sleep(3.3)
    await _run_questions(room, qlist)


async def _bot_answer(room, uid, qi, correct_answer):
    p = room.players.get(uid)
    if not p:
        return
    limit = room.cfg["answer_seconds"]
    # Zamanlama: botlar GENELDE insanlardan sonra, bazen (~%20) once cevaplar
    if random.random() < 0.20:
        wait = random.uniform(0.6, min(2.2, limit * 0.3))          # erken — bazen insandan once
    else:
        wait = random.uniform(limit * 0.4, limit * 0.85)           # gec — cogunlukla insandan sonra
    wait = max(0.5, min(wait, limit - 0.4))

    slept = 0.0
    while slept < wait:
        await asyncio.sleep(0.15)
        slept += 0.15
        if room.cur_q != qi or uid in room.answers.get(qi, {}):
            return

    # Dogruluk: botlar genellikle dogru cevaplar (taban %80)
    acc = min(0.95, max(0.80, bot_accuracy(p["elo"])))
    if random.random() < acc:
        ans = correct_answer
    else:
        ans = random.choice([o for o in ["A", "B", "C", "D"] if o and o != correct_answer])
    room.answers.setdefault(qi, {})[uid] = {"answer": ans, "t": _time.time()}
    await _broadcast(room, {"type": "player_answered", "user_id": uid, "answer": ans})


async def _record_answer(room, uid, data):
    if room.status != "running":
        return
    qi = room.cur_q
    if qi < 0 or data.get("question_index") != qi:
        return
    if uid in room.answers.get(qi, {}):
        return
    ans = data.get("answer")
    if ans not in ("A", "B", "C", "D"):
        return
    room.answers.setdefault(qi, {})[uid] = {"answer": ans, "t": _time.time()}
    await _broadcast(room, {"type": "player_answered", "user_id": uid, "answer": ans})


async def _finish(room):
    room.status = "finished"
    totals = {u: room.scores[u] + room.bonus[u] for u in room.players}
    ranked = sorted(room.players.keys(), key=lambda u: totals[u], reverse=True)

    ranks = {}
    prev_total = None
    prev_rank = 0
    for i, uid in enumerate(ranked):
        if totals[uid] == prev_total:
            ranks[uid] = prev_rank
        else:
            ranks[uid] = i + 1
            prev_rank = i + 1
            prev_total = totals[uid]

    # ödüller (sadece insanlar; award_trophy_or_medal botları zaten atlar)
    try:
        async with AsyncSessionLocal() as db:
            from app.services.achievement import award_trophy_or_medal
            for uid, p in room.players.items():
                if p["is_bot"]:
                    continue
                r = ranks[uid]
                # Kupa/madalya sadece genel havuz arenasında (özel/davet arenası farmlanmasın)
                if not room.is_private:
                    if r == 1:
                        await award_trophy_or_medal(db, uid, "arena", room.id[:8], rank=1)
                    elif r == 2:
                        await award_trophy_or_medal(db, uid, "arena", room.id[:8], rank=2)
                # XP: doğru başına 5
                xp = room.correct[uid] * 5
                if xp:
                    await db.execute(_sqltext("UPDATE users SET xp = xp + :xp WHERE id = :uid"), {"xp": xp, "uid": uid})
            await db.commit()
    except Exception as e:
        print(f"[Arena] ödül hatası: {e}")

    result = [{
        "user_id": uid,
        "username": room.players[uid]["username"],
        "avatar_url": room.players[uid]["avatar"],
        "is_bot": room.players[uid]["is_bot"],
        "rank": ranks[uid],
        "score": round(room.scores[uid]),
        "bonus": round(room.bonus[uid]),
        "total": round(totals[uid]),
        "correct": room.correct[uid],
        "flash": room.flash[uid],
    } for uid in ranked]

    await _broadcast(room, {"type": "arena_end", "ranking": result})
