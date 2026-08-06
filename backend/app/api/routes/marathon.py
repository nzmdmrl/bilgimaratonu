from fastapi import APIRouter, Depends, HTTPException, WebSocket, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from typing import Optional
import asyncio

from app.core.database import get_db
from app.core.deps import get_current_user, get_current_admin
from app.models.user import User
from app.models.marathon import Marathon, MarathonParticipant, MarathonStatus, MarathonParticipantStatus
from app.services.marathon import create_marathon, join_marathon, fill_with_bots
from app.websocket.marathon_ws import handle_marathon_ws, run_marathon_engine, marathon_manager

router = APIRouter(prefix="/api/marathon", tags=["marathon"])

@router.get("/next")
async def get_next_marathon_time():
    """Ana sayfa geri sayım için."""
    from app.services.marathon_scheduler import get_or_create_next_marathon
    result = await get_or_create_next_marathon()
    # ISO format — frontend timezone'u handle etsin
    return result

@router.get("/lobby/{marathon_id}")
async def get_lobby_status(marathon_id: str, db: AsyncSession = Depends(get_db)):
    """Lobi durumu — tur bilgisi ve katılımcı listesi."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(select(Marathon).where(Marathon.id == marathon_id))
    marathon = result.scalar_one_or_none()
    if not marathon:
        raise HTTPException(status_code=404, detail="Turnuva bulunamadı.")

    parts_result = await db.execute(
        select(MarathonParticipant)
        .options(selectinload(MarathonParticipant.user))
        .where(MarathonParticipant.marathon_id == marathon_id)
        .order_by(MarathonParticipant.status, MarathonParticipant.total_score.desc())
    )
    participants = parts_result.scalars().all()

    return {
        "id": str(marathon.id),
        "status": marathon.status.value,
        "current_round": marathon.current_round,
        "max_participants": marathon.max_participants,
        "participants": [{
            "username": p.user.username if p.user else "?",
            "status": p.status.value,
            "total_score": p.total_score,
            "eliminated_at_round": p.eliminated_at_round,
            "is_bot": p.user.is_bot if p.user else True,
            "xp": p.user.xp if p.user else 0,
            "elo": round(p.user.elo_rating) if p.user else 0,
        } for p in participants]
    }

@router.get("/active")
async def get_active_marathon(db: AsyncSession = Depends(get_db)):
    """Aktif veya bekleyen maratonu döndür."""
    result = await db.execute(
        select(Marathon).where(
            Marathon.status.in_([MarathonStatus.waiting, MarathonStatus.in_progress])
        ).order_by(Marathon.created_at.desc()).limit(1)
    )
    marathon = result.scalar_one_or_none()

    if not marathon:
        return {"marathon": None}

    # Katılımcı sayısı
    count_result = await db.execute(
        select(MarathonParticipant).where(MarathonParticipant.marathon_id == marathon.id)
    )
    participant_count = len(count_result.scalars().all())

    return {
        "marathon": {
            "id": str(marathon.id),
            "status": marathon.status.value,
            "max_participants": marathon.max_participants,
            "current_participants": participant_count,
            "current_round": marathon.current_round,
            "lobby_opens_at": marathon.lobby_opens_at.isoformat() if marathon.lobby_opens_at else None,
        }
    }

@router.post("/create")
async def create_marathon_endpoint(
    max_participants: int = 128,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: Yeni maraton oluştur."""
    marathon = await create_marathon(db, max_participants)
    return {"marathon_id": str(marathon.id), "status": marathon.status.value}

@router.post("/{marathon_id}/join")
async def join_marathon_endpoint(
    marathon_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Maratona katıl."""
    success, message = await join_marathon(db, marathon_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=400, detail=message)
    # Diğer lobi üyelerine sesli katılım bildir
    try:
        from app.websocket.marathon_ws import marathon_manager
        from sqlalchemy import func as _func
        cnt = (await db.execute(select(_func.count(MarathonParticipant.id)).where(
            MarathonParticipant.marathon_id == marathon_id))).scalar()
        await marathon_manager.broadcast(marathon_id, {
            "type": "lobby_join", "username": current_user.username,
            "count": int(cnt or 0), "is_bot": False,
        })
    except Exception:
        pass
    return {"success": True, "message": message}

@router.post("/{marathon_id}/start")
async def start_marathon(
    marathon_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Admin: Maratonu başlat."""
    result = await db.execute(select(Marathon).where(Marathon.id == marathon_id))
    marathon = result.scalar_one_or_none()
    if not marathon:
        raise HTTPException(status_code=404, detail="Turnuva bulunamadı.")
    if marathon.status != MarathonStatus.waiting:
        raise HTTPException(status_code=400, detail="Turnuva zaten başlamış.")

    # Maraton motorunu başlat
    asyncio.ensure_future(run_marathon_engine(marathon_id))
    return {"message": "Turnuva başlatıldı!"}

@router.get("/{marathon_id}/participants")
async def get_participants(
    marathon_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Katılımcı listesi."""
    result = await db.execute(
        select(MarathonParticipant)
        .options(selectinload(MarathonParticipant.user))
        .where(MarathonParticipant.marathon_id == marathon_id)
        .order_by(MarathonParticipant.total_score.desc())
    )
    participants = result.scalars().all()

    return {
        "participants": [{
            "username": p.user.username if p.user else "?",
            "status": p.status.value,
            "total_score": p.total_score,
            "eliminated_at_round": p.eliminated_at_round,
            "is_bot": p.user.is_bot if p.user else False,
            "avatar_url": (p.user.avatar_url or "") if p.user else "",
            "elo_rating": round(p.user.elo_rating or 1200) if p.user else 1200,
        } for p in participants]
    }

@router.get("/{marathon_id}/bracket")
async def get_bracket(marathon_id: str, db: AsyncSession = Depends(get_db)):
    """Sabit eleme şeması — tüm turların maçları (bilinenler + boş slotlar frontend'de)."""
    import math
    from app.models.marathon import MarathonMatch

    m = await db.get(Marathon, marathon_id)
    if not m:
        raise HTTPException(status_code=404, detail="Turnuva bulunamadı.")

    # Katılımcı bilgisi (user_id -> bilgi)
    prs = (await db.execute(
        select(MarathonParticipant).options(selectinload(MarathonParticipant.user))
        .where(MarathonParticipant.marathon_id == marathon_id)
    )).scalars().all()
    pinfo = {}
    for p in prs:
        pinfo[str(p.user_id)] = {
            "username": p.user.username if p.user else "?",
            "avatar_url": (p.user.avatar_url or "") if p.user else "",
            "is_bot": p.user.is_bot if p.user else False,
            "seed": p.seed,
            "status": p.status.value,
            "eliminated_at_round": p.eliminated_at_round,
        }

    matches = (await db.execute(
        select(MarathonMatch).where(MarathonMatch.marathon_id == marathon_id)
        .order_by(MarathonMatch.round_number, MarathonMatch.bracket_index)
    )).scalars().all()

    # Bracket boyutu: 1. tur maç sayısı*2, yoksa max_participants
    r1 = [mm for mm in matches if mm.round_number == 1]
    size = (len(r1) * 2) if r1 else (m.max_participants or 32)
    rounds_total = max(1, int(math.log2(size))) if size >= 2 else 1

    def _player(uid):
        if not uid:
            return None
        info = pinfo.get(str(uid))
        if not info:
            return {"username": "?", "avatar_url": "", "is_bot": False, "seed": None}
        return {"username": info["username"], "avatar_url": info["avatar_url"], "is_bot": info["is_bot"], "seed": info["seed"]}

    out = []
    for mm in matches:
        winner_username = pinfo.get(str(mm.winner_id), {}).get("username") if mm.winner_id else None
        out.append({
            "round": mm.round_number,
            "index": mm.bracket_index if mm.bracket_index is not None else 0,
            "p1": _player(mm.player1_id),
            "p2": _player(mm.player2_id),
            "winner_username": winner_username,
            "status": mm.status,
        })

    champion = None
    if m.status == MarathonStatus.finished:
        champ = next((p for p in prs if p.status == MarathonParticipantStatus.champion), None)
        if champ and champ.user:
            champion = champ.user.username

    return {
        "size": size,
        "rounds_total": rounds_total,
        "status": m.status.value,
        "current_round": m.current_round,
        "champion": champion,
        "matches": out,
    }


@router.websocket("/{marathon_id}/ws")
async def marathon_websocket(
    websocket: WebSocket,
    marathon_id: str,
    token: str = Query(...),
):
    print(f"[WS CONNECT] Marathon:{marathon_id[:8]} Token:{token[:20]}")
    await handle_marathon_ws(websocket, marathon_id, token)


@router.get("/champions")
async def get_recent_champions(limit: int = 5, db: AsyncSession = Depends(get_db)):
    """Son bitmiş maratonların şampiyonları + genel istatistik."""
    from sqlalchemy import text as _t

    # Son şampiyonlar
    rows = (await db.execute(_t("""
        SELECT u.username, m.finished_at, m.max_participants
        FROM marathon_participants mp
        JOIN marathons m ON m.id = mp.marathon_id
        JOIN users u ON u.id = mp.user_id
        WHERE mp.status = 'champion' AND m.status = 'finished'
        ORDER BY m.finished_at DESC
        LIMIT :lim
    """), {"lim": limit})).fetchall()

    champions = [{
        "username": r[0],
        "date": r[1].strftime("%d.%m.%Y") if r[1] else "",
        "participants": r[2],
    } for r in rows]

    # Genel istatistik
    stats_row = (await db.execute(_t("""
        SELECT COUNT(*) AS total,
               COALESCE(AVG(max_participants), 0) AS avg_p
        FROM marathons WHERE status = 'finished'
    """))).fetchone()

    total_marathons = stats_row[0] if stats_row else 0
    avg_participants = round(float(stats_row[1])) if stats_row and stats_row[1] else 0

    return {
        "champions": champions,
        "stats": {
            "total_marathons": total_marathons,
            "avg_participants": avg_participants,
        },
    }
