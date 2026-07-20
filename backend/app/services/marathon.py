from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
import random
from datetime import datetime

from app.models.marathon import Marathon, MarathonParticipant, MarathonMatch, MarathonStatus, MarathonParticipantStatus
from app.models.question import Question, DifficultyLevel
from app.models.user import User

# Tur zorluk seviyeleri (Bölüm 20)
ROUND_DIFFICULTIES = {
    1: DifficultyLevel.easy,
    2: DifficultyLevel.easy,
    3: DifficultyLevel.medium,
    4: DifficultyLevel.medium,
    5: DifficultyLevel.hard,
    6: DifficultyLevel.hard,
    7: DifficultyLevel.very_hard,
}

ROUND_LABELS = {
    1: "Son 128", 2: "Son 64", 3: "Son 32", 4: "Son 16",
    5: "Çeyrek Final", 6: "Yarı Final", 7: "Final"
}

# Tur XP ödülleri
ROUND_XP = {1: 10, 2: 20, 3: 30, 4: 50, 5: 75, 6: 100, 7: 0}
PLACE_XP = {1: 500, 2: 200, 3: 100}

async def get_round_questions(
    db: AsyncSession,
    marathon_id: str,
    round_number: int,
    questions_per_round: int = 3,
) -> list:
    """
    Tur için ortak soru seti çek.
    Aynı turdaki tüm maçlarda aynı sorular kullanılır (Bölüm 20 adalet mekanizması).
    """
    # Mevcut maraton'dan round_questions çek
    result = await db.execute(select(Marathon).where(Marathon.id == marathon_id))
    marathon = result.scalar_one_or_none()

    if not marathon:
        return []

    rq = marathon.round_questions or {}

    if str(round_number) in rq:
        # Zaten seçilmiş — aynı soruları döndür
        q_ids = rq[str(round_number)]
        q_result = await db.execute(
            select(Question).options(selectinload(Question.category))
            .where(Question.id.in_(q_ids))
        )
        questions = q_result.scalars().all()
        # Sırayı koru
        q_map = {str(q.id): q for q in questions}
        return [q_map[qid] for qid in q_ids if qid in q_map]

    # Yeni soru seti seç
    difficulty = ROUND_DIFFICULTIES.get(round_number, DifficultyLevel.easy)
    from sqlalchemy import func
    q_result = await db.execute(
        select(Question)
        .options(selectinload(Question.category))
        .where(
            Question.is_active == True,
            Question.is_approved == True,
            Question.difficulty == difficulty,
        )
        .order_by(func.random())
        .limit(questions_per_round)
    )
    questions = q_result.scalars().all()

    # Kaydet
    rq[str(round_number)] = [str(q.id) for q in questions]
    marathon.round_questions = rq
    await db.commit()

    return questions

async def create_marathon(db: AsyncSession, max_participants: int = 128) -> Marathon:
    marathon = Marathon(
        status=MarathonStatus.waiting,
        max_participants=max_participants,
        lobby_opens_at=datetime.utcnow(),
    )
    db.add(marathon)
    await db.commit()
    await db.refresh(marathon)
    return marathon

async def join_marathon(
    db: AsyncSession,
    marathon_id: str,
    user_id: str,
) -> tuple[bool, str]:
    """
    Maratona katıl.
    Returns: (success, message)
    """
    result = await db.execute(select(Marathon).where(Marathon.id == marathon_id))
    marathon = result.scalar_one_or_none()

    if not marathon:
        return False, "Maraton bulunamadı."
    if marathon.status != MarathonStatus.waiting:
        return False, "Maraton başlamış veya dolmuş."

    # Zaten katılmış mı?
    existing = await db.execute(
        select(MarathonParticipant).where(
            MarathonParticipant.marathon_id == marathon_id,
            MarathonParticipant.user_id == user_id,
        )
    )
    if existing.scalar_one_or_none():
        return False, "Zaten bu maratona katıldınız."

    # Kapasite kontrolü
    count = await db.execute(
        select(MarathonParticipant).where(
            MarathonParticipant.marathon_id == marathon_id
        )
    )
    current = len(count.scalars().all())
    if current >= marathon.max_participants:
        # Lobi dolu — bir bot varsa onu çıkarıp insana yer aç
        from app.models.user import User as _U
        bot_p = await db.execute(
            select(MarathonParticipant)
            .join(_U, _U.id == MarathonParticipant.user_id)
            .where(
                MarathonParticipant.marathon_id == marathon_id,
                _U.is_bot == True,
            )
            .limit(1)
        )
        bot_participant = bot_p.scalar_one_or_none()
        if bot_participant:
            await db.delete(bot_participant)
            await db.flush()
            print(f"[JOIN] Lobi doluydu, bot çıkarıldı → insan alındı ({user_id[:8]})")
        else:
            return False, "Maraton dolu."

    participant = MarathonParticipant(
        marathon_id=marathon_id,
        user_id=user_id,
        status=MarathonParticipantStatus.active,
    )
    db.add(participant)
    await db.commit()
    return True, "Maratona katıldınız!"

async def fill_with_bots(db: AsyncSession, marathon_id: str) -> int:
    """Boş slotları botlarla doldur."""
    result = await db.execute(select(Marathon).where(Marathon.id == marathon_id))
    marathon = result.scalar_one_or_none()
    if not marathon:
        return 0

    # Mevcut katılımcı sayısı
    parts = await db.execute(
        select(MarathonParticipant).where(MarathonParticipant.marathon_id == marathon_id)
    )
    current = parts.scalars().all()
    current_ids = {str(p.user_id) for p in current}
    needed = marathon.max_participants - len(current)

    if needed <= 0:
        return 0

    # Bot çek
    bots_result = await db.execute(
        select(User).where(User.is_bot == True, User.is_active == True).limit(needed * 2)
    )
    all_bots = bots_result.scalars().all()
    available_bots = [b for b in all_bots if str(b.id) not in current_ids]
    selected_bots = random.sample(available_bots, min(needed, len(available_bots)))

    for bot in selected_bots:
        db.add(MarathonParticipant(
            marathon_id=marathon_id,
            user_id=str(bot.id),
            status=MarathonParticipantStatus.active,
        ))

    await db.commit()
    return len(selected_bots)

async def get_active_participants(db: AsyncSession, marathon_id: str) -> list:
    """Aktif katılımcıları döndür."""
    result = await db.execute(
        select(MarathonParticipant)
        .options(selectinload(MarathonParticipant.user))
        .where(
            MarathonParticipant.marathon_id == marathon_id,
            MarathonParticipant.status == MarathonParticipantStatus.active,
        )
    )
    return result.scalars().all()

async def create_round_matches(
    db: AsyncSession,
    marathon_id: str,
    round_number: int,
) -> list:
    """
    Tur maçlarını oluştur.
    Aktif katılımcıları ikişerli eşleştir.
    """
    participants = await get_active_participants(db, marathon_id)
    # İnsan oyuncuları başa al, botları sona
    humans = [p for p in participants if not p.user.is_bot]
    bots = [p for p in participants if p.user.is_bot]
    random.shuffle(bots)
    participants = humans + bots

    matches = []
    for i in range(0, len(participants) - 1, 2):
        p1 = participants[i]
        p2 = participants[i + 1]

        match = MarathonMatch(
            marathon_id=marathon_id,
            round_number=round_number,
            player1_id=str(p1.user_id),
            player2_id=str(p2.user_id),
            status="waiting",
        )
        db.add(match)
        matches.append(match)

    # Tek kişi kalırsa bye (direkt geçer)
    if len(participants) % 2 == 1:
        bye_participant = participants[-1]
        # Bye maçı — tek kişi direkt geçer
        match = MarathonMatch(
            marathon_id=marathon_id,
            round_number=round_number,
            player1_id=str(bye_participant.user_id),
            player2_id=None,
            winner_id=str(bye_participant.user_id),
            status="finished",
            started_at=datetime.utcnow(),
            finished_at=datetime.utcnow(),
        )
        db.add(match)
        matches.append(match)

    await db.commit()
    return matches

async def eliminate_losers(
    db: AsyncSession,
    marathon_id: str,
    round_number: int,
) -> int:
    """Turu kaybedenlerini elen."""
    # Bu turdaki maçları çek
    matches_result = await db.execute(
        select(MarathonMatch).where(
            MarathonMatch.marathon_id == marathon_id,
            MarathonMatch.round_number == round_number,
            MarathonMatch.status == "finished",
        )
    )
    matches = matches_result.scalars().all()

    eliminated = 0
    for match in matches:
        if match.winner_id and match.player2_id:
            # Kaybeden kim?
            loser_id = str(match.player2_id) if str(match.winner_id) == str(match.player1_id) else str(match.player1_id)

            loser_result = await db.execute(
                select(MarathonParticipant).where(
                    MarathonParticipant.marathon_id == marathon_id,
                    MarathonParticipant.user_id == loser_id,
                )
            )
            loser = loser_result.scalar_one_or_none()
            if loser and loser.status == MarathonParticipantStatus.active:
                loser.status = MarathonParticipantStatus.eliminated
                loser.eliminated_at_round = round_number
                eliminated += 1

    await db.commit()
    return eliminated

async def finalize_marathon(db: AsyncSession, marathon_id: str):
    """Maraton bitti — 1./2./3. belirle, XP ver."""
    from app.services.xp import award_xp
    from app.services.achievement import award_trophy_or_medal
    from app.models.notification import Notification

    result = await db.execute(select(Marathon).where(Marathon.id == marathon_id))
    marathon = result.scalar_one_or_none()
    if not marathon:
        return

    # Final maçını bul
    final_match = await db.execute(
        select(MarathonMatch).where(
            MarathonMatch.marathon_id == marathon_id,
            MarathonMatch.round_number == 7,
            MarathonMatch.status == "finished",
        )
    )
    final = final_match.scalar_one_or_none()

    if final and final.winner_id:
        winner_id = str(final.winner_id)
        loser_id = str(final.player2_id) if winner_id == str(final.player1_id) else str(final.player1_id)

        # Şampiyon
        w_part = await db.execute(
            select(MarathonParticipant).where(
                MarathonParticipant.marathon_id == marathon_id,
                MarathonParticipant.user_id == winner_id,
            )
        )
        winner_part = w_part.scalar_one_or_none()
        if winner_part:
            winner_part.status = MarathonParticipantStatus.champion
            winner_part.xp_earned = PLACE_XP[1]
            await award_trophy_or_medal(db, winner_id, "marathon", str(marathon_id), rank=1)
            db.add(Notification(user_id=winner_id, type="trophy", title="🏆 Maraton Sampiyonu!", message="Maratonu kazandin, kupa senin!", data={"rank": 1, "marathon_id": str(marathon_id)}))

        # 2.
        l_part = await db.execute(
            select(MarathonParticipant).where(
                MarathonParticipant.marathon_id == marathon_id,
                MarathonParticipant.user_id == loser_id,
            )
        )
        loser_part = l_part.scalar_one_or_none()
        if loser_part:
            loser_part.status = MarathonParticipantStatus.second
            loser_part.xp_earned = PLACE_XP[2]
            await award_trophy_or_medal(db, loser_id, "marathon", str(marathon_id), rank=2)
            db.add(Notification(user_id=loser_id, type="medal", title="🥈 Maraton Ikincisi!", message="Maratonda 2. oldun, madalya kazandin!", data={"rank": 2, "marathon_id": str(marathon_id)}))

    # 3. — Yarı final kaybedenlerinden
    semi_matches = await db.execute(
        select(MarathonMatch).where(
            MarathonMatch.marathon_id == marathon_id,
            MarathonMatch.round_number == 6,
            MarathonMatch.status == "finished",
        )
    )
    for semi in semi_matches.scalars().all():
        if semi.winner_id and semi.player2_id:
            third_id = str(semi.player2_id) if str(semi.winner_id) == str(semi.player1_id) else str(semi.player1_id)
            t_part = await db.execute(
                select(MarathonParticipant).where(
                    MarathonParticipant.marathon_id == marathon_id,
                    MarathonParticipant.user_id == third_id,
                )
            )
            third_part = t_part.scalar_one_or_none()
            if third_part and third_part.status == MarathonParticipantStatus.eliminated:
                third_part.status = MarathonParticipantStatus.third
                third_part.xp_earned = PLACE_XP[3]

    marathon.status = MarathonStatus.finished
    marathon.finished_at = datetime.utcnow()
    await db.commit()
