"""
İçerik Moderasyonu — OpenAI GPT-3.5-turbo ile.
"""
import httpx
from app.core.database import AsyncSessionLocal
from app.services.settings import get_settings

async def get_openai_key() -> str:
    async with AsyncSessionLocal() as db:
        api_keys = await get_settings(db, "api_keys")
        return api_keys.get("openai", "")

async def check_content(text: str, content_type: str = "test") -> dict:
    api_key = await get_openai_key()
    if not api_key:
        return {"safe": True, "reason": "API key ayarlanmamış"}

    if content_type == "test":
        system = "Sen bir içerik moderatörüsün. Türkçe ve İngilizce içerikleri kontrol edersin."
        prompt = f"""Aşağıdaki test başlığı/açıklamasını kontrol et. Küfür, hakaret, cinsel içerik, uyuşturucu, şiddet, ırkçılık, nefret söylemi veya spam/reklam içeriği var mı?

Metin: {text}

Sadece JSON ile cevap ver, başka hiçbir şey yazma:
{{"safe": true}} veya {{"safe": false, "reason": "neden"}}"""
    else:
        system = "Sen bir kullanıcı adı moderatörüsün."
        prompt = f"""Aşağıdaki kullanıcı adını kontrol et. Küfür, hakaret veya uygunsuz ifade var mı?

Kullanıcı adı: {text}

Sadece JSON ile cevap ver:
{{"safe": true}} veya {{"safe": false, "reason": "neden"}}"""

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-3.5-turbo",
                    "max_tokens": 50,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                },
            )
            if r.status_code == 200:
                data = r.json()
                text_response = data["choices"][0]["message"]["content"].strip()
                import json
                result = json.loads(text_response)
                return result
            else:
                print(f"[Moderation] OpenAI hata: {r.status_code}")
    except Exception as e:
        print(f"[Moderation] Hata: {e}")

    return {"safe": True, "reason": "Kontrol yapılamadı"}

async def moderate_event(title: str, description: str = "") -> dict:
    text = f"Başlık: {title}"
    if description:
        text += f"\nAçıklama: {description}"
    return await check_content(text, "test")

async def moderate_username(username: str) -> dict:
    return await check_content(username, "username")
