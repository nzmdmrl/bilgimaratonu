from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
import csv
import io

from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.question import Question, Category, DifficultyLevel, QuestionType
from app.models.user import User

router = APIRouter(prefix="/api/questions", tags=["questions"])

class QuestionResponse(BaseModel):
    id: str
    category_name: str
    difficulty: str
    question_type: str
    text: str
    option_a: str
    option_b: str
    option_c: Optional[str]
    option_d: Optional[str]
    correct_answer: str

DIFFICULTY_MAP = {
    "kolay": DifficultyLevel.easy,
    "orta": DifficultyLevel.medium,
    "zor": DifficultyLevel.hard,
    "cok_zor": DifficultyLevel.very_hard,
}

TYPE_MAP = {
    "coktan_secmeli": QuestionType.multiple_choice,
    
}

@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Sadece CSV dosyası kabul edilir.")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    # Tüm kategorileri çek
    result = await db.execute(select(Category))
    categories = {c.name.lower(): c for c in result.scalars().all()}

    imported = 0
    errors = []

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

            question = Question(
                category_id=category.id,
                difficulty=difficulty,
                question_type=q_type,
                text=row.get("soru_metni", "").strip(),
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
    return {
        "imported": imported,
        "errors": errors,
        "total_errors": len(errors)
    }

@router.get("/random")
async def get_random_questions(
    category_slug: Optional[str] = None,
    difficulty: Optional[str] = None,
    count: int = 3,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func
    
    query = select(Question).where(
        Question.is_active == True,
        Question.deleted_at == None,
        Question.is_approved == True,
    )
    
    if category_slug:
        result = await db.execute(select(Category).where(Category.slug == category_slug))
        category = result.scalar_one_or_none()
        if category:
            query = query.where(Question.category_id == category.id)
    
    if difficulty and difficulty in DIFFICULTY_MAP:
        query = query.where(Question.difficulty == DIFFICULTY_MAP[difficulty])
    
    query = query.order_by(func.random()).limit(count)
    result = await db.execute(query)
    questions = result.scalars().all()
    
    return [
        {
            "id": str(q.id),
            "text": q.text,
            "difficulty": q.difficulty.value,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_answer": q.correct_answer,
            "question_type": q.question_type.value,
        }
        for q in questions
    ]
