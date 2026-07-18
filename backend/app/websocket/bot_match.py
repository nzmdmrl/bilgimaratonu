import asyncio
import random
from datetime import datetime, date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.match import Match, MatchAnswer, MatchStatus
from app.models.question import Question
from app.websocket.manager import manager
from app.services.elo import calculate_elo, get_points, POINTS
from app.services.bot import bot_answer, bot_response_time
from app.services.achievement_engine import process_match_result
import time as time_module

async def get_random_questions(db: AsyncSession, count: int):
    from sqlalchemy import func
    from sqlalchemy.orm import selectinload
    from app.services.settings_cache import get_cached_setting

    match_settings = await get_cached_setting("match")
    print(f"[BOT_MATCH] match_settings: {match_settings}")
    dist = match_settings.get("distribution", {"easy": 5, "medium": 5, "hard": 3, "very_hard": 2})
    distribution = [
        ("easy", dist.get("easy", 5)),
        ("medium", dist.get("medium", 5)),
        ("hard", dist.get("hard", 3)),
        ("very_hard", dist.get("very_hard", 2)),
    ]
    # Eğer distribution toplamı total_questions ile uyuşmuyorsa total_questions'a göre ölçekle
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

async def find_bot_opponent(db: AsyncSession, user_elo: float) -> User:
    result = await db.execute(
        select(User).where(
            User.is_bot == True,
            User.is_active == True,
            User.elo_rating >= user_elo - 200,
            User.elo_rating <= user_elo + 200,
        ).limit(20)
    )
    bots = result.scalars().all()
    if not bots:
        result = await db.execute(
            select(User).where(User.is_bot == True, User.is_active == True).limit(20)
        )
        bots = result.scalars().all()
    return random.choice(bots)

async def run_bot_match(
    match_id: str,
    player_id: str,
    bot_id: str,
    questions: list,
    player_elo: float,
    bot_elo: float,
    player_number: int,
):
    p1_id = player_id if player_number == 1 else bot_id
    p2_id = bot_id if player_number == 1 else player_id
    scores = {player_id: 0, bot_id: 0}

    # Queue oluştur
    import asyncio as _asyncio
    if match_id not in manager.match_queues:
        manager.match_queues[match_id] = {}
    if player_id not in manager.match_queues[match_id]:
        manager.match_queues[match_id][player_id] = _asyncio.Queue()
    player_queue = manager.match_queues[match_id][player_id]

    async with AsyncSessionLocal() as db:
        # Geri sayım
        for i in [3, 2, 1]:
            await manager.send_to_user(player_id, match_id, {"type": "countdown", "count": i})
            await asyncio.sleep(1)
        await manager.send_to_user(player_id, match_id, {"type": "match_go"})
        await asyncio.sleep(0.3)

        for q_index, question in enumerate(questions):
            # Queue temizle
            if player_queue:
                while not player_queue.empty():
                    try: player_queue.get_nowait()
                    except: pass

            q_payload = build_question_payload(question, q_index, len(questions))
            correct = question.correct_answer
            time_limit = q_payload["time_limit"]

            await manager.send_to_user(player_id, match_id, {
                "type": "question",
                "question": q_payload,
                "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
            })

            # Bot ne zaman cevap verecek — tamamen bağımsız
            bot_wait = bot_response_time(bot_elo, time_limit)
            bot_answer_val = bot_answer(correct, bot_elo)

            # İki bağımsız task: oyuncu bekle, bot sayaç
            player_answered = asyncio.Event()
            bot_answered = asyncio.Event()
            question_done = asyncio.Event()

            player_data_holder = {"data": None}
            q_start = time_module.time()

            async def wait_player():
                """Oyuncunun cevabını bekle."""
                if not player_queue:
                    return
                try:
                    data = await asyncio.wait_for(player_queue.get(), timeout=time_limit)
                    player_data_holder["data"] = data
                    player_answered.set()
                except asyncio.TimeoutError:
                    pass

            async def wait_bot():
                """Bot bağımsız olarak bekler — oyuncudan habersiz."""
                await asyncio.sleep(bot_wait)
                bot_answered.set()

            # İki task'ı aynı anda başlat
            player_task = asyncio.ensure_future(wait_player())
            bot_task = asyncio.ensure_future(wait_bot())

            # İlk cevaplayan kim?
            done, pending = await asyncio.wait(
                [player_task, bot_task],
                return_when=asyncio.FIRST_COMPLETED
            )

            elapsed = time_module.time() - q_start
            remaining = max(int(time_limit - elapsed), 3)

            if player_task in done and not bot_answered.is_set():
                # OYUNCU ÖNCE CEVAPLADI
                bot_task.cancel()
                data = player_data_holder.get("data")

                if data and data.get("type") == "answer":
                    answer = data.get("answer", "").upper()
                    is_correct = answer == correct
                    time_limit = POINTS.get(question.difficulty.value, POINTS["easy"])["time_limit"]
                    remaining_s = max(0.0, time_limit - elapsed)
                    points = get_points(question.difficulty.value, is_correct, remaining_s)
                    print(f"[BOT_SCORE] points={points} remaining_s={remaining_s:.2f}")

                    db.add(MatchAnswer(
                        match_id=match_id, question_id=str(question.id),
                        user_id=player_id, selected_answer=answer,
                        is_correct=is_correct, points_earned=points,
                        response_time_ms=int(elapsed * 1000),
                    ))
                    await db.commit()

                    if is_correct:
                        scores[player_id] += points
                        await manager.send_to_user(player_id, match_id, {
                            "type": "answer_result",
                            "is_correct": True,
                            "correct_answer": correct,
                            "points": points,
                            "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                            "question_index": q_index,
                        })
                        await asyncio.sleep(3)

                    else:
                        # Oyuncu yanlış — bot kalan sürede cevap verecek
                        scores[player_id] += points
                        await manager.send_to_user(player_id, match_id, {
                            "type": "answer_result",
                            "is_correct": False,
                            "correct_answer": None,
                            "points": points,
                            "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                            "question_index": q_index,
                            "opponent_gets_chance": True,
                        })

                        # Bot şimdi bağımsız olarak cevap verecek
                        bot_wait2 = bot_response_time(bot_elo, remaining)
                        await asyncio.sleep(min(bot_wait2, remaining - 0.5))

                        bot_correct = bot_answer_val == correct
                        bot_remaining2 = max(0.0, remaining - bot_wait2)
                        bot_points = get_points(question.difficulty.value, bot_correct, bot_remaining2)
                        scores[bot_id] += bot_points

                        db.add(MatchAnswer(
                            match_id=match_id, question_id=str(question.id),
                            user_id=bot_id, selected_answer=bot_answer_val,
                            is_correct=bot_correct, points_earned=bot_points,
                        ))
                        await db.commit()

                        if bot_correct:
                            await manager.send_to_user(player_id, match_id, {
                                "type": "opponent_correct",
                                "correct_answer": correct,
                                "points": bot_points,
                                "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                "question_index": q_index,
                            })
                            await asyncio.sleep(3)
                        else:
                            # İkisi de yanlış
                            await manager.send_to_user(player_id, match_id, {
                                "type": "both_wrong",
                                "correct_answer": correct,
                                "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                "question_index": q_index,
                            })
                            await asyncio.sleep(3)

                elif data and data.get("type") == "pass":
                    bot_task.cancel()
                    await manager.send_to_user(player_id, match_id, {
                        "type": "pass_result",
                        "correct_answer": correct,
                        "question_index": q_index,
                    })
                    await asyncio.sleep(3)

                elif data and data.get("type") == "joker":
                    # Joker — bot task iptal et, yeni bot_wait hesapla
                    bot_task.cancel()
                    wrong = [o for o in ["A","B","C","D"] if o != correct][:2]
                    await manager.send_to_user(player_id, match_id, {
                        "type": "joker_result",
                        "eliminated": wrong,
                        "question_index": q_index,
                    })
                    # Joker sonrası sadece oyuncu cevap verir — bot cevap veremez
                    new_remaining = max(int(time_limit - elapsed) - 1, 3)

                    if player_queue:
                        try:
                            data2 = await asyncio.wait_for(player_queue.get(), timeout=new_remaining)
                            if data2.get("type") == "answer":
                                answer = data2.get("answer", "").upper()
                                is_correct = answer == correct
                                _tl = POINTS.get(question.difficulty.value, POINTS["easy"])["time_limit"]
                                remaining_s = max(0.0, _tl - elapsed)
                                points = get_points(question.difficulty.value, is_correct, remaining_s)
                                scores[player_id] += points
                                db.add(MatchAnswer(
                                    match_id=match_id, question_id=str(question.id),
                                    user_id=player_id, selected_answer=answer,
                                    is_correct=is_correct, points_earned=points,
                                ))
                                await db.commit()
                                await manager.send_to_user(player_id, match_id, {
                                    "type": "answer_result",
                                    "is_correct": is_correct,
                                    "correct_answer": correct if is_correct else None,
                                    "points": points,
                                    "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                    "question_index": q_index,
                                })
                                if is_correct:
                                    await asyncio.sleep(3)
                                else:
                                    await manager.send_to_user(player_id, match_id, {
                                        "type": "both_wrong",
                                        "correct_answer": correct,
                                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                        "question_index": q_index,
                                    })
                                    await asyncio.sleep(3)
                        except asyncio.TimeoutError:
                            # Bot cevapladı
                            bot_correct = bot_answer_val == correct
                            bot_points = get_points(question.difficulty.value, bot_correct, max(0.0, time_limit - bot_wait) if bot_correct else 0)
                            scores[bot_id] += bot_points
                            db.add(MatchAnswer(
                                match_id=match_id, question_id=str(question.id),
                                user_id=bot_id, selected_answer=bot_answer_val,
                                is_correct=bot_correct, points_earned=bot_points,
                            ))
                            await db.commit()
                            if bot_correct:
                                await manager.send_to_user(player_id, match_id, {
                                    "type": "opponent_correct",
                                    "correct_answer": correct,
                                    "points": bot_points,
                                    "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                    "question_index": q_index,
                                })
                                await asyncio.sleep(3)
                            else:
                                await manager.send_to_user(player_id, match_id, {
                                    "type": "both_wrong",
                                    "correct_answer": correct,
                                    "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                    "question_index": q_index,
                                })
                                await asyncio.sleep(3)

            else:
                # BOT ÖNCE CEVAPLADI (veya oyuncu timeout)
                player_task.cancel()

                bot_correct = bot_answer_val == correct
                bot_points = get_points(question.difficulty.value, bot_correct, max(0.0, time_limit - bot_wait) if bot_correct else 0)
                scores[bot_id] += bot_points

                db.add(MatchAnswer(
                    match_id=match_id, question_id=str(question.id),
                    user_id=bot_id, selected_answer=bot_answer_val,
                    is_correct=bot_correct, points_earned=bot_points,
                ))
                await db.commit()

                if bot_correct:
                    # Bot doğru — oyuncuya bildir, sonraki soruya geç
                    await manager.send_to_user(player_id, match_id, {
                        "type": "opponent_correct",
                        "correct_answer": correct,
                        "points": bot_points,
                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                        "question_index": q_index,
                    })
                    await asyncio.sleep(3)

                else:
                    # Bot yanlış — oyuncuya hak ver
                    await manager.send_to_user(player_id, match_id, {
                        "type": "opponent_wrong",
                        "wrong_answer": bot_answer_val,
                        "remaining_time": remaining,
                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                        "question_index": q_index,
                    })

                    # Oyuncunun cevabını bekle
                    if player_queue:
                        try:
                            data = await asyncio.wait_for(player_queue.get(), timeout=remaining)
                            if data.get("type") == "answer":
                                answer = data.get("answer", "").upper()
                                is_correct = answer == correct
                                _tl = POINTS.get(question.difficulty.value, POINTS["easy"])["time_limit"]
                                remaining_s = max(0.0, _tl - elapsed)
                                points = get_points(question.difficulty.value, is_correct, remaining_s)
                                scores[player_id] += points
                                db.add(MatchAnswer(
                                    match_id=match_id, question_id=str(question.id),
                                    user_id=player_id, selected_answer=answer,
                                    is_correct=is_correct, points_earned=points,
                                ))
                                await db.commit()
                                await manager.send_to_user(player_id, match_id, {
                                    "type": "answer_result",
                                    "is_correct": is_correct,
                                    "correct_answer": correct if is_correct else None,
                                    "points": points,
                                    "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                    "question_index": q_index,
                                })
                                if is_correct:
                                    await asyncio.sleep(3)
                                else:
                                    await manager.send_to_user(player_id, match_id, {
                                        "type": "both_wrong",
                                        "correct_answer": correct,
                                        "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                        "question_index": q_index,
                                    })
                                    await asyncio.sleep(3)
                        except asyncio.TimeoutError:
                            # Oyuncu da cevap vermedi
                            await manager.send_to_user(player_id, match_id, {
                                "type": "time_up",
                                "correct_answer": correct,
                                "scores": {"p1": scores[p1_id], "p2": scores[p2_id]},
                                "question_index": q_index,
                            })
                            await asyncio.sleep(3)

        # MAÇ BİTTİ
        print(f"[BOT_MATCH_END] scores={scores} type={type(list(scores.values())[0])}")
        p1_total = round(float(scores[p1_id]), 2)
        p2_total = round(float(scores[p2_id]), 2)
        player_total = scores[player_id]
        winner_id = p1_id if p1_total > p2_total else (p2_id if p2_total > p1_total else None)

        r1 = await db.execute(select(User).where(User.id == player_id))
        r2 = await db.execute(select(User).where(User.id == bot_id))
        player = r1.scalar_one_or_none()
        bot = r2.scalar_one_or_none()

        new_player_elo = player.elo_rating if player else player_elo
        new_bot_elo = bot.elo_rating if bot else bot_elo
        player_elo_before = player.elo_rating if player else player_elo

        if player and bot:
            if winner_id == player_id:
                new_player_elo, new_bot_elo = calculate_elo(player.elo_rating, bot.elo_rating)
            elif winner_id == bot_id:
                new_bot_elo, new_player_elo = calculate_elo(bot.elo_rating, player.elo_rating)
            else:
                exp = 1 / (1 + 10 ** ((bot.elo_rating - player.elo_rating) / 400))
                new_player_elo = round(player.elo_rating + 16 * (0.5 - exp), 2)
                new_bot_elo = round(bot.elo_rating + 16 * (0.5 - (1 - exp)), 2)

            player.elo_rating = new_player_elo
            bot.elo_rating = new_bot_elo
            player.total_matches += 1
            bot.total_matches += 1
            if winner_id == player_id:
                player.total_wins += 1
                bot.total_losses += 1
            elif winner_id == bot_id:
                bot.total_wins += 1
                player.total_losses += 1

        r = await db.execute(select(Match).where(Match.id == match_id))
        match_obj = r.scalar_one_or_none()
        if match_obj:
            match_obj.player1_score = p1_total
            match_obj.player2_score = p2_total
            match_obj.winner_id = winner_id
            match_obj.status = MatchStatus.finished
            match_obj.finished_at = datetime.utcnow()
            match_obj.player1_elo_after = new_player_elo if player_number == 1 else new_bot_elo
            match_obj.player2_elo_after = new_bot_elo if player_number == 1 else new_player_elo
        await db.commit()

        # Achievement Engine
        ans_r = await db.execute(
            select(MatchAnswer.is_correct, MatchAnswer.response_time_ms)
            .where(MatchAnswer.match_id == match_id, MatchAnswer.user_id == player_id)
        )
        p_answers = ans_r.fetchall()
        p_correct = sum(1 for c, _ in p_answers if c)
        p_min_rt = min((rt for c, rt in p_answers if c and rt), default=99999)

        player_score_val = round(float(scores[player_id]), 2)
        bot_score_val = round(float(scores[bot_id]), 2)
        print(f"[BOT_END] player_score={player_score_val} bot_score={bot_score_val}")

        # Lig güncelle — direkt burada
        try:
            from app.services.league import update_league_score
            from datetime import date
            async with AsyncSessionLocal() as _ldb:
                await update_league_score(_ldb, player_id, player_score_val, match_id, date.today(), category_id=(match_obj.category_id if match_obj else None))
                # Bot skorunu da lige yaz (gecici — istenirse kapatilabilir)
                await update_league_score(_ldb, str(bot_id), bot_score_val, match_id, date.today(), category_id=(match_obj.category_id if match_obj else None))
                print(f"[BOT_LEAGUE] Lig güncellendi: {player_score_val} (cat={match_obj.category_id if match_obj else None})")
        except Exception as _e:
            print(f"[BOT_LEAGUE] Hata: {_e}")

        p_achievement = await process_match_result(
            user_id=player_id, match_id=match_id, match_type="bot",
            won=(winner_id == player_id), draw=(winner_id is None),
            correct_answers=p_correct, total_questions=len(questions),
            min_response_time_ms=p_min_rt,
            my_score=player_score_val,
        )

        elo_change = round(new_player_elo - player_elo_before, 2)
        p1_elo_ch = elo_change if player_number == 1 else round(new_bot_elo - bot_elo, 2)
        p2_elo_ch = round(new_bot_elo - bot_elo, 2) if player_number == 1 else elo_change

        await manager.send_to_user(player_id, match_id, {
            "type": "match_end",
            "player1_score": p1_total,
            "player2_score": p2_total,
            "winner_id": str(winner_id) if winner_id else None,
            "player1_elo_change": p1_elo_ch,
            "player2_elo_change": p2_elo_ch,
            "xp_gained": p_achievement.get("xp_gained", 0),
            "xp_breakdown": p_achievement.get("xp_breakdown", []),
            "title_changed": p_achievement.get("title_changed", False),
            "new_title": p_achievement.get("new_title"),
            "league_new_record": p_achievement.get("league_record", False),
            "new_badges": p_achievement.get("new_badges", []),
        })

    manager.match_queues.pop(match_id, None)
