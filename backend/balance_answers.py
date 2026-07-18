# YOL: backend/balance_answers.py
import asyncio
import random
from collections import Counter

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.question import Question

LETTERS = ["A", "B", "C", "D"]


async def run():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Question))
        questions = res.scalars().all()

        targets = [LETTERS[i % 4] for i in range(len(questions))]
        random.shuffle(targets)

        updated = 0
        skipped = 0

        for q, target in zip(questions, targets):
            opts = [q.option_a, q.option_b, q.option_c, q.option_d]
            if not all(opts):
                skipped += 1
                continue

            correct_idx = LETTERS.index(q.correct_answer)
            correct_text = opts[correct_idx]
            others = [o for i, o in enumerate(opts) if i != correct_idx]
            random.shuffle(others)

            target_idx = LETTERS.index(target)
            new_opts = others[:target_idx] + [correct_text] + others[target_idx:]

            q.option_a, q.option_b, q.option_c, q.option_d = new_opts
            q.correct_answer = target
            updated += 1

        await db.commit()

        res = await db.execute(select(Question.correct_answer))
        dist = Counter(res.scalars().all())
        print(f"Guncellenen: {updated} | Atlanan: {skipped}")
        print("Yeni dagilim:", dict(sorted(dist.items())))


if __name__ == "__main__":
    asyncio.run(run())
