"""
Soru Import Sistemi — ehliyetsinavihazirlik.com için özelleştirilmiş parser.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.question import Question, Category
import httpx, os, uuid, hashlib, re
from typing import Optional

router = APIRouter(prefix="/api/import", tags=["import"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "../../../uploads/questions")
os.makedirs(UPLOAD_DIR, exist_ok=True)

def content_hash(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest()

async def download_image(url: str, session: httpx.AsyncClient) -> Optional[str]:
    try:
        r = await session.get(url, timeout=10)
        if r.status_code == 200:
            ext = url.split(".")[-1].split("?")[0][:4] or "jpg"
            filename = f"{uuid.uuid4().hex}.{ext}"
            filepath = os.path.join(UPLOAD_DIR, filename)
            with open(filepath, "wb") as f:
                f.write(r.content)
            return f"/uploads/questions/{filename}"
    except Exception as e:
        print(f"[IMPORT] Resim indirme hatası: {e}")
    return None

class ImportRequest(BaseModel):
    url: str
    category_id: str
    difficulty: str = "medium"
    skip_images: bool = True

@router.post("/url")
async def import_from_url(
    req: ImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Yetkisiz.")

    from bs4 import BeautifulSoup
    import random

    cat_res = await db.execute(select(Category).where(Category.id == req.category_id))
    category = cat_res.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Kategori bulunamadı.")

    imported = 0
    skipped = 0
    errors = 0

    async with httpx.AsyncClient(
        headers={"User-Agent": "Mozilla/5.0"},
        follow_redirects=True,
        timeout=30,
    ) as session:
        # GET — form verilerini al
        r = await session.get(req.url)
        if r.status_code != 200:
            raise HTTPException(status_code=400, detail=f"URL açılamadı: {r.status_code}")

        soup = BeautifulSoup(r.text, "html.parser")
        
        # quiz_id bul
        quiz_id_el = soup.find("input", attrs={"name": "quiz_id"})
        quiz_id = quiz_id_el["value"] if quiz_id_el else ""
        
        # Radio input isimlerini al
        inputs = soup.find_all("input", class_="simplequiz")
        names = list(set(i.get("name") for i in inputs if i.get("name")))
        
        if not names:
            raise HTTPException(status_code=400, detail="Soru bulunamadı.")

        # POST — hepsini A göndererek doğru cevapları al
        data = {"quiz_id": quiz_id, "simplequiz_post": "true"}
        for name in names:
            data[name] = "A"
        
        r2 = await session.post(req.url, data=data)
        soup2 = BeautifulSoup(r2.text, "html.parser")
        
        blocks = soup2.find_all("div", class_="simplequiz_question_result")
        print(f"[IMPORT] {len(blocks)} soru bloğu bulundu")

        for block in blocks:
            try:
                # Soru metni
                q_text_el = block.find("strong")
                q_text = q_text_el.get_text(strip=True) if q_text_el else ""
                
                # Video içeren soruları atla
                if block.find(["video", "iframe"]):
                    skipped += 1
                    continue

                if not q_text:
                    errors += 1
                    continue

                # Duplicate kontrolü
                h = content_hash(q_text)
                existing = await db.execute(select(Question).where(Question.content_hash == h))
                if existing.scalar_one_or_none():
                    skipped += 1
                    continue

                # Soru resmi
                q_img_url = None
                q_img_el = block.find("img", class_=lambda x: x and "sq_" not in str(x))
                if q_img_el and q_img_el.get("src") and "ok.gif" not in q_img_el["src"] and "no.gif" not in q_img_el["src"]:
                    if req.skip_images:
                        skipped += 1
                        continue
                    q_img_url = await download_image(q_img_el["src"], session)

                # Şıkları bul — <p> tagları içinde
                option_ps = block.find_all("p")
                opts = []
                for p in option_ps:
                    txt = p.get_text(strip=True)
                    # "A) ...", "B) ..." formatını temizle
                    txt = re.sub(r'^[ABCD]\)\s*', '', txt).strip()
                    # Soru sayısı ve başlık p'lerini atla
                    if txt and not txt.startswith("Soru") and not txt.startswith("Çözüm"):
                        opts.append(txt)

                if len(opts) < 4:
                    errors += 1
                    continue

                # Doğru cevap
                correct = "A"
                correct_text_el = block.find("span", class_="sq_correct_answer_text")
                if correct_text_el:
                    match = re.search(r'DOĞRU CEVAP:\s*([ABCD])', correct_text_el.get_text())
                    if match:
                        correct = match.group(1)

                # Açıklama
                explanation = ""
                exp_el = block.find("div", class_="question_explanatory_text")
                if exp_el:
                    explanation = exp_el.get_text(strip=True)

                # Zorluk
                if req.difficulty == "random":
                    diff = random.choice(["easy", "medium", "hard"])
                else:
                    diff = req.difficulty

                q = Question(
                    id=str(uuid.uuid4()),
                    category_id=req.category_id,
                    difficulty=diff,
                    question_type="text_text",
                    text=q_text,
                    question_image=q_img_url,
                    option_a=opts[0] if len(opts) > 0 else "",
                    option_b=opts[1] if len(opts) > 1 else "",
                    option_c=opts[2] if len(opts) > 2 else "",
                    option_d=opts[3] if len(opts) > 3 else "",
                    correct_answer=correct,
                    explanation=explanation,
                    content_hash=h,
                    is_active=True,
                    is_approved=True,
                )
                try:
                    db.add(q)
                    await db.flush()
                    imported += 1
                    print(f"[IMPORT] Soru eklendi: {q_text[:50]}")
                except Exception:
                    await db.rollback()
                    skipped += 1
                    continue

            except Exception as e:
                print(f"[IMPORT] Soru hatası: {e}")
                import traceback; traceback.print_exc()
                errors += 1

        try:
            await db.commit()
        except Exception as e:
            await db.rollback()
            print(f"[IMPORT] Commit hatası: {e}")

    return {"imported": imported, "skipped": skipped, "errors": errors}

@router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Category).where(Category.is_active == True))
    cats = result.scalars().all()
    return {"categories": [{"id": str(c.id), "name": c.name} for c in cats]}
