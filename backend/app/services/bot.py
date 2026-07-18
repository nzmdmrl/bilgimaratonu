import random
from typing import Optional

# Bot isim havuzu — tüm seçeneklerden karışık
BOT_FIRST_NAMES = [
    "Ahmet", "Mehmet", "Mustafa", "Ali", "Hüseyin", "İbrahim", "Hasan", "Yusuf",
    "Ayşe", "Fatma", "Elif", "Zeynep", "Emine", "Hatice", "Seda", "Merve",
    "Emre", "Burak", "Murat", "Kemal", "Tolga", "Serkan", "Baran", "Kaan",
    "Derya", "Gizem", "Tuğba", "Büşra", "Cansu", "Pınar", "Yasemin", "Aslı",
]

BOT_LAST_INITIALS = ["K", "A", "B", "D", "E", "G", "M", "S", "T", "Y", "Ç", "Ö"]

BOT_THEMED_NAMES = [
    "BilgeKuş", "HızlıTilki", "UstaMaymun", "KaplanBey", "KurnazTilki",
    "ZekiKartal", "HızlıAslan", "BilgeBalık", "GüçlüAyı", "AkıllıKurt",
    "CesurArslan", "UçanKartal", "UsluPanda", "HarikaBöcek", "NecipBey",
]

BOT_CITY_PROFESSIONS = [
    "AnkaralıDoktor", "İzmirliMühendis", "BursalıÖğretmen", "AdanalıAvukat",
    "KonyalıEczacı", "TrabzonluMimar", "ErzurumluHoca", "SamsunluAstronot",
    "MalatyalıBilgin", "GaziantepliUsta", "DiyarbakırlıBey", "EskişehirliHan",
    "KayseriHacı", "MardinliAli", "VanGölüKaptanı", "AntepliZorlu",
]

def generate_bot_name() -> str:
    """Rastgele bot ismi üret — 4 formatın karışımı."""
    choice = random.randint(1, 4)
    if choice == 1:
        name = random.choice(BOT_FIRST_NAMES)
        number = random.randint(10, 99)
        return f"{name}_{number}"
    elif choice == 2:
        name = random.choice(BOT_FIRST_NAMES)
        initial = random.choice(BOT_LAST_INITIALS)
        return f"{name}{initial}"
    elif choice == 3:
        return random.choice(BOT_THEMED_NAMES) + str(random.randint(1, 99))
    else:
        return random.choice(BOT_CITY_PROFESSIONS)

# ELO'ya göre doğru cevap olasılığı
def bot_accuracy(elo: float) -> float:
    if elo < 900:   return 0.35
    if elo < 1000:  return 0.45
    if elo < 1100:  return 0.55
    if elo < 1200:  return 0.65
    if elo < 1300:  return 0.75
    if elo < 1400:  return 0.83
    if elo < 1500:  return 0.88
    if elo < 1600:  return 0.92
    return 0.96

# ELO'ya göre cevap süresi (saniye) — mutlak değer, time_limit'in yüzdesi değil
def bot_response_time(elo: float, time_limit: float) -> float:
    if elo < 900:    wait = random.uniform(3.0, 5.0)   # Zayıf bot — 3-5 saniye
    elif elo < 1100: wait = random.uniform(2.0, 4.0)   # Orta bot — 2-4 saniye
    elif elo < 1300: wait = random.uniform(1.0, 3.0)   # İyi bot — 1-3 saniye
    elif elo < 1500: wait = random.uniform(0.5, 2.0)   # Güçlü bot — 0.5-2 saniye
    else:            wait = random.uniform(0.3, 1.0)   # Uzman bot — 0.3-1 saniye

    # Time limit'i aşmasın
    return min(wait, time_limit - 0.5)

def bot_should_use_joker(elo: float) -> bool:
    """Düşük ELO bot joker kullanır, yüksek ELO kullanmaz."""
    if elo < 1000: return random.random() < 0.3
    if elo < 1200: return random.random() < 0.15
    return False  # Güçlü bot zaten biliyor

def bot_answer(correct_answer: str, elo: float) -> str:
    """Bot cevabını üret — ELO'ya göre doğru veya yanlış."""
    accuracy = bot_accuracy(elo)
    if random.random() < accuracy:
        return correct_answer
    # Yanlış cevap — rastgele başka bir şık
    options = ["A", "B", "C", "D"]
    options.remove(correct_answer)
    return random.choice(options)
