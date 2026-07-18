#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""flagcdn.com'dan TUM ulke bayraklarini indirir (ISO 3166-1 alpha-2)"""
import urllib.request, os, json

# flagcdn.com'un kendi kod->isim listesini cek
print("Ulke listesi cekiliyor...")
req = urllib.request.Request("https://flagcdn.com/en/codes.json", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=20) as r:
    codes = json.loads(r.read().decode("utf-8"))

# Sadece 2 harfli ulke kodlari (bolge/eyalet kodlarini atla)
codes = {k: v for k, v in codes.items() if len(k) == 2}
print(str(len(codes)) + " ulke bulundu\n")

os.makedirs("uploads/questions/flags", exist_ok=True)
ok = fail = 0
mapping = []

for code, name in sorted(codes.items()):
    url = "https://flagcdn.com/w320/" + code + ".png"
    path = "uploads/questions/flags/" + code + ".png"
    if os.path.exists(path):
        ok += 1
        mapping.append({"kod": code, "ulke_en": name, "yol": "/uploads/questions/flags/" + code + ".png"})
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r, open(path, "wb") as f:
            f.write(r.read())
        ok += 1
        mapping.append({"kod": code, "ulke_en": name, "yol": "/uploads/questions/flags/" + code + ".png"})
        print("  OK " + code + " - " + name)
    except Exception as e:
        fail += 1
        print("  FAIL " + code + " - " + str(e)[:50])

with open("uploads/questions/flags/_tum_liste.json", "w", encoding="utf-8") as f:
    json.dump(mapping, f, ensure_ascii=False, indent=2)

print("\nIndirilen/mevcut: " + str(ok) + "  Hatali: " + str(fail))
print("Liste: uploads/questions/flags/_tum_liste.json (" + str(len(mapping)) + " ulke)")
print("\nNOT: Ulke isimleri INGILIZCE. Soru uretirken Turkce karsiliklarini kullan.")
