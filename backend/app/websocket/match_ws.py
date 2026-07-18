from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import asyncio
from datetime import datetime, date

from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.user import User
from app.models.match import Match, MatchAnswer, MatchStatus
MatchModel = Match
MS = MatchStatus
from app.models.question import Question
from app.websocket.manager import manager
from app.services.elo import calculate_elo, get_points, POINTS
from app.services.achievement_engine import process_match_result
from app.websocket.bot_match import run_bot_match, find_bot_opponent, get_random_questions as get_bot_questions

QUESTIONS_PER_MATCH = 15  # Varsayılan, ayarlardan override edilir

async def get_random_questions(db: AsyncSession, count: int):
    """
    Soru dağılımı — admin ayarlarından okunur.
    """
    from sqlalchemy import func
    from sqlalchemy.orm import selectinload
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
                Question.category.has(in_general_match=True),
            )
            .order_by(func.random())
            .limit(q_count)
        )
        questions.extend(result.scalars().all())

    # Zorluk sırasına göre sıralı gelsin (kolay → çok zor)
    return questions

def build_question_payload(q: Question, index: int, total: int) -> dict:
    _pcfg = POINTS.get(q.difficulty.value, POINTS["easy"])
    time_limit = _pcfg["time_limit"]
    return {
        "id": str(q.id),
        "text": q.text,
        "difficulty": q.difficulty.value,
        "category_name": q.category.name if q.category else "",
        "option_a": q.option_a,
        "option_b": q.option_b,
        "option_c": q.option_c,
        "option_d": q.option_d,
        "time_limit": time_limit,
        "question_image": q.question_image or "",
        "points_correct": _pcfg.get("correct", 10),
        "points_wrong": _pcfg.get("wrong", -3),
        "index": index,
        "total": total,
    }

async def run_match(match_id: str, p1_id: str, p2_id: str, questions: list,
                    p1_elo: float, p2_elo: float, p1_extra_jokers: int = 0, p2_extra_jokers: int = 0):
    queues = manager.match_queues.get(match_id, {})
    scores = {p1_id: 0, p2_id: 0}
    jokers = {p1_id: 1 + min(p1_extra_jokers, 1), p2_id: 1 + min(p2_extra_jokers, 1)}
    passes = {p1_id: 1, p2_id: 1}

    async with AsyncSessionLocal() as db:
        # 3-2-1 geri sayım
        for i in [3, 2, 1]:
            await manager.broadcast_match(match_id, {"type": "countdown", "count": i})
            await asyncio.sleep(1)
        await manager.broadcast_match(match_id, {"type": "match_go"})
        await asyncio.sleep(0.3)

        for q_index, question in enumerate(questions):
            # Önceki sorudan kalan mesajları temizle
            for pid in [p1_id, p2_id]:
                q = queues.get(pid)
                if q:
                    while not q.empty():
                        try:
                            q.get_nowait()
                        except Exception:
                            pass

            q_payload = build_question_payload(question, q_index, len(questions))
            await manager.broadcast_match(match_id, {
                "type": "question",
                "question": q_payload,
                "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
            })

            can_answer = {p1_id: True, p2_id: True}
            last_answers = {}
            time_limit = q_payload["time_limit"]
            question_done = False
            import time as time_module
            question_start = time_module.time()

            while not question_done:
                active = [pid for pid in [p1_id, p2_id] if can_answer[pid]]

                if not active:
                    # İkisi de yanlış — kimin hangi cevabı verdiğini gönder
                    await manager.send_to_user(p1_id, match_id, {
                        "type": "both_wrong",
                        "correct_answer": question.correct_answer,
                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                        "question_index": q_index,
                        "opp_answer": last_answers.get(p2_id),
                    })
                    await manager.send_to_user(p2_id, match_id, {
                        "type": "both_wrong",
                        "correct_answer": question.correct_answer,
                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                        "question_index": q_index,
                        "opp_answer": last_answers.get(p1_id),
                    })
                    await asyncio.sleep(3)
                    break

                # Aktif oyuncuların queue task'larını oluştur
                tasks = {}
                for pid in active:
                    q = queues.get(pid)
                    if q:
                        tasks[pid] = asyncio.ensure_future(q.get())

                if not tasks:
                    break

                done, pending = await asyncio.wait(
                    list(tasks.values()),
                    timeout=time_limit,
                    return_when=asyncio.FIRST_COMPLETED
                )

                # Bekleyen task'ları iptal et
                for t in pending:
                    t.cancel()
                if pending:
                    await asyncio.gather(*pending, return_exceptions=True)

                if not done:
                    # Süre doldu
                    await manager.broadcast_match(match_id, {
                        "type": "time_up",
                        "correct_answer": question.correct_answer,
                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                        "question_index": q_index,
                    })
                    await asyncio.sleep(3)
                    break

                # Kim cevapladı?
                completed = list(done)[0]
                answerer_id = next(pid for pid, t in tasks.items() if t == completed)
                data = completed.result()
                msg_type = data.get("type")
                opp_id = p2_id if answerer_id == p1_id else p1_id

                # JOKER
                if msg_type == "joker":
                    if jokers.get(answerer_id, 0) > 0:
                        # Extra joker (2.) kullanılıyorsa DB'den düş
                        if jokers.get(answerer_id, 0) == 2:
                            try:
                                from sqlalchemy import text as _st2
                                await db.execute(_st2("""
                                    UPDATE user_shop_settings 
                                    SET extra_jokers = GREATEST(extra_jokers - 1, 0)
                                    WHERE user_id = :uid AND extra_jokers > 0
                                """), {"uid": answerer_id})
                                await db.commit()
                            except Exception:
                                pass
                        jokers[answerer_id] -= 1
                        wrong = [o for o in ["A","B","C","D"] if o != question.correct_answer][:2]
                        await manager.send_to_user(answerer_id, match_id, {
                            "type": "joker_result",
                            "eliminated": wrong,
                            "question_index": q_index,
                        })
                        await manager.send_to_user(opp_id, match_id, {
                            "type": "opponent_joker",
                            "eliminated": wrong,
                            "question_index": q_index,
                        })
                    else:
                        await manager.send_to_user(answerer_id, match_id, {
                            "type": "joker_result",
                            "eliminated": [],
                            "error": "Joker hakkın kalmadı.",
                        })
                    # Joker kullandı, kalan süreyi güncelle
                    elapsed = time_module.time() - question_start
                    time_limit = max(int(q_payload["time_limit"] - elapsed), 3)
                    continue

                # PAS
                if msg_type == "pass":
                    if passes.get(answerer_id, 0) > 0:
                        passes[answerer_id] -= 1
                        await manager.send_to_user(answerer_id, match_id, {
                            "type": "pass_result",
                            "correct_answer": question.correct_answer,
                            "question_index": q_index,
                        })
                        await manager.send_to_user(opp_id, match_id, {
                            "type": "opponent_passed",
                            "question_index": q_index,
                        })
                    await asyncio.sleep(3)
                    question_done = True
                    break

                # CEVAP
                print(f"[WS] msg_type={msg_type}")
                if msg_type == "answer":
                    answer = data.get("answer", "").upper()
                    last_answers[answerer_id] = answer
                    sent_qid = data.get("question_id", "")
                    expected_qid = str(question.id)
                    qid_match = "✓" if sent_qid == expected_qid else f"✗ FARKLI! Gelen:{sent_qid[:8]} Beklenen:{expected_qid[:8]}"
                    is_correct = answer == question.correct_answer
                    response_time_ms = data.get("response_time_ms", 0)
                    time_limit_ms = POINTS.get(question.difficulty.value, POINTS["easy"])["time_limit"] * 1000
                    time_remaining_seconds = max(0, (time_limit_ms - response_time_ms) / 1000)
                    diff_str = question.difficulty.value if hasattr(question.difficulty, 'value') else str(question.difficulty)
                    points = get_points(diff_str, is_correct, time_remaining_seconds)
                    print(f"[POINTS] diff={diff_str} correct={is_correct} response_ms={response_time_ms} remaining_s={time_remaining_seconds:.2f} points={points}")

                    # DB'ye kaydet
                    db.add(MatchAnswer(
                        match_id=match_id,
                        question_id=str(question.id),
                        user_id=answerer_id,
                        selected_answer=answer,
                        is_correct=is_correct,
                        points_earned=points,
                        response_time_ms=data.get("response_time_ms", 0),
                    ))
                    await db.commit()

                    if is_correct:
                        print(f"[SCORE] points={points} type={type(points)} scores_before={scores[answerer_id]}")
                        scores[answerer_id] = round(scores[answerer_id] + points, 2)
                        print(f"[SCORE] scores_after={scores[answerer_id]}")
                        # Doğru yapana
                        await manager.send_to_user(answerer_id, match_id, {
                            "type": "answer_result",
                            "is_correct": True,
                            "correct_answer": question.correct_answer,
                            "points": points,
                            "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                            "question_index": q_index,
                        })
                        # Rakibe
                        await manager.send_to_user(opp_id, match_id, {
                            "type": "opponent_correct",
                            "correct_answer": question.correct_answer,
                            "points": points,
                            "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                            "question_index": q_index,
                        })
                        await asyncio.sleep(3)
                        question_done = True

                    else:
                        scores[answerer_id] += points
                        can_answer[answerer_id] = False
                        # Kalan süreyi hesapla — time_limit zaten kalan süre

                        # Kalan süreyi hesapla
                        elapsed = time_module.time() - question_start
                        remaining = max(int(time_limit - elapsed), 3)
                        time_limit = remaining  # Bir sonraki wait için kalan süre

                        # Yanlış yapana
                        await manager.send_to_user(answerer_id, match_id, {
                            "type": "answer_result",
                            "is_correct": False,
                            "correct_answer": None,
                            "points": points,
                            "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                            "question_index": q_index,
                            "opponent_gets_chance": True,
                        })
                        # Rakibe — kalan süreyi ver
                        await manager.send_to_user(opp_id, match_id, {
                            "type": "opponent_wrong",
                            "wrong_answer": answer,
                            "remaining_time": remaining,
                            "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                            "question_index": q_index,
                        })
                        # Döngü devam eder, rakip cevap verecek

        # TÜM SORULAR BİTTİ — maçı sonuçlandır
        p1_total = round(float(scores[p1_id]), 2)
        p2_total = round(float(scores[p2_id]), 2)
        winner_id = p1_id if p1_total > p2_total else (p2_id if p2_total > p1_total else None)

        r1 = await db.execute(select(User).where(User.id == p1_id))
        r2 = await db.execute(select(User).where(User.id == p2_id))
        p1 = r1.scalar_one_or_none()
        p2 = r2.scalar_one_or_none()

        new_p1_elo = p1.elo_rating if p1 else p1_elo
        new_p2_elo = p2.elo_rating if p2 else p2_elo
        p1_elo_before = p1.elo_rating if p1 else p1_elo
        p2_elo_before = p2.elo_rating if p2 else p2_elo

        if p1 and p2:
            if winner_id == p1_id:
                new_p1_elo, new_p2_elo = calculate_elo(p1.elo_rating, p2.elo_rating)
            elif winner_id == p2_id:
                new_p2_elo, new_p1_elo = calculate_elo(p2.elo_rating, p1.elo_rating)
            else:
                exp = 1 / (1 + 10 ** ((p2.elo_rating - p1.elo_rating) / 400))
                new_p1_elo = round(p1.elo_rating + 16 * (0.5 - exp), 2)
                new_p2_elo = round(p2.elo_rating + 16 * (0.5 - (1 - exp)), 2)

            p1.elo_rating = new_p1_elo
            p2.elo_rating = new_p2_elo
            p1.total_matches += 1
            p2.total_matches += 1
            if winner_id == p1_id:
                p1.total_wins += 1
                p2.total_losses += 1
            elif winner_id == p2_id:
                p2.total_wins += 1
                p1.total_losses += 1

        r = await db.execute(select(Match).where(Match.id == match_id))
        match_obj = r.scalar_one_or_none()
        if match_obj:
            match_obj.player1_score = p1_total
            match_obj.player2_score = p2_total
            match_obj.winner_id = winner_id
            match_obj.status = MatchStatus.finished
            match_obj.finished_at = datetime.utcnow()
            match_obj.player1_elo_after = new_p1_elo
            match_obj.player2_elo_after = new_p2_elo
        await db.commit()

        # Achievement Engine — XP, lig, rozet
        ans_result = await db.execute(
            select(MatchAnswer.user_id, MatchAnswer.is_correct, MatchAnswer.response_time_ms)
            .where(MatchAnswer.match_id == match_id)
        )
        all_answers = ans_result.fetchall()
        p1_correct = sum(1 for uid, correct, _ in all_answers if str(uid) == p1_id and correct)
        p2_correct = sum(1 for uid, correct, _ in all_answers if str(uid) == p2_id and correct)
        p1_min_rt = min((rt for uid, correct, rt in all_answers if str(uid) == p1_id and correct and rt), default=99999)
        p2_min_rt = min((rt for uid, correct, rt in all_answers if str(uid) == p2_id and correct and rt), default=99999)

        p1_achievement = await process_match_result(
            user_id=p1_id, match_id=match_id, match_type="1v1",
            won=(winner_id == p1_id), draw=(winner_id is None),
            correct_answers=p1_correct, total_questions=len(questions),
            min_response_time_ms=p1_min_rt,
            my_score=p1_total,
        )
        p2_achievement = await process_match_result(
            user_id=p2_id, match_id=match_id, match_type="1v1",
            won=(winner_id == p2_id), draw=(winner_id is None),
            correct_answers=p2_correct, total_questions=len(questions),
            min_response_time_ms=p2_min_rt,
            my_score=p2_total,
        )

        await manager.send_to_user(p1_id, match_id, {
            "type": "match_end",
            "player1_score": p1_total,
            "player2_score": p2_total,
            "winner_id": str(winner_id) if winner_id else None,
            "player1_elo_change": round(new_p1_elo - p1_elo_before, 2),
            "player2_elo_change": round(new_p2_elo - p2_elo_before, 2),
            "xp_gained": p1_achievement.get("xp_gained", 0),
            "xp_breakdown": p1_achievement.get("xp_breakdown", []),
            "title_changed": p1_achievement.get("title_changed", False),
            "new_title": p1_achievement.get("new_title"),
            "league_new_record": p1_achievement.get("league_record", False),
            "new_badges": p1_achievement.get("new_badges", []),
        })
        await manager.send_to_user(p2_id, match_id, {
            "type": "match_end",
            "player1_score": p1_total,
            "player2_score": p2_total,
            "winner_id": str(winner_id) if winner_id else None,
            "player1_elo_change": round(new_p1_elo - p1_elo_before, 2),
            "player2_elo_change": round(new_p2_elo - p2_elo_before, 2),
            "xp_gained": p2_achievement.get("xp_gained", 0),
            "xp_breakdown": p2_achievement.get("xp_breakdown", []),
            "title_changed": p2_achievement.get("title_changed", False),
            "new_title": p2_achievement.get("new_title"),
            "league_new_record": p2_achievement.get("league_record", False),
            "new_badges": p2_achievement.get("new_badges", []),
        })

    manager.match_queues.pop(match_id, None)


async def handle_match_ws(websocket: WebSocket, token: str):
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    user_id = payload.get("sub")
    await manager.connect(websocket, user_id)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            await websocket.close(code=4001)
            return

        # Shop settings
        user_card_color = None
        user_extra_jokers = 0
        try:
            from sqlalchemy import text as _st
            _sr = await db.execute(_st("SELECT card_color, extra_jokers FROM user_shop_settings WHERE user_id = :u"), {"u": user_id})
            _s = _sr.mappings().fetchone()
            if _s:
                user_card_color = _s["card_color"]
                user_extra_jokers = int(_s["extra_jokers"] or 0)
        except Exception as _se:
            print(f"[SHOP] user_shop_settings hatası: {_se}")

        match_id = None

        try:
            await websocket.send_json({
                "type": "connected",
                "user_id": user_id,
                "elo": user.elo_rating,
            })

            # Kuyruğa ekle
            manager.add_to_queue(user_id, websocket, user.elo_rating)
            print(f"[QUEUE] {user.username} kuyruğa eklendi. Kuyruk: {len(manager.queue)}")

            # Rakip ara — 3 saniye dene, bulamazsan event bekle
            found_match_id = None

            for _ in range(2):
                opp = manager.find_opponent(user_id, user.elo_rating)
                if opp:
                    opp_id, opp_ws, opp_elo = opp
                    manager.remove_from_queue(opp_id)
                    manager.remove_from_queue(user_id)

                    # Rakip bilgilerini çek
                    r2 = await db.execute(select(User).where(User.id == opp_id))
                    opp_user = r2.scalar_one_or_none()

                    # Rakip shop settings
                    opp_card_color = None
                    opp_extra_jokers = 0
                    try:
                        _osr = await db.execute(_st("SELECT card_color, extra_jokers FROM user_shop_settings WHERE user_id = :u"), {"u": opp_id})
                        _os = _osr.mappings().fetchone()
                        if _os:
                            opp_card_color = _os["card_color"]
                            opp_extra_jokers = int(_os["extra_jokers"] or 0)
                    except Exception:
                        pass

                    # Rakip shop settings
                    from sqlalchemy import text as _text
                    opp_shop = await db.execute(_text(
                        "SELECT card_color, extra_jokers FROM user_shop_settings WHERE user_id = :uid"
                    ), {"uid": opp_id})
                    opp_shop_row = opp_shop.mappings().fetchone()
                    opp_card_color = opp_shop_row["card_color"] if opp_shop_row else None
                    opp_extra_jokers = opp_shop_row["extra_jokers"] if opp_shop_row else 0

                    # Soruları çek
                    from app.services.settings_cache import get_cached_setting as _gcs
                    _ms = await _gcs("match")
                    _q_count = _ms.get("total_questions", QUESTIONS_PER_MATCH)
                    print(f"[MATCH] Soru sayısı: {_q_count} (ayar: {_ms})")
                    questions = await get_random_questions(db, _q_count)
                    if not questions:
                        await websocket.send_json({"type": "error", "message": "Yeterli soru yok."})
                        return

                    # Maç oluştur
                    match = Match(
                        player1_id=user_id,
                        player2_id=opp_id,
                        question_ids=[str(q.id) for q in questions],
                        status=MatchStatus.in_progress,
                        player1_elo_before=user.elo_rating,
                        player2_elo_before=opp_elo,
                        started_at=datetime.utcnow(),
                        total_questions=len(questions),
                    )
                    db.add(match)
                    await db.commit()
                    await db.refresh(match)

                    match_id = str(match.id)
                    p1_id = user_id
                    p2_id = opp_id

                    # Queue'ları oluştur
                    manager.match_queues[match_id] = {
                        p1_id: asyncio.Queue(),
                        p2_id: asyncio.Queue(),
                    }

                    # İkisini de maça bağla
                    await manager.join_match(match_id, p1_id, websocket)
                    await manager.join_match(match_id, p2_id, opp_ws)

                    # Rakibi bilgilendir
                    manager.notify_matched(p2_id, match_id)

                    # Başlangıç mesajları
                    await manager.send_to_user(p1_id, match_id, {
                        "type": "match_start",
                        "match_id": match_id,
                        "player_number": 1,
                        "total_questions": len(questions),
                        "my_card_color": user_card_color,
                        "extra_jokers": user_extra_jokers,
                        "opponent": {
                            "username": opp_user.username if opp_user else "Rakip",
                            "elo": round(opp_elo),
                            "avatar_url": opp_user.avatar_url or "" if opp_user else "",
                            "card_color": opp_card_color,
                            "extra_jokers": opp_extra_jokers,
                        },
                    })
                    await manager.send_to_user(p2_id, match_id, {
                        "type": "match_start",
                        "match_id": match_id,
                        "player_number": 2,
                        "total_questions": len(questions),
                        "my_card_color": opp_card_color,
                        "extra_jokers": opp_extra_jokers,
                        "opponent": {
                            "username": user.username,
                            "elo": round(user.elo_rating),
                            "avatar_url": user.avatar_url or "",
                            "card_color": user_card_color,
                            "extra_jokers": user_extra_jokers,
                        },
                    })

                    # Maç motorunu başlat
                    asyncio.ensure_future(
                        run_match(match_id, p1_id, p2_id, questions, user.elo_rating, opp_elo,
                                  p1_extra_jokers=user_extra_jokers, p2_extra_jokers=opp_extra_jokers)
                    )
                    found_match_id = match_id
                    break

                await asyncio.sleep(1)

            if not found_match_id:
                # 10 saniye daha bekle — rakip bizi bulabilir
                mid = await manager.wait_for_match(user_id, timeout=4)
                if not mid:
                    # Bot ayarını kontrol et
                    from app.services.settings import get_settings
                    async with AsyncSessionLocal() as settings_db:
                        match_settings = await get_settings(settings_db, "match")
                        bot_enabled = match_settings.get("bot_enabled", True)

                    if not bot_enabled:
                        await websocket.send_json({"type": "no_opponent", "message": "Rakip bulunamadı."})
                        manager.remove_from_queue(user_id)
                        return

                    # Bot ile eşleştir
                    manager.remove_from_queue(user_id)
                    await websocket.send_json({
                        "type": "bot_match",
                        "message": "Rakip bulunamadı, bot ile eşleştiriliyorsunuz...",
                    })
                    await asyncio.sleep(1)

                    async with AsyncSessionLocal() as bot_db:
                        bot = await find_bot_opponent(bot_db, user.elo_rating)
                        from app.services.settings_cache import get_cached_setting as _gcs2
                        _ms2 = await _gcs2("match")
                        _qc2 = _ms2.get("total_questions", QUESTIONS_PER_MATCH)
                        questions = await get_bot_questions(bot_db, _qc2)

                        if not questions or not bot:
                            await websocket.send_json({"type": "no_opponent", "message": "Maç başlatılamadı."})
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
                        )
                        bot_db.add(match)
                        await bot_db.commit()
                        await bot_db.refresh(match)

                        match_id = str(match.id)
                        manager.match_queues[match_id] = {
                            user_id: asyncio.Queue(),
                            str(bot.id): asyncio.Queue(),
                        }
                        await manager.join_match(match_id, user_id, websocket)

                        await manager.send_to_user(user_id, match_id, {
                            "type": "match_start",
                            "match_id": match_id,
                            "player_number": 1,
                            "total_questions": len(questions),
                            "my_card_color": user_card_color,
                            "extra_jokers": user_extra_jokers,
                            "opponent": {
                                "username": bot.username,
                                "elo": round(bot.elo_rating),
                                "is_bot": True,
                                "extra_jokers": 0,
                            },
                        })

                        asyncio.ensure_future(
                            run_bot_match(
                                match_id, user_id, str(bot.id),
                                questions, user.elo_rating, bot.elo_rating,
                                player_number=1,
                            )
                        )
                else:
                    match_id = mid

            # Mesaj iletici döngü
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                if msg_type in ("answer", "joker", "pass"):
                    mid = manager.user_match.get(user_id) or match_id
                    q = manager.match_queues.get(mid, {}).get(user_id)
                    if q:
                        await q.put(data)
                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

        except WebSocketDisconnect:
            if match_id:
                await manager.broadcast_match(match_id, {
                    "type": "opponent_disconnected",
                    "message": "Rakip bağlantısı kesildi.",
                })
            await manager.disconnect(user_id, match_id)
        except Exception as e:
            print(f"WS Hata [{user_id}]: {e}")
            import traceback
            traceback.print_exc()
            await manager.disconnect(user_id, match_id)
