"""
Maraton WebSocket Handler ve Engine
"""
import asyncio
import random
from datetime import datetime
from typing import Dict
from fastapi import WebSocket
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.marathon import (
    Marathon, MarathonStatus,
    MarathonParticipant, MarathonParticipantStatus,
    MarathonMatch
)
from app.models.user import User
from app.models.question import Question
from app.websocket.match_ws import get_random_questions, build_question_payload

ROUND_DIFFICULTIES = {
    1: "easy", 2: "easy",
    3: "medium", 4: "medium",
    5: "hard", 6: "hard",
    7: "hard",
}


class MarathonManager:
    def __init__(self):
        self.connections: Dict[str, Dict[str, WebSocket]] = {}
        self.queues: Dict[str, Dict[str, Dict[str, asyncio.Queue]]] = {}

    async def connect(self, marathon_id: str, user_id: str, ws: WebSocket):
        if marathon_id not in self.connections:
            self.connections[marathon_id] = {}
        self.connections[marathon_id][user_id] = ws

    def disconnect(self, marathon_id: str, user_id: str):
        if marathon_id in self.connections:
            self.connections[marathon_id].pop(user_id, None)

    async def send(self, marathon_id: str, user_id: str, data: dict):
        ws = self.connections.get(marathon_id, {}).get(user_id)
        if ws:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(marathon_id, user_id)

    async def broadcast(self, marathon_id: str, data: dict):
        for user_id, ws in list(self.connections.get(marathon_id, {}).items()):
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(marathon_id, user_id)

    def get_queue(self, marathon_id: str, match_id: str, user_id: str) -> asyncio.Queue:
        if marathon_id not in self.queues:
            self.queues[marathon_id] = {}
        if match_id not in self.queues[marathon_id]:
            self.queues[marathon_id][match_id] = {}
        if user_id not in self.queues[marathon_id][match_id]:
            self.queues[marathon_id][match_id][user_id] = asyncio.Queue()
        return self.queues[marathon_id][match_id][user_id]

    def clear_queues(self, marathon_id: str, match_id: str):
        if marathon_id in self.queues:
            self.queues[marathon_id].pop(match_id, None)


marathon_manager = MarathonManager()


async def handle_marathon_ws(websocket: WebSocket, marathon_id: str, token: str):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001)
            return

    await websocket.accept()
    await marathon_manager.connect(marathon_id, user_id, websocket)
    print(f"[WS] Bağlandı: {user.username} → {marathon_id[:8]}")

    try:
        await websocket.send_json({
            "type": "connected",
            "username": user.username,
            "marathon_id": marathon_id,
        })
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "answer":
                match_id = data.get("match_id")
                if match_id:
                    q = marathon_manager.get_queue(marathon_id, match_id, user_id)
                    await q.put(data)
    except Exception:
        pass
    finally:
        marathon_manager.disconnect(marathon_id, user_id)
        print(f"[WS] Ayrıldı: {user.username}")


async def get_active_participants(db, marathon_id: str):
    result = await db.execute(
        select(MarathonParticipant).where(
            MarathonParticipant.marathon_id == marathon_id,
            MarathonParticipant.status == MarathonParticipantStatus.active,
        )
    )
    parts = result.scalars().all()
    for p in parts:
        await db.refresh(p, ["user"])
    return parts


async def get_round_questions(db, marathon_id: str, round_num: int, count: int) -> list:
    from sqlalchemy.orm import selectinload
    from app.models.question import Question as Q
    difficulty = ROUND_DIFFICULTIES.get(round_num, "easy")
    result = await db.execute(
        select(Q).where(
            Q.difficulty == difficulty,
            Q.is_active == True,
        ).options(selectinload(Q.category)).limit(count * 5)
    )
    all_qs = result.scalars().all()
    if not all_qs:
        result = await db.execute(
            select(Q).where(Q.is_active == True).options(selectinload(Q.category)).limit(count * 5)
        )
        all_qs = result.scalars().all()
    selected = random.sample(all_qs, min(count, len(all_qs))) if all_qs else []
    print(f"[Questions] {len(selected)} soru çekildi (round {round_num}, difficulty: {difficulty})")
    return selected


def round_label(active_count: int) -> str:
    return {
        32: "1. Tur", 16: "2. Tur", 8: "Çeyrek Final",
        4: "Yarı Final", 2: "Final"
    }.get(active_count, f"Tur ({active_count} kişi)")


async def get_username(user_id: str) -> str:
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        return user.username if user else "?"


async def run_match(
    marathon_id: str, match_id: str,
    p1_id: str, p2_id: str,
    questions: list, round_num: int,
    p1_is_human: bool, p2_is_human: bool,
    p2_elo: int, time_limit: int,
) -> str:
    from app.services.bot import bot_answer as get_bot_answer, bot_response_time
    from app.services.elo import get_points, POINTS

    p1_score = 0
    p2_score = 0
    print(f"[MATCH] {match_id[:8]} p1={p1_id[:8]}(human={p1_is_human}) p2={p2_id[:8]}(human={p2_is_human}) q={len(questions)}")

    for q_idx, question in enumerate(questions):
        correct = question.correct_answer
        diff_val = question.difficulty.value if hasattr(question.difficulty, "value") else str(question.difficulty)
        _pcfg = POINTS.get(diff_val, POINTS["easy"])
        q_tl = _pcfg["time_limit"]

        # Kuyruklari temizle (onceki sorudan artik kalmasin)
        for _uid, _human in [(p1_id, p1_is_human), (p2_id, p2_is_human)]:
            if _human:
                _q = marathon_manager.get_queue(marathon_id, match_id, _uid)
                while not _q.empty():
                    try: _q.get_nowait()
                    except Exception: pass

        q_data = {
            "type": "question",
            "match_id": match_id,
            "question_index": q_idx,
            "total_questions": len(questions),
            "question": {
                "id": str(question.id),
                "text": question.text,
                "difficulty": diff_val,
                "category_name": question.category.name if question.category else "",
                "option_a": question.option_a,
                "option_b": question.option_b,
                "option_c": question.option_c,
                "option_d": question.option_d,
                "question_image": question.question_image or "",
                "points_correct": _pcfg.get("correct", 10),
                "points_wrong": _pcfg.get("wrong", -3),
            },
            "time_limit": q_tl,
        }

        if p1_is_human:
            await marathon_manager.send(marathon_id, p1_id, {**q_data, "my_score": p1_score, "opp_score": p2_score})
        if p2_is_human:
            await marathon_manager.send(marathon_id, p2_id, {**q_data, "my_score": p2_score, "opp_score": p1_score})

        import time as _time
        q_start = _time.time()

        # Bot cevaplari onceden hesapla (bagimsiz)
        p1_bot_wait = p1_bot_ans = None
        p2_bot_wait = p2_bot_ans = None
        if not p1_is_human:
            p1_bot_wait = bot_response_time(1200, q_tl)
            p1_bot_ans = get_bot_answer(correct, 1200)
        if not p2_is_human:
            p2_bot_wait = bot_response_time(p2_elo, q_tl)
            p2_bot_ans = get_bot_answer(correct, p2_elo)

        holder = {"p1": None, "p2": None}
        ev_p1 = asyncio.Event()
        ev_p2 = asyncio.Event()

        async def _human_task(uid, key, ev):
            qq = marathon_manager.get_queue(marathon_id, match_id, uid)
            try:
                data = await asyncio.wait_for(qq.get(), timeout=q_tl)
                holder[key] = data.get("answer", "").upper()
                ev.set()
            except asyncio.TimeoutError:
                pass

        async def _bot_task(wait_s, ans, key, ev):
            await asyncio.sleep(wait_s)
            holder[key] = ans
            ev.set()

        t1 = asyncio.ensure_future(_human_task(p1_id, "p1", ev_p1)) if p1_is_human \
             else asyncio.ensure_future(_bot_task(p1_bot_wait, p1_bot_ans, "p1", ev_p1))
        t2 = asyncio.ensure_future(_human_task(p2_id, "p2", ev_p2)) if p2_is_human \
             else asyncio.ensure_future(_bot_task(p2_bot_wait, p2_bot_ans, "p2", ev_p2))

        done, pending = await asyncio.wait([t1, t2], return_when=asyncio.FIRST_COMPLETED)
        elapsed = _time.time() - q_start
        remaining = max(q_tl - elapsed, 1.0)

        # Kim once cevapladi?
        if ev_p1.is_set() and not ev_p2.is_set():
            first_key, second_key = "p1", "p2"
        elif ev_p2.is_set() and not ev_p1.is_set():
            first_key, second_key = "p2", "p1"
        elif ev_p1.is_set() and ev_p2.is_set():
            first_key, second_key = "p1", "p2"
        else:
            first_key, second_key = None, None

        p1_ans_given = None
        p2_ans_given = None
        result_msg_p1 = {"won_q": False, "both_wrong": True}
        result_msg_p2 = {"won_q": False, "both_wrong": True}

        def _award(key, ans, elapsed_s):
            nonlocal p1_score, p2_score
            pts = get_points(diff_val, ans == correct, max(0.0, q_tl - elapsed_s))
            if key == "p1":
                p1_score += pts
            else:
                p2_score += pts
            return pts

        second_is_human = (second_key == "p1" and p1_is_human) or (second_key == "p2" and p2_is_human)
        second_uid = p1_id if second_key == "p1" else p2_id
        first_uid = p1_id if first_key == "p1" else p2_id
        first_is_human = (first_key == "p1" and p1_is_human) or (first_key == "p2" and p2_is_human)

        if first_key is None:
            # Kimse cevaplamadi
            for t in pending: t.cancel()
        else:
            first_ans = holder[first_key]
            if first_key == "p1": p1_ans_given = first_ans
            else: p2_ans_given = first_ans

            _award(first_key, first_ans, elapsed)

            if first_ans == correct:
                # Ilk cevaplayan DOGRU -> soru kapanir, rakip cevap veremez (ceza yok)
                for t in pending: t.cancel()
                if first_key == "p1":
                    result_msg_p1 = {"won_q": True, "correct": True}
                    result_msg_p2 = {"won_q": False, "opponent_correct": True}
                else:
                    result_msg_p1 = {"won_q": False, "opponent_correct": True}
                    result_msg_p2 = {"won_q": True, "correct": True}
            else:
                # Ilk cevaplayan YANLIS -> rakibe ANINDA bildir, kalan surede cevaplasin
                if second_is_human:
                    await marathon_manager.send(marathon_id, second_uid, {
                        "type": "opponent_wrong",
                        "match_id": match_id,
                        "wrong_answer": first_ans,
                        "remaining_time": int(remaining),
                    })

                second_ans = None
                try:
                    await asyncio.wait_for(asyncio.shield(t2 if second_key == "p2" else t1), timeout=remaining)
                    second_ans = holder[second_key]
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    second_ans = holder[second_key]  # bot onceden set etmis olabilir

                if second_ans:
                    if second_key == "p1": p1_ans_given = second_ans
                    else: p2_ans_given = second_ans
                    _award(second_key, second_ans, _time.time() - q_start)

                    if second_ans == correct:
                        if second_key == "p1":
                            result_msg_p1 = {"won_q": True, "correct": True}
                            result_msg_p2 = {"won_q": False, "opponent_correct": True}
                        else:
                            result_msg_p1 = {"won_q": False, "opponent_correct": True}
                            result_msg_p2 = {"won_q": True, "correct": True}
                    else:
                        result_msg_p1 = {"won_q": False, "both_wrong": True}
                        result_msg_p2 = {"won_q": False, "both_wrong": True}
                else:
                    result_msg_p1 = {"won_q": False, "both_wrong": True}
                    result_msg_p2 = {"won_q": False, "both_wrong": True}

        for t in pending:
            if not t.done(): t.cancel()

        print(f"[MATCH DEBUG] q{q_idx} first={first_key} p1a={p1_ans_given} p2a={p2_ans_given} correct={correct} p1s={p1_score:.2f} p2s={p2_score:.2f}")

        base_result = {
            "type": "question_result",
            "match_id": match_id,
            "question_index": q_idx,
            "correct_answer": correct,
            "p1_score": p1_score,
            "p2_score": p2_score,
        }
        if p1_is_human:
            await marathon_manager.send(marathon_id, p1_id, {
                **base_result, **result_msg_p1,
                "my_score": p1_score, "opp_score": p2_score,
                "my_answer": p1_ans_given, "opp_answer": p2_ans_given,
            })
        if p2_is_human:
            await marathon_manager.send(marathon_id, p2_id, {
                **base_result, **result_msg_p2,
                "my_score": p2_score, "opp_score": p1_score,
                "my_answer": p2_ans_given, "opp_answer": p1_ans_given,
            })

        await asyncio.sleep(2)


    # Kazanan
    if p1_score > p2_score:
        winner_id = p1_id
    elif p2_score > p1_score:
        winner_id = p2_id
    else:
        winner_id = random.choice([p1_id, p2_id])

    for uid, is_human, my_s, opp_s in [
        (p1_id, p1_is_human, p1_score, p2_score),
        (p2_id, p2_is_human, p2_score, p1_score),
    ]:
        if is_human:
            await marathon_manager.send(marathon_id, uid, {
                "type": "match_end",
                "match_id": match_id,
                "won": winner_id == uid,
                "p1_score": p1_score,
                "p2_score": p2_score,
                "my_score": my_s,
                "opp_score": opp_s,
                "winner_id": winner_id,
            })

    marathon_manager.clear_queues(marathon_id, match_id)
    return winner_id


async def run_marathon_engine(marathon_id: str):
    print(f"[Engine] Maraton başladı: {marathon_id[:8]}")

    async with AsyncSessionLocal() as db:
        marathon = await db.get(Marathon, marathon_id)
        if not marathon:
            return
        marathon.status = MarathonStatus.in_progress
        marathon.started_at = datetime.utcnow()
        questions_per_round = marathon.questions_per_round or 3
        await db.commit()

    from app.services.settings_cache import get_cached_setting
    s = await get_cached_setting("marathon")
    time_limit = int(s.get("time_per_question") or 20)

    # İnsan oyuncuların WS'e bağlanmasını bekle (ilk tur mesajları kaçmasın)
    async with AsyncSessionLocal() as _db:
        _humans = await _db.execute(
            select(MarathonParticipant).where(
                MarathonParticipant.marathon_id == marathon_id,
                MarathonParticipant.status == MarathonParticipantStatus.active,
            )
        )
        _human_ids = []
        for _p in _humans.scalars().all():
            await _db.refresh(_p, ["user"])
            if not _p.user.is_bot:
                _human_ids.append(str(_p.user_id))

    if _human_ids:
        print(f"[Engine] {len(_human_ids)} insan oyuncu bekleniyor...")
        for _ in range(20):  # max 20 saniye
            _connected = marathon_manager.connections.get(marathon_id, {})
            _ready = [uid for uid in _human_ids if uid in _connected]
            if len(_ready) >= len(_human_ids):
                print(f"[Engine] Tüm insanlar bağlandı ({len(_ready)}/{len(_human_ids)})")
                break
            await asyncio.sleep(1)
        await asyncio.sleep(2)  # ekstra tampon

    for round_num in range(1, 8):
        async with AsyncSessionLocal() as db:
            active = await get_active_participants(db, marathon_id)

        if len(active) <= 1:
            break

        label = round_label(len(active))
        print(f"[Engine] Tur {round_num}: {label} ({len(active)} kişi)")

        await marathon_manager.broadcast(marathon_id, {
            "type": "round_start",
            "round": round_num,
            "round_label": label,
            "active_count": len(active),
        })
        await asyncio.sleep(15)  # WS bağlantıları için yeterli süre

        async with AsyncSessionLocal() as db:
            questions = await get_round_questions(db, marathon_id, round_num, questions_per_round)

        humans = [p for p in active if not p.user.is_bot]
        bots = [p for p in active if p.user.is_bot]
        random.shuffle(bots)
        ordered = humans + bots

        match_infos = []
        bye_id = None

        async with AsyncSessionLocal() as db:
            for i in range(0, len(ordered) - 1, 2):
                p1, p2 = ordered[i], ordered[i + 1]
                match = MarathonMatch(
                    marathon_id=marathon_id,
                    round_number=round_num,
                    player1_id=str(p1.user_id),
                    player2_id=str(p2.user_id),
                    status="in_progress",
                    started_at=datetime.utcnow(),
                )
                db.add(match)
                await db.flush()
                match_infos.append({
                    "match_id": str(match.id),
                    "p1_id": str(p1.user_id),
                    "p2_id": str(p2.user_id),
                    "p1_name": p1.user.username,
                    "p2_name": p2.user.username,
                    "p1_is_human": not p1.user.is_bot,
                    "p2_is_human": not p2.user.is_bot,
                    "p1_elo": round(p1.user.elo_rating or 1200),
                    "p2_elo": round(p2.user.elo_rating or 1200),
                    "p1_avatar": p1.user.avatar_url or "",
                    "p2_avatar": p2.user.avatar_url or "",
                })

            if len(ordered) % 2 == 1:
                bye = ordered[-1]
                bye_id = str(bye.user_id)
                bye_match = MarathonMatch(
                    marathon_id=marathon_id,
                    round_number=round_num,
                    player1_id=bye_id,
                    player2_id=None,
                    winner_id=bye_id,
                    status="finished",
                    started_at=datetime.utcnow(),
                    finished_at=datetime.utcnow(),
                )
                db.add(bye_match)
                if not bye.user.is_bot:
                    await marathon_manager.send(marathon_id, bye_id, {
                        "type": "bye",
                        "round": round_num,
                        "message": "Bu turda rakipsiz geçiyorsunuz.",
                    })
            await db.commit()

        # match_start gönder — 3 kez tekrar et (geç bağlananlar için)
        for attempt in range(3):
            for m in match_infos:
                if m["p1_is_human"]:
                    await marathon_manager.send(marathon_id, m["p1_id"], {
                        "type": "match_start",
                        "match_id": m["match_id"],
                        "round": round_num,
                        "round_label": label,
                        "opponent": await get_username(m["p2_id"]),
                        "total_questions": len(questions),
                        "is_p1": True,
                        "my_elo": m.get("p1_elo", 1200),
                        "opponent_elo": m.get("p2_elo", 1200),
                        "my_avatar": m.get("p1_avatar", ""),
                        "opponent_avatar": m.get("p2_avatar", ""),
                    })
                if m["p2_is_human"]:
                    await marathon_manager.send(marathon_id, m["p2_id"], {
                        "type": "match_start",
                        "match_id": m["match_id"],
                        "round": round_num,
                        "round_label": label,
                        "opponent": await get_username(m["p1_id"]),
                        "my_elo": m.get("p2_elo", 1200),
                        "opponent_elo": m.get("p1_elo", 1200),
                        "my_avatar": m.get("p2_avatar", ""),
                        "opponent_avatar": m.get("p1_avatar", ""),
                        "total_questions": len(questions),
                        "is_p1": False,
                    })
            if attempt < 2:
                await asyncio.sleep(5)

        # Maçları paralel çalıştır
        # Son 8'den itibaren bracket verisi gonder
        if len(ordered) <= 8:
            await marathon_manager.broadcast(marathon_id, {
                "type": "bracket",
                "round": round_num,
                "round_label": label,
                "stage_size": len(ordered),
                "matches": [
                    {"match_id": m["match_id"], "p1": m["p1_name"], "p2": m["p2_name"], "winner": None}
                    for m in match_infos
                ],
            })
            await asyncio.sleep(4)  # bracket'i gorsun

        results = await asyncio.gather(*[
            run_match(
                marathon_id=marathon_id,
                match_id=m["match_id"],
                p1_id=m["p1_id"], p2_id=m["p2_id"],
                questions=questions, round_num=round_num,
                p1_is_human=m["p1_is_human"], p2_is_human=m["p2_is_human"],
                p2_elo=m["p2_elo"], time_limit=time_limit,
            ) for m in match_infos
        ], return_exceptions=True)

        winner_ids = set()
        for i, w in enumerate(results):
            if isinstance(w, Exception):
                w = random.choice([match_infos[i]["p1_id"], match_infos[i]["p2_id"]])
            winner_ids.add(w)
        if bye_id:
            winner_ids.add(bye_id)

        async with AsyncSessionLocal() as db:
            for m in match_infos:
                match = await db.get(MarathonMatch, m["match_id"])
                if match:
                    match.winner_id = m["p1_id"] if m["p1_id"] in winner_ids else m["p2_id"]
                    match.status = "finished"
                    match.finished_at = datetime.utcnow()

            result = await db.execute(
                select(MarathonParticipant).where(
                    MarathonParticipant.marathon_id == marathon_id,
                    MarathonParticipant.status == MarathonParticipantStatus.active,
                )
            )
            for p in result.scalars().all():
                if str(p.user_id) not in winner_ids:
                    p.status = MarathonParticipantStatus.eliminated
                    p.eliminated_at_round = round_num
                else:
                    p.current_round = round_num
            await db.commit()

        async with AsyncSessionLocal() as db:
            remaining = await get_active_participants(db, marathon_id)

        # Son 8'den itibaren bracket sonucunu gonder (kazananlar dolsun)
        if len(ordered) <= 8:
            _bracket_res = []
            for _mi, _w in zip(match_infos, results):
                _wname = _mi["p1_name"] if str(_w) == _mi["p1_id"] else _mi["p2_name"]
                _bracket_res.append({
                    "match_id": _mi["match_id"],
                    "p1": _mi["p1_name"],
                    "p2": _mi["p2_name"],
                    "winner": _wname,
                })
            await marathon_manager.broadcast(marathon_id, {
                "type": "bracket_update",
                "round": round_num,
                "round_label": label,
                "stage_size": len(ordered),
                "matches": _bracket_res,
            })
            await asyncio.sleep(4)

        await marathon_manager.broadcast(marathon_id, {
            "type": "round_end",
            "round": round_num,
            "remaining": len(remaining),
            "winners": list(winner_ids),
        })

        if len(remaining) <= 1:
            break

        await asyncio.sleep(8)

    await finish_marathon(marathon_id)


async def finish_marathon(marathon_id: str):
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(MarathonParticipant).where(
                MarathonParticipant.marathon_id == marathon_id,
                MarathonParticipant.status == MarathonParticipantStatus.active,
            )
        )
        finalists = result.scalars().all()
        for i, p in enumerate(finalists):
            if i == 0:
                p.status = MarathonParticipantStatus.champion
                p.xp_earned = 500
                try:
                    from app.services.achievement import award_trophy_or_medal
                    from app.models.notification import Notification
                    await award_trophy_or_medal(db, str(p.user_id), "marathon", str(marathon_id), rank=1)
                    db.add(Notification(user_id=str(p.user_id), type="trophy", title="🏆 Maraton Sampiyonu!", message="Maratonu kazandin, kupa senin!", data={"rank": 1, "marathon_id": str(marathon_id)}))
                except Exception as _e:
                    print(f"[Engine] kupa hatasi: {_e}")
            elif i == 1:
                p.status = MarathonParticipantStatus.second
                p.xp_earned = 200
                try:
                    from app.services.achievement import award_trophy_or_medal
                    from app.models.notification import Notification
                    await award_trophy_or_medal(db, str(p.user_id), "marathon", str(marathon_id), rank=2)
                    db.add(Notification(user_id=str(p.user_id), type="medal", title="🥈 Maraton Ikincisi!", message="Maratonda 2. oldun, madalya kazandin!", data={"rank": 2, "marathon_id": str(marathon_id)}))
                except Exception as _e:
                    print(f"[Engine] madalya hatasi: {_e}")

        marathon = await db.get(Marathon, marathon_id)
        if marathon:
            marathon.status = MarathonStatus.finished
            marathon.finished_at = datetime.utcnow()
        await db.commit()

    champion_name = await get_username(str(finalists[0].user_id)) if finalists else "?"
    await marathon_manager.broadcast(marathon_id, {
        "type": "marathon_end",
        "champion": champion_name,
    })
    print(f"[Engine] Şampiyon: {champion_name}")
