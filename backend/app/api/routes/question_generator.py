from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from pydantic import BaseModel
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.question import Question, Category
import uuid, hashlib, json
from typing import List

router = APIRouter(prefix="/api/generator", tags=["generator"])

def content_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()

class GenerateRequest(BaseModel):
    openai_api_key: str
    category_ids: List[str]
    difficulties: List[str]
    count_per_combo: int = 5
    language: str = "Türkçe"
    country: str = "Türkiye"
    model: str = "gpt-4o-mini"
    delay_seconds: float = 1.0  # İstekler arası bekleme süresi

@router.post("/generate")
async def generate_questions(
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403)

    from openai import OpenAI
    client = OpenAI(api_key=req.openai_api_key)

    # Kategorileri çek
    cat_res = await db.execute(select(Category).where(Category.id.in_(req.category_ids)))
    categories = cat_res.scalars().all()

    total_added = 0
    total_skipped = 0
    errors = []

    for category in categories:
        for difficulty in req.difficulties:
            diff_label = {'easy': 'kolay', 'medium': 'orta', 'hard': 'zor', 'very_hard': 'çok zor'}.get(difficulty, difficulty)
            
            prompt = f"""Sen profesyonel bir Türkçe bilgi yarışması soru yazarısın. 
Görevin: "{category.name}" kategorisinde, {diff_label} zorlukta, {req.count_per_combo} adet yüksek kaliteli çoktan seçmeli soru üretmek.

ZORLUK SEVİYESİ AÇIKLAMASI:
- kolay: Herkesin bildiği temel bilgiler, net ve açık sorular
- orta: Genel kültür sahibi kişilerin %50-60'ının bilebileceği sorular
- zor: Konuyu iyi bilen kişilerin bile tereddüt edeceği sorular, ince detaylar
- çok zor: Uzman düzeyinde bilgi gerektiren, yanıltıcı ve nadir bilgiler

KALİTE KURALLARI:
- Sorular gerçek, doğrulanabilir bilgilere dayanmalı — uydurma bilgi KESİNLİKLE yasak
- Her soru özgün ve farklı konudan olmalı, tekrar yok
- Şıklar mantıklı ve birbirine yakın olmalı — tamamen saçma şıklar yasak
- Doğru cevap kesinlikle doğru olmalı, tartışmalı bilgiler kullanma
- Türkiye'ye özgü kültür, tarih, coğrafya sorularında yerel bilgileri kullan
- Soru metni açık ve anlaşılır olmalı, gereksiz uzun cümleler yasak
- {diff_label} zorluk için uygun kelime seçimi yap

DAĞILIM: correct_answer için A, B, C, D şıklarını eşit dağıt — her biri yaklaşık %25 olmalı.

SADECE geçerli JSON array döndür, başka hiçbir şey yazma:
[
  {{
    "text": "Soru metni burada?",
    "option_a": "1. şık",
    "option_b": "2. şık",
    "option_c": "3. şık",
    "option_d": "4. şık",
    "correct_answer": "C",
    "explanation": "Doğru cevabın kısa açıklaması"
  }}
]"""

            try:
                import time as _time
                response = client.chat.completions.create(
                    model=req.model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.9,
                    max_tokens=3000,
                )
                _time.sleep(req.delay_seconds)
                
                content = response.choices[0].message.content.strip()
                if '```' in content:
                    parts = content.split('```')
                    content = parts[1] if len(parts) > 1 else parts[0]
                    if content.startswith('json'):
                        content = content[4:]
                
                questions = json.loads(content.strip())
                
                added = 0
                for q in questions:
                    h = content_hash(q['text'])
                    existing = await db.execute(select(Question).where(Question.content_hash == h))
                    if existing.scalar_one_or_none():
                        total_skipped += 1
                        continue
                    
                    new_q = Question(
                        id=str(uuid.uuid4()),
                        category_id=str(category.id),
                        difficulty=difficulty,
                        question_type='text_text',
                        text=q['text'],
                        option_a=q.get('option_a',''),
                        option_b=q.get('option_b',''),
                        option_c=q.get('option_c',''),
                        option_d=q.get('option_d',''),
                        correct_answer=q.get('correct_answer','A').upper(),
                        explanation=q.get('explanation', ''),
                        content_hash=h,
                        is_active=True,
                        is_approved=True,
                    )
                    db.add(new_q)
                    added += 1
                
                await db.commit()
                total_added += added
                print(f"[GEN] {category.name}/{difficulty}: {added} soru eklendi")

            except Exception as e:
                errors.append(f"{category.name}/{difficulty}: {str(e)}")
                print(f"[GEN] Hata: {e}")

    return {
        "added": total_added,
        "skipped": total_skipped,
        "errors": errors,
    }

@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.is_active == True).order_by(Category.display_order))
    cats = result.scalars().all()
    return {"categories": [{"id": str(c.id), "name": c.name, "icon": c.icon} for c in cats]}
