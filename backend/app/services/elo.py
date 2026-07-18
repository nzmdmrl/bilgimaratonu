def expected_score(rating_a: float, rating_b: float) -> float:
    return 1 / (1 + 10 ** ((rating_b - rating_a) / 400))

def calculate_elo(
    winner_rating: float,
    loser_rating: float,
    k_factor: int = 32
) -> tuple[float, float]:
    expected_winner = expected_score(winner_rating, loser_rating)
    expected_loser = expected_score(loser_rating, winner_rating)
    
    new_winner = winner_rating + k_factor * (1 - expected_winner)
    new_loser = loser_rating + k_factor * (0 - expected_loser)
    
    return round(new_winner, 2), round(new_loser, 2)

POINTS = {
    "easy":      {"correct": 10, "wrong": -3,  "time_limit": 10},
    "medium":    {"correct": 20, "wrong": -5,  "time_limit": 20},
    "hard":      {"correct": 30, "wrong": -8,  "time_limit": 30},
    "very_hard": {"correct": 50, "wrong": -10, "time_limit": 35},
}

def get_points(difficulty: str, is_correct: bool, time_remaining_seconds: float = 0) -> float:
    """
    Puan hesapla. Kalan saniye ondalık olarak eklenir.
    Örnek: 3sn kaldı → +0.03
    """
    config = POINTS.get(difficulty, POINTS["easy"])
    if not is_correct:
        return float(config["wrong"])
    base_points = float(config["correct"])
    # Ondalık precision için Decimal kullan
    from decimal import Decimal, ROUND_HALF_UP
    remaining = Decimal(str(max(0.0, time_remaining_seconds)))
    speed_bonus = (remaining / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    result = Decimal(str(base_points)) + speed_bonus
    return float(result)


def reload_points(config):
    """POINTS tablosunu DB config'i ile gunceller. POINTS mutable oldugu icin tum import'lar otomatik yeni degeri gorur."""
    if not config or not isinstance(config, dict):
        return
    for diff in ("easy", "medium", "hard", "very_hard"):
        c = config.get(diff)
        if isinstance(c, dict):
            if diff not in POINTS:
                POINTS[diff] = {"correct": 10, "wrong": -3, "time_limit": 20}
            for key in ("correct", "wrong", "time_limit"):
                if c.get(key) is not None:
                    POINTS[diff][key] = c[key]
