import asyncio
import random
import sys
sys.path.insert(0, '.')

from app.core.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.user import User
from app.services.bot import generate_bot_name
from sqlalchemy import select

ELO_DISTRIBUTION = [
    (800,  900,  50),
    (900,  1000, 100),
    (1000, 1100, 150),
    (1100, 1200, 100),
    (1200, 1300, 60),
    (1300, 1400, 25),
    (1400, 1600, 10),
    (1600, 1800, 5),
]

async def create_bots():
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.is_bot == True))
        existing = len(result.scalars().all())
        print(f"Mevcut bot sayısı: {existing}")
        if existing >= 500:
            print("Yeterli bot var.")
            return

        created = 0
        used_names = set()

        for elo_min, elo_max, count in ELO_DISTRIBUTION:
            print(f"ELO {elo_min}-{elo_max}: {count} bot oluşturuluyor...")
            for i in range(count):
                name = generate_bot_name()
                while name in used_names:
                    name = generate_bot_name()
                used_names.add(name)

                elo = round(random.uniform(elo_min, elo_max), 2)
                bot = User(
                    username=name,
                    email=f"bot_{created}_{random.randint(1000,9999)}@bot.internal",
                    hashed_password=get_password_hash("bot_secret"),
                    is_bot=True,
                    is_active=True,
                    is_verified=True,
                    elo_rating=elo,
                    xp=int((elo - 800) * 10),
                    trust_level=1,
                )
                db.add(bot)
                created += 1

                # Her 50 botta commit
                if created % 50 == 0:
                    await db.commit()
                    print(f"  {created} bot kaydedildi...")

        await db.commit()
        print(f"Toplam {created} bot oluşturuldu!")

asyncio.run(create_bots())
