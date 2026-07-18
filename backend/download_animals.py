#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pixabay'den hayvan fotolari indirir, 480x300 kirpar -> uploads/questions/animals/"""
import urllib.request, urllib.parse, os, json, io, time
from PIL import Image

API_KEY = "56716208-bdd7f0f1112181aaa2a3702cb"   # <-- kendi anahtarini yaz

W, H = 480, 300
OUT = "uploads/questions/animals"

# slug: (turkce, ingilizce arama terimi)
ANIMALS = {
    "aslan": ("Aslan", "lion"), "kaplan": ("Kaplan", "tiger"), "fil": ("Fil", "elephant"),
    "zurafa": ("Zürafa", "giraffe"), "zebra": ("Zebra", "zebra"), "panda": ("Panda", "giant panda"),
    "kanguru": ("Kanguru", "kangaroo"), "penguen": ("Penguen", "penguin"), "yunus": ("Yunus", "dolphin"),
    "balina": ("Balina", "whale"), "kopekbaligi": ("Köpekbalığı", "shark"), "ahtapot": ("Ahtapot", "octopus"),
    "kaplumbaga": ("Kaplumbağa", "turtle"), "timsah": ("Timsah", "crocodile"), "yilan": ("Yılan", "snake"),
    "kertenkele": ("Kertenkele", "lizard"), "kurbaga": ("Kurbağa", "frog"), "bukalemun": ("Bukalemun", "chameleon"),
    "kartal": ("Kartal", "eagle"), "baykus": ("Baykuş", "owl"), "flamingo": ("Flamingo", "flamingo"),
    "tavuskusu": ("Tavus Kuşu", "peacock"), "papagan": ("Papağan", "parrot"), "pelikan": ("Pelikan", "pelican"),
    "leylek": ("Leylek", "stork"), "kuzgun": ("Kuzgun", "raven"), "sahin": ("Şahin", "falcon"),
    "devekusu": ("Devekuşu", "ostrich"), "kugu": ("Kuğu", "swan"), "marti": ("Martı", "seagull"),
    "kedi": ("Kedi", "cat"), "kopek": ("Köpek", "dog"), "at": ("At", "horse"), "inek": ("İnek", "cow"),
    "koyun": ("Koyun", "sheep"), "keci": ("Keçi", "goat"), "domuz": ("Domuz", "pig"),
    "tavsan": ("Tavşan", "rabbit"), "fare": ("Fare", "mouse"), "sincap": ("Sincap", "squirrel"),
    "tilki": ("Tilki", "fox"), "kurt": ("Kurt", "wolf"), "ayi": ("Ayı", "brown bear"),
    "kutup_ayisi": ("Kutup Ayısı", "polar bear"), "geyik": ("Geyik", "deer"), "karaca": ("Karaca", "roe deer"),
    "yaban_domuzu": ("Yaban Domuzu", "wild boar"), "rakun": ("Rakun", "raccoon"), "kirpi": ("Kirpi", "hedgehog"),
    "kunduz": ("Kunduz", "beaver"), "su_samuru": ("Su Samuru", "otter"), "gelincik": ("Gelincik", "weasel"),
    "maymun": ("Maymun", "monkey"), "goril": ("Goril", "gorilla"), "sempanze": ("Şempanze", "chimpanzee"),
    "orangutan": ("Orangutan", "orangutan"), "lemur": ("Lemur", "lemur"),
    "deve": ("Deve", "camel"), "lama": ("Lama", "llama"), "alpaka": ("Alpaka", "alpaca"),
    "gergedan": ("Gergedan", "rhinoceros"), "sugygiri": ("Su Aygırı", "hippopotamus"),
    "cita": ("Çita", "cheetah"), "leopar": ("Leopar", "leopard"), "jaguar": ("Jaguar", "jaguar"),
    "puma": ("Puma", "puma cougar"), "vasak": ("Vaşak", "lynx"), "sirtlan": ("Sırtlan", "hyena"),
    "cakal": ("Çakal", "jackal"), "antilop": ("Antilop", "antelope"), "bizon": ("Bizon", "bison"),
    "manda": ("Manda", "buffalo"), "yak": ("Yak", "yak"), "koala": ("Koala", "koala"),
    "tembel_hayvan": ("Tembel Hayvan", "sloth"), "karincayiyen": ("Karıncayiyen", "anteater"),
    "armadillo": ("Armadillo", "armadillo"), "yarasa": ("Yarasa", "bat"), "porsuk": ("Porsuk", "badger"),
    "fok": ("Fok", "seal"), "mors": ("Mors", "walrus"), "deniz_ati": ("Deniz Atı", "seahorse"),
    "denizyildizi": ("Denizyıldızı", "starfish"), "yengec": ("Yengeç", "crab"), "istakoz": ("Istakoz", "lobster"),
    "medusa": ("Denizanası", "jellyfish"), "mercan": ("Mercan", "coral reef"),
    "kelebek": ("Kelebek", "butterfly"), "ari": ("Arı", "bee"), "karinca": ("Karınca", "ant"),
    "orumcek": ("Örümcek", "spider"), "akrep": ("Akrep", "scorpion"), "yusufcuk": ("Yusufçuk", "dragonfly"),
    "ugurbocegi": ("Uğur Böceği", "ladybug"), "cekirge": ("Çekirge", "grasshopper"),
    "salyangoz": ("Salyangoz", "snail"), "solucan": ("Solucan", "earthworm"),
    "tavuk": ("Tavuk", "chicken hen"), "horoz": ("Horoz", "rooster"), "ordek": ("Ördek", "duck"),
    "kaz": ("Kaz", "goose"), "hindi": ("Hindi", "turkey bird"), "guvercin": ("Güvercin", "pigeon"),
    "serce": ("Serçe", "sparrow"), "kirlangic": ("Kırlangıç", "swallow bird"),
    "agackakan": ("Ağaçkakan", "woodpecker"), "sinekkus": ("Sinek Kuşu", "hummingbird"),
    "tukan": ("Tukan", "toucan"), "pengueni": ("İmparator Pengueni", "emperor penguin"),
}

os.makedirs(OUT, exist_ok=True)

def crop_center(img, tw, th):
    """En-boy oranini koruyarak kutuyu tam dolduracak sekilde kirp (object-fit: cover mantigi)"""
    src_ratio = img.width / img.height
    tgt_ratio = tw / th
    if src_ratio > tgt_ratio:
        # kaynak daha genis -> yanlardan kirp
        new_w = int(img.height * tgt_ratio)
        left = (img.width - new_w) // 2
        img = img.crop((left, 0, left + new_w, img.height))
    else:
        # kaynak daha dar/uzun -> ust-alttan kirp
        new_h = int(img.width / tgt_ratio)
        top = (img.height - new_h) // 2
        img = img.crop((0, top, img.width, top + new_h))
    return img.resize((tw, th), Image.LANCZOS)

if not API_KEY or len(API_KEY) < 10:
    print("HATA: API_KEY gecersiz")
    raise SystemExit

ok = fail = 0
mapping = []

for slug, (tr_name, en_query) in ANIMALS.items():
    path = OUT + "/" + slug + ".jpg"
    if os.path.exists(path):
        ok += 1
        mapping.append({"slug": slug, "ad": tr_name, "yol": "/uploads/questions/animals/" + slug + ".jpg"})
        continue
    try:
        params = urllib.parse.urlencode({
            "key": API_KEY, "q": en_query, "image_type": "photo",
            "orientation": "horizontal", "category": "animals",
            "safesearch": "true", "per_page": 3, "order": "popular",
        })
        req = urllib.request.Request("https://pixabay.com/api/?" + params,
                                     headers={"User-Agent": "BilgiMaratonu/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        hits = data.get("hits", [])
        if not hits:
            print("  YOK  " + slug + " (" + en_query + ")")
            fail += 1
            continue
        img_url = hits[0].get("largeImageURL") or hits[0].get("webformatURL")
        req2 = urllib.request.Request(img_url, headers={"User-Agent": "BilgiMaratonu/1.0"})
        with urllib.request.urlopen(req2, timeout=25) as r2:
            raw = r2.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img = crop_center(img, W, H)
        img.save(path, "JPEG", quality=85, optimize=True)
        ok += 1
        mapping.append({"slug": slug, "ad": tr_name, "yol": "/uploads/questions/animals/" + slug + ".jpg"})
        print("  OK   " + slug + " - " + tr_name)
        time.sleep(0.7)   # rate limit'e saygi
    except Exception as e:
        fail += 1
        print("  FAIL " + slug + " - " + str(e)[:60])

with open(OUT + "/_liste.json", "w", encoding="utf-8") as f:
    json.dump(mapping, f, ensure_ascii=False, indent=2)

print("\nIndirilen: " + str(ok) + "  Hatali: " + str(fail))
print("Liste: " + OUT + "/_liste.json (" + str(len(mapping)) + " hayvan)")
print("\nSONRAKI ADIM: kontrol sayfasini olustur ve gorselleri gozden gecir.")
