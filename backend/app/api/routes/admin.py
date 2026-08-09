from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional, List
from pydantic import BaseModel
import csv, io

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.user import User, UserRole
from app.models.question import Question, Category, DifficultyLevel, QuestionType
from app.models.match import Match, MatchStatus

router = APIRouter(prefix="/api/admin", tags=["admin"])

DIFFICULTY_MAP = {
    "kolay": DifficultyLevel.easy,
    "orta": DifficultyLevel.medium,
    "zor": DifficultyLevel.hard,
    "cok_zor": DifficultyLevel.very_hard,
}

TYPE_MAP = {
    "coktan_secmeli": QuestionType.multiple_choice,
    
}

# ===================== DASHBOARD =====================
@router.get("/dashboard")
async def dashboard(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    user_count = await db.execute(select(func.count(User.id)).where(User.deleted_at == None))
    question_count = await db.execute(select(func.count(Question.id)).where(Question.is_active == True))
    match_count = await db.execute(select(func.count(Match.id)).where(Match.status == MatchStatus.finished))

    return {
        "users": user_count.scalar(),
        "questions": question_count.scalar(),
        "matches": match_count.scalar(),
    }


def _period_bounds(period: str):
    """(start_utc, end_utc) aware — TR (UTC+3) gün sınırlarına göre."""
    from datetime import datetime, timedelta, timezone
    now_utc = datetime.now(timezone.utc)
    tr_now = now_utc + timedelta(hours=3)
    tr_today = tr_now.date()

    def tr_midnight_utc(d):
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) - timedelta(hours=3)

    if period == "today":
        return tr_midnight_utc(tr_today), now_utc
    if period == "yesterday":
        y = tr_today - timedelta(days=1)
        return tr_midnight_utc(y), tr_midnight_utc(tr_today)
    if period == "week":
        monday = tr_today - timedelta(days=tr_today.weekday())
        return tr_midnight_utc(monday), now_utc
    if period == "month":
        first = tr_today.replace(day=1)
        return tr_midnight_utc(first), now_utc
    # default today
    return tr_midnight_utc(tr_today), now_utc


@router.get("/stats")
async def admin_stats(
    period: str = Query("anlik"),  # anlik | today | yesterday | week | month
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    from sqlalchemy import text as _t
    from datetime import datetime, timedelta, timezone

    # ── Anlık ──
    now_utc = datetime.now(timezone.utc)
    online_cutoff = now_utc - timedelta(minutes=2)
    online = (await db.execute(_t(
        "SELECT COUNT(*) FROM users WHERE is_bot=false AND deleted_at IS NULL AND last_seen_at >= :c"
    ), {"c": online_cutoff})).scalar() or 0

    active = (await db.execute(_t("""
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE u1.is_bot=false AND u2.is_bot=false) AS hh,
          COUNT(*) FILTER (WHERE (u1.is_bot=false AND u2.is_bot=true) OR (u1.is_bot=true AND u2.is_bot=false)) AS hb,
          COUNT(*) FILTER (WHERE u1.is_bot=true AND u2.is_bot=true) AS bb
        FROM matches m
        JOIN users u1 ON u1.id = m.player1_id
        JOIN users u2 ON u2.id = m.player2_id
        WHERE m.status='in_progress'
    """))).mappings().first()

    active_players = (await db.execute(_t("""
        SELECT COUNT(DISTINCT t.uid) FROM (
          SELECT player1_id AS uid FROM matches WHERE status='in_progress'
          UNION SELECT player2_id FROM matches WHERE status='in_progress'
        ) t JOIN users u ON u.id = t.uid WHERE u.is_bot=false
    """))).scalar() or 0

    realtime = {
        "online": int(online),
        "active_matches": {
            "total": int(active["total"] or 0),
            "hh": int(active["hh"] or 0),
            "hb": int(active["hb"] or 0),
            "bb": int(active["bb"] or 0),
        },
        "active_players": int(active_players),
    }

    if period == "anlik":
        return {"period": period, "realtime": realtime, "aggregate": None}

    # ── Dönem (bugün/dün/hafta/ay) ──
    start, end = _period_bounds(period)
    p = {"s": start, "e": end}

    matches = (await db.execute(_t("""
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE u1.is_bot=false AND u2.is_bot=false) AS hh,
          COUNT(*) FILTER (WHERE (u1.is_bot=false AND u2.is_bot=true) OR (u1.is_bot=true AND u2.is_bot=false)) AS hb,
          COUNT(*) FILTER (WHERE u1.is_bot=true AND u2.is_bot=true) AS bb
        FROM matches m
        JOIN users u1 ON u1.id = m.player1_id
        JOIN users u2 ON u2.id = m.player2_id
        WHERE m.status='finished' AND m.finished_at >= :s AND m.finished_at < :e
    """), p)).mappings().first()

    maraton = (await db.execute(_t("""
        SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS levels
        FROM solo_progress WHERE updated_at >= :s AND updated_at < :e
    """), p)).mappings().first()

    turnuva_humans = (await db.execute(_t("""
        SELECT COUNT(DISTINCT mp.user_id)
        FROM marathon_participants mp JOIN users u ON u.id = mp.user_id
        WHERE u.is_bot=false AND mp.joined_at >= :s AND mp.joined_at < :e
    """), p)).scalar() or 0

    tests = (await db.execute(_t("""
        SELECT
          COUNT(*) FILTER (WHERE finished_at IS NOT NULL) AS solves,
          COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL AND finished_at IS NOT NULL) AS solvers
        FROM event_participants WHERE finished_at >= :s AND finished_at < :e
    """), p)).mappings().first()

    new_users = (await db.execute(_t(
        "SELECT COUNT(*) FROM users WHERE is_bot=false AND deleted_at IS NULL AND created_at >= :s AND created_at < :e"
    ), p)).scalar() or 0

    aggregate = {
        "matches": {
            "total": int(matches["total"] or 0),
            "hh": int(matches["hh"] or 0),
            "hb": int(matches["hb"] or 0),
            "bb": int(matches["bb"] or 0),
        },
        "maraton": {"users": int(maraton["users"] or 0), "levels": int(maraton["levels"] or 0)},
        "turnuva": {"human_participants": int(turnuva_humans)},
        "tests": {"solves": int(tests["solves"] or 0), "solvers": int(tests["solvers"] or 0)},
        "new_users": int(new_users),
    }
    return {"period": period, "realtime": realtime, "aggregate": aggregate}

# ===================== KULLANICI YÖNETİMİ =====================
@router.get("/users")
async def list_users(
    page: int = 1,
    limit: int = 20,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    query = select(User).where(User.deleted_at == None)
    if search:
        query = query.where(User.username.ilike(f"%{search}%"))
    query = query.order_by(User.created_at.desc()).offset((page-1)*limit).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    count_q = select(func.count(User.id)).where(User.deleted_at == None)
    if search:
        count_q = count_q.where(User.username.ilike(f"%{search}%"))
    total = (await db.execute(count_q)).scalar()

    return {
        "users": [{
            "id": str(u.id),
            "username": u.username,
            "email": u.email,
            "role": u.role.value,
            "xp": u.xp,
            "elo_rating": round(u.elo_rating),
            "total_matches": u.total_matches,
            "is_active": u.is_active,
            "created_at": u.created_at.strftime("%d.%m.%Y") if u.created_at else "",
        } for u in users],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }

@router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    user.is_active = not user.is_active
    await db.commit()
    return {"is_active": user.is_active}

@router.post("/users/{user_id}/make-admin")
async def make_admin(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    user.role = UserRole.admin
    await db.commit()
    return {"role": user.role.value}

# ===================== SORU YÖNETİMİ =====================
@router.get("/questions")
async def list_questions(
    page: int = 1,
    limit: int = 20,
    category_slug: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    cat = None
    if category_slug:
        cat_r = await db.execute(select(Category).where(Category.slug == category_slug))
        cat = cat_r.scalar_one_or_none()

    query = select(Question, Category.name.label("category_name")).join(
        Category, Category.id == Question.category_id
    ).where(Question.deleted_at == None)
    count_q = select(func.count(Question.id)).where(Question.deleted_at == None)

    if cat:
        query = query.where(Question.category_id == cat.id)
        count_q = count_q.where(Question.category_id == cat.id)
    if difficulty and difficulty in DIFFICULTY_MAP:
        query = query.where(Question.difficulty == DIFFICULTY_MAP[difficulty])
        count_q = count_q.where(Question.difficulty == DIFFICULTY_MAP[difficulty])
    if search:
        query = query.where(Question.text.ilike(f"%{search}%"))
        count_q = count_q.where(Question.text.ilike(f"%{search}%"))

    total = (await db.execute(count_q)).scalar()

    query = query.order_by(Question.created_at.desc()).offset((page-1)*limit).limit(limit)
    result = await db.execute(query)
    rows = result.fetchall()

    diff_labels = {"easy": "Kolay", "medium": "Orta", "hard": "Zor", "very_hard": "Çok Zor"}

    return {
        "questions": [{
            "id": str(r.Question.id),
            "text": r.Question.text[:80] + "..." if len(r.Question.text) > 80 else r.Question.text,
            "category": r.category_name,
            "difficulty": diff_labels.get(r.Question.difficulty.value, r.Question.difficulty.value),
            "correct_answer": r.Question.correct_answer,
            "is_active": r.Question.is_active,
            "option_a": r.Question.option_a,
            "option_b": r.Question.option_b,
            "option_c": r.Question.option_c,
            "option_d": r.Question.option_d,
        } for r in rows],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }

@router.get("/questions/category-counts")
async def question_category_counts(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """Her kategoride kaç aktif-olmayan-dahil soru var (silinmemiş)."""
    from sqlalchemy import text as _t
    rows = (await db.execute(_t("""
        SELECT c.slug, c.name,
               COUNT(q.id) AS cnt,
               COUNT(q.id) FILTER (WHERE q.is_active) AS active_cnt
        FROM categories c
        LEFT JOIN questions q ON q.category_id = c.id AND q.deleted_at IS NULL
        WHERE c.is_active = true
        GROUP BY c.slug, c.name
        ORDER BY c.name
    """))).mappings().all()
    total = sum(int(r["cnt"]) for r in rows)
    return {
        "total": total,
        "categories": [
            {"slug": r["slug"], "name": r["name"], "count": int(r["cnt"]), "active": int(r["active_cnt"] or 0)}
            for r in rows
        ],
    }


@router.post("/questions/{question_id}/toggle-active")
async def toggle_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(Question).where(Question.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Soru bulunamadı.")
    q.is_active = not q.is_active
    await db.commit()
    return {"is_active": q.is_active}

@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    from datetime import datetime
    result = await db.execute(select(Question).where(Question.id == question_id))
    q = result.scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Soru bulunamadı.")
    q.deleted_at = datetime.utcnow()
    await db.commit()
    return {"deleted": True}

@router.post("/questions/import-csv")
async def import_questions_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Sadece CSV dosyası kabul edilir.")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    cats_result = await db.execute(select(Category))
    categories = {c.name.lower(): c for c in cats_result.scalars().all()}

    imported, errors = 0, []

    for i, row in enumerate(reader, start=2):
        try:
            cat_name = row.get("kategori", "").strip().lower()
            category = categories.get(cat_name)
            if not category:
                errors.append(f"Satır {i}: '{cat_name}' kategorisi bulunamadı.")
                continue

            difficulty_key = row.get("zorluk", "").strip().lower()
            difficulty = DIFFICULTY_MAP.get(difficulty_key)
            if not difficulty:
                errors.append(f"Satır {i}: Geçersiz zorluk '{difficulty_key}'.")
                continue

            type_key = row.get("soru_tipi", "").strip().lower()
            q_type = TYPE_MAP.get(type_key)
            if not q_type:
                errors.append(f"Satır {i}: Geçersiz soru tipi '{type_key}'.")
                continue

            correct = row.get("dogru_cevap", "").strip().upper()
            if correct not in ["A", "B", "C", "D"]:
                errors.append(f"Satır {i}: Geçersiz doğru cevap '{correct}'.")
                continue

            text_val = row.get("soru_metni", "").strip()
            if not text_val:
                errors.append(f"Satır {i}: Soru metni boş.")
                continue

            question = Question(
                category_id=category.id,
                difficulty=difficulty,
                question_type=q_type,
                text=text_val,
                option_a=row.get("sik_a", "").strip(),
                option_b=row.get("sik_b", "").strip(),
                option_c=row.get("sik_c", "").strip() or None,
                option_d=row.get("sik_d", "").strip() or None,
                correct_answer=correct,
                explanation=row.get("aciklama", "").strip() or None,
            )
            db.add(question)
            imported += 1
        except Exception as e:
            errors.append(f"Satır {i}: {str(e)}")

    await db.commit()
    return {"imported": imported, "errors": errors, "total_errors": len(errors)}

# ===================== KATEGORİ YÖNETİMİ =====================
@router.get("/categories")
async def list_categories(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(Category).order_by(Category.display_order))
    categories = result.scalars().all()

    cat_list = []
    for c in categories:
        count = (await db.execute(
            select(func.count(Question.id)).where(
                Question.category_id == c.id,
                Question.is_active == True,
                Question.deleted_at == None
            )
        )).scalar()
        cat_list.append({
            "id": str(c.id),
            "name": c.name,
            "slug": c.slug,
            "icon": c.icon,
            "is_active": c.is_active,
            "question_count": count,
            "display_order": c.display_order,
        })

    return {"categories": cat_list}

@router.post("/categories/{category_id}/toggle-active")
async def toggle_category(
    category_id: str,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    result = await db.execute(select(Category).where(Category.id == category_id))
    cat = result.scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")
    cat.is_active = not cat.is_active
    await db.commit()
    return {"is_active": cat.is_active}

# ── Sıfırlama Endpoint'leri ──────────────────────────────────────────────────

@router.post("/reset/stats")
async def reset_stats(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    from sqlalchemy import text
    await db.execute(text("DELETE FROM match_answers"))
    await db.execute(text("DELETE FROM daily_scores"))
    await db.execute(text("DELETE FROM league_entries"))
    await db.execute(text("DELETE FROM matches"))
    await db.execute(text("DELETE FROM achievements"))
    await db.execute(text("DELETE FROM user_badges"))
    await db.execute(text("DELETE FROM user_purchases"))
    await db.execute(text("DELETE FROM user_shop_settings"))
    await db.execute(text("UPDATE users SET is_bot=false WHERE is_bot IS NULL"))
    await db.execute(text("UPDATE users SET xp=0, elo_rating=1000, total_matches=0, total_wins=0, total_losses=0 WHERE is_bot=false"))
    await db.commit()
    return {"ok": True}

@router.post("/reset/achievements")
async def reset_achievements(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    """Kupa, madalya ve rozetleri sifirla (istatistikler korunur)."""
    await db.execute(text("DELETE FROM achievements"))
    await db.execute(text("DELETE FROM user_badges"))
    await db.commit()
    return {"message": "Kupa, madalya ve rozetler sifirlandi."}


@router.post("/reset/marathon")
async def reset_marathon(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    from sqlalchemy import text
    await db.execute(text("UPDATE marathons SET status='finished' WHERE status IN ('waiting','active','lobby')"))
    await db.commit()
    return {"ok": True}

@router.post("/reset/tests")
async def reset_tests(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    from sqlalchemy import text
    await db.execute(text("DELETE FROM event_answers"))
    await db.execute(text("DELETE FROM event_questions"))
    await db.execute(text("DELETE FROM event_participants"))
    await db.execute(text("DELETE FROM events"))
    await db.commit()
    return {"ok": True}

@router.post("/reset/questions")
async def reset_questions(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    from sqlalchemy import text
    await db.execute(text("DELETE FROM event_answers"))
    await db.execute(text("DELETE FROM event_questions"))
    await db.execute(text("DELETE FROM match_answers"))
    await db.execute(text("DELETE FROM questions"))
    await db.commit()
    return {"ok": True}

# ── Bot Yönetimi ──────────────────────────────────────────────────────────────

from pydantic import BaseModel as _BM

class BotCreateRequest(_BM):
    language: str = "turkish"
    count: int = 10

BOT_NAMES = {
    "turkish": ["Ahmet","Mehmet","Mustafa","Ali","Hasan","Hüseyin","İbrahim","Yusuf","Ömer","Fatih","Emre","Burak","Can","Cem","Deniz","Eren","Furkan","Gökhan","Haluk","Kemal","Levent","Mert","Okan","Selim","Tarık","Uğur","Volkan","Yiğit","Zeynep","Ayşe","Elif","Emine","Fatma","Gül","Hatice","İlknur","Kübra","Lale","Merve","Nalan","Özlem","Pınar","Rabia","Seda","Tuba","Ümit","Vildan","Yasemin","Zehra","Aslı"],
    "english": ["James","John","Robert","Michael","William","David","Richard","Joseph","Thomas","Charles","Mary","Patricia","Jennifer","Linda","Barbara","Elizabeth","Susan","Jessica","Sarah","Karen","Daniel","Matthew","Anthony","Mark","Donald","Steven","Paul","Andrew","Joshua","Kenneth"],
    "spanish": ["Miguel","José","Francisco","Juan","Antonio","Manuel","Luis","Carlos","Pablo","Jorge","María","Ana","Carmen","Laura","Isabel","Sofía","Lucía","Paula","Elena","Sara","Alejandro","Diego","Fernando","Ricardo","Sergio","Andrés","Roberto","Pedro","Rafael","Javier"],
    "french": ["Jean","Pierre","Michel","André","Philippe","Louis","François","Jacques","Henri","Paul","Marie","Isabelle","Sophie","Claire","Camille","Emma","Lucie","Chloé","Léa","Julie","Thomas","Nicolas","Antoine","Guillaume","Julien","Mathieu","Sébastien","Romain","Maxime","Quentin"],
    "german": ["Hans","Klaus","Dieter","Wolfgang","Helmut","Friedrich","Karl","Werner","Gerhard","Peter","Maria","Anna","Ursula","Helga","Ingrid","Renate","Monika","Petra","Sabine","Brigitte","Thomas","Michael","Andreas","Stefan","Markus","Christian","Jürgen","Frank","Walter","Ralf"],
}

@router.post("/bots/create")
async def create_bots(req: BotCreateRequest, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    
    import random, uuid
    from sqlalchemy import text
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"])
    
    names = BOT_NAMES.get(req.language, BOT_NAMES["turkish"])
    lang_suffix = {"turkish": "TR", "english": "EN", "spanish": "ES", "french": "FR", "german": "DE"}.get(req.language, "BOT")
    
    # ELO dağılımı: 500'den 2000'e kadar eşit aralıklı
    elo_range = list(range(500, 2001, max(1, (2000-500)//req.count)))[:req.count]
    
    added = 0
    for i, elo in enumerate(elo_range):
        name = random.choice(names)
        username = f"{name}{lang_suffix}{random.randint(10,99)}"
        email = f"bot_{uuid.uuid4().hex[:8]}@bot.bilgimaratonu.com"
        hashed = pwd.hash(uuid.uuid4().hex)
        
        try:
            await db.execute(text("""
                INSERT INTO users (id, username, email, hashed_password, is_bot, elo_rating, xp, role, is_active, is_verified, trust_level, total_matches, total_wins, total_losses, avatar_url)
                VALUES (:id, :username, :email, :pwd, true, :elo, 0, 'user', true, true, 0, 0, 0, 0, :avatar)
            """), {
                "id": str(uuid.uuid4()), "username": username, "email": email,
                "pwd": hashed, "elo": float(elo),
                "avatar": f"https://api.dicebear.com/9.x/thumbs/svg?seed={username}",
            })
            added += 1
        except Exception as e:
            print(f"Bot eklenemedi: {e}")
    
    await db.commit()
    return {"ok": True, "added": added}

@router.delete("/bots/all")
async def delete_all_bots(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    from sqlalchemy import text
    await db.execute(text("DELETE FROM match_answers WHERE match_id IN (SELECT id FROM matches WHERE player2_id IN (SELECT id FROM users WHERE is_bot=true))"))
    await db.execute(text("DELETE FROM daily_scores WHERE user_id IN (SELECT id FROM users WHERE is_bot=true)"))
    await db.execute(text("DELETE FROM matches WHERE player1_id IN (SELECT id FROM users WHERE is_bot=true) OR player2_id IN (SELECT id FROM users WHERE is_bot=true)"))
    r = await db.execute(text("DELETE FROM users WHERE is_bot=true"))
    await db.commit()
    return {"ok": True, "deleted": r.rowcount}

@router.post("/kalabalik/reset-bot-leagues")
async def kalabalik_reset_bot_leagues(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    """Kalabalık: liglerdeki bot sıralamalarını sıfırla."""
    from app.services.kalabalik import reset_bot_leagues
    await reset_bot_leagues(db)
    return {"ok": True}

@router.get("/bots/count")
async def bot_count(db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)
    from sqlalchemy import text
    r = await db.execute(text("SELECT COUNT(*) FROM users WHERE is_bot=true"))
    return {"count": r.scalar()}

# ── Kategori Aktif/Pasif ──────────────────────────────────────────────────────

CAT_BADGE_MAP = {
    "Tarih": "cat_tarih",
    "Coğrafya": "cat_cografya",
    "Spor": "cat_spor",
    "Sanat & Edebiyat": "cat_sanat",
    "Genel Kültür": "cat_genel",
    "Yiyecek & İçecek": "cat_yiyecek",
    "Yaşam & Sağlık": "cat_yasam",
    "Bilim": "cat_bilim",
    "Matematik": "cat_matematik",
    "Müzik": "cat_muzik",
    "Sinema & Dizi": "cat_sinema",
    "Zeka & Mantık": "cat_zeka",
}

@router.patch("/categories/{category_id}/toggle")
async def toggle_category(category_id: str, db: AsyncSession = Depends(get_db), current_user = Depends(get_current_admin)):
    from sqlalchemy import text
    # Kategoriyi bul
    r = await db.execute(text("SELECT name, is_active FROM categories WHERE id = :id"), {"id": category_id})
    cat = r.mappings().fetchone()
    if not cat:
        raise HTTPException(status_code=404)
    
    new_active = not cat["is_active"]
    await db.execute(text("UPDATE categories SET is_active = :a WHERE id = :id"), {"a": new_active, "id": category_id})
    
    # İlgili rozeti de güncelle
    badge_code = CAT_BADGE_MAP.get(cat["name"])
    if badge_code:
        await db.execute(text("UPDATE badges SET is_active = :a WHERE code = :code"), {"a": new_active, "code": badge_code})
    
    await db.commit()
    return {"ok": True, "is_active": new_active}


# ===================== ÜYE VERİLERİNİ SIFIRLAMA (TEHLİKELİ) =====================
@router.post("/reset-user-data")
async def reset_user_data(
    confirm: str = Query(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """
    TÜM üye kazanımlarını sıfırlar: maçlar, turnuvalar, lig, başarılar/kupa/madalya,
    rozetler, solo ilerleme, bildirimler, etkinlik katılımları ve XP/ELO/maç sayaçları.

    KORUNUR: üyelik hesapları (kullanıcı adı/şifre/rol/avatar), site ayarları,
    sorular/kategoriler, rozet kataloğu, blog/sayfalar, etkinlik & soru tanımları, ARKADAŞLIKLAR.
    BOTLAR: ELO korunur, sadece maç sayaçları/XP sıfırlanır.

    Geri ALINAMAZ. Onay: confirm=HERSEYI-SIFIRLA
    """
    from sqlalchemy import text
    if confirm != "HERSEYI-SIFIRLA":
        raise HTTPException(status_code=400, detail="Onay hatalı. confirm=HERSEYI-SIFIRLA gönderilmeli.")

    summary = {}
    # Çocuk tablolar önce silinir (FK sırası). Her biri SAVEPOINT içinde —
    # bir tablo yoksa/hata verirse yalnızca o atlanır, transaction bozulmaz.
    delete_order = [
        "match_answers", "matches",
        "marathon_matches", "marathon_participants", "marathons",
        "event_answers", "event_participants",
        "daily_scores", "league_entries",
        "achievements", "user_badges",
        "solo_progress", "notifications",
    ]
    for tbl in delete_order:
        try:
            async with db.begin_nested():
                res = await db.execute(text(f"DELETE FROM {tbl}"))
                summary[tbl] = res.rowcount
        except Exception as e:
            summary[tbl] = f"ATLANDI ({type(e).__name__})"

    # Gerçek üyeler: XP/ELO/maç sayaçları varsayılana
    try:
        async with db.begin_nested():
            r1 = await db.execute(text(
                "UPDATE users SET xp = 0, elo_rating = 1000, total_matches = 0, total_wins = 0, total_losses = 0 "
                "WHERE is_bot = false"))
            summary["users_reset"] = r1.rowcount
    except Exception as e:
        summary["users_reset"] = f"ATLANDI ({type(e).__name__})"
    # Botlar: ELO KORUNUR, sadece maç sayaçları + XP sıfır
    try:
        async with db.begin_nested():
            r2 = await db.execute(text(
                "UPDATE users SET xp = 0, total_matches = 0, total_wins = 0, total_losses = 0 "
                "WHERE is_bot = true"))
            summary["bots_reset"] = r2.rowcount
    except Exception as e:
        summary["bots_reset"] = f"ATLANDI ({type(e).__name__})"

    await db.commit()
    print(f"[RESET] Üye verileri sıfırlandı (admin: {admin.username}) → {summary}")
    return {"ok": True, "summary": summary}
