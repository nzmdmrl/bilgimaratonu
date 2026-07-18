#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""flagcdn.com'dan bayraklari indirir -> uploads/questions/flags/"""
import urllib.request, os, json

FLAGS = {
    "tr": "Turkiye", "de": "Almanya", "fr": "Fransa", "gb": "Birlesik Krallik",
    "it": "Italya", "es": "Ispanya", "us": "Amerika Birlesik Devletleri", "ru": "Rusya",
    "cn": "Cin", "jp": "Japonya", "br": "Brezilya", "in": "Hindistan",
    "ca": "Kanada", "au": "Avustralya", "mx": "Meksika", "ar": "Arjantin",
    "nl": "Hollanda", "be": "Belcika", "se": "Isvec", "no": "Norvec",
    "dk": "Danimarka", "fi": "Finlandiya", "pl": "Polonya", "gr": "Yunanistan",
    "pt": "Portekiz", "ch": "Isvicre", "at": "Avusturya", "cz": "Cekya",
    "hu": "Macaristan", "ro": "Romanya", "bg": "Bulgaristan", "rs": "Sirbistan",
    "hr": "Hirvatistan", "ua": "Ukrayna", "ie": "Irlanda", "eg": "Misir",
    "za": "Guney Afrika", "ng": "Nijerya", "ke": "Kenya", "ma": "Fas",
    "sa": "Suudi Arabistan", "ae": "Birlesik Arap Emirlikleri", "ir": "Iran", "iq": "Irak",
    "il": "Israil", "sy": "Suriye", "az": "Azerbaycan", "ge": "Gurcistan",
    "kz": "Kazakistan", "uz": "Ozbekistan", "pk": "Pakistan", "id": "Endonezya",
    "th": "Tayland", "vn": "Vietnam", "kr": "Guney Kore", "kp": "Kuzey Kore",
    "ph": "Filipinler", "my": "Malezya", "sg": "Singapur", "nz": "Yeni Zelanda",
    "cl": "Sili", "pe": "Peru", "co": "Kolombiya", "ve": "Venezuela",
    "cu": "Kuba", "jm": "Jamaika", "is": "Izlanda", "ee": "Estonya",
    "lv": "Letonya", "lt": "Litvanya", "sk": "Slovakya", "si": "Slovenya",
    "ba": "Bosna Hersek", "al": "Arnavutluk", "mk": "Kuzey Makedonya", "me": "Karadag",
    "cy": "Kibris", "mt": "Malta", "lu": "Luksemburg", "qa": "Katar",
    "kw": "Kuveyt", "jo": "Urdun", "lb": "Lubnan", "af": "Afganistan",
}

os.makedirs("uploads/questions/flags", exist_ok=True)
ok = fail = 0
mapping = []

for code, name in FLAGS.items():
    url = "https://flagcdn.com/w320/" + code + ".png"
    path = "uploads/questions/flags/" + code + ".png"
    if os.path.exists(path):
        ok += 1
        mapping.append({"kod": code, "ulke": name, "yol": "/uploads/questions/flags/" + code + ".png"})
        continue
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=15) as r, open(path, "wb") as f:
            f.write(r.read())
        ok += 1
        mapping.append({"kod": code, "ulke": name, "yol": "/uploads/questions/flags/" + code + ".png"})
        print("  OK " + code + " - " + name)
    except Exception as e:
        fail += 1
        print("  FAIL " + code + " - " + str(e))

with open("uploads/questions/flags/_liste.json", "w", encoding="utf-8") as f:
    json.dump(mapping, f, ensure_ascii=False, indent=2)

print("\nIndirilen: " + str(ok) + "  Hatali: " + str(fail))
print("Liste: uploads/questions/flags/_liste.json (" + str(len(mapping)) + " ulke)")
