#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bilgi Maratonu — Soru Yükleyici (görsel destekli)
Kullanım:
  python3 load_questions.py sorular.json   → yükle + rapor
  python3 load_questions.py --rapor        → sadece rapor
"""
import sys, json, hashlib, unicodedata, subprocess

DB_CONTAINER = "bilgimaratonu_db"
DB_USER = "bilgimaratonu"
DB_NAME = "bilgimaratonu"
ZORLUKLAR = ["easy", "medium", "hard", "very_hard"]

def run_sql(sql, fetch=False):
    cmd = ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME]
    if fetch:
        cmd += ["-t", "-A", "-F", "\t"]
    cmd += ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print("SQL HATA:", r.stderr.strip()[:200])
        return None
    return r.stdout.strip()

def kategori_haritasi():
    out = run_sql("SELECT name, id FROM categories WHERE deleted_at IS NULL;", fetch=True)
    m = {}
    if out:
        for line in out.splitlines():
            if "\t" in line:
                name, cid = line.split("\t", 1)
                m[name.strip().lower()] = cid.strip()
    return m

def content_hash(kid, metin, gorsel=None):
    norm = unicodedata.normalize("NFKC", metin.strip().lower())
    norm = " ".join(norm.split())
    key = kid + "::" + norm
    if gorsel:
        key += "::" + gorsel.strip()
    return hashlib.sha256(key.encode("utf-8")).hexdigest()

def esc(s):
    if s is None or s == "":
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def yukle(dosya):
    with open(dosya, encoding="utf-8") as f:
        sorular = json.load(f)
    kat_map = kategori_haritasi()
    if not kat_map:
        print("HATA: kategori listesi cekilemedi.")
        return
    eklenen = atlanan = hatali = 0
    for i, q in enumerate(sorular, 1):
        try:
            kategori = q["kategori"].strip()
            zorluk = q["zorluk"].strip().lower()
            metin = q["soru"].strip()
            a, b = q["a"].strip(), q["b"].strip()
            c = (q.get("c") or "").strip() or None
            d = (q.get("d") or "").strip() or None
            dogru = q["dogru"].strip().upper()
            aciklama = (q.get("aciklama") or "").strip() or None
            gorsel = (q.get("gorsel") or "").strip() or None
            kat_id = kat_map.get(kategori.lower())
            if not kat_id:
                print("  [" + str(i) + "] ATLA - kategori yok: " + kategori); hatali += 1; continue
            if zorluk not in ZORLUKLAR:
                print("  [" + str(i) + "] ATLA - zorluk: " + zorluk); hatali += 1; continue
            if dogru not in ("A", "B", "C", "D"):
                print("  [" + str(i) + "] ATLA - cevap: " + dogru); hatali += 1; continue
            h = content_hash(kat_id, metin, gorsel)
            sql = ("INSERT INTO questions (id, category_id, difficulty, question_type, text, question_image, "
                   "option_a, option_b, option_c, option_d, correct_answer, explanation, "
                   "is_active, is_approved, times_shown, times_correct, content_hash, created_at, updated_at) VALUES "
                   "(gen_random_uuid(), '" + kat_id + "', '" + zorluk + "', 'multiple_choice', " + esc(metin) + ", " + esc(gorsel) + ", "
                   + esc(a) + ", " + esc(b) + ", " + esc(c) + ", " + esc(d) + ", '" + dogru + "', " + esc(aciklama) + ", "
                   "true, true, 0, 0, '" + h + "', NOW(), NOW()) ON CONFLICT (content_hash) DO NOTHING;")
            out = run_sql(sql)
            if out is None: hatali += 1
            elif "INSERT 0 1" in out: eklenen += 1
            else: atlanan += 1
        except KeyError as e:
            print("  [" + str(i) + "] ATLA - eksik alan: " + str(e)); hatali += 1
        except Exception as e:
            print("  [" + str(i) + "] HATA - " + str(e)); hatali += 1
    print("\nEklenen: " + str(eklenen) + "  |  Mukerrer: " + str(atlanan) + "  |  Hatali: " + str(hatali) + "\n")

def rapor():
    out = run_sql("SELECT c.name, q.difficulty, COUNT(*) FROM questions q JOIN categories c ON c.id = q.category_id "
                  "WHERE q.is_active AND q.is_approved AND q.deleted_at IS NULL AND c.deleted_at IS NULL "
                  "GROUP BY c.name, q.difficulty;", fetch=True)
    data = {}
    if out:
        for line in out.splitlines():
            p = line.split("\t")
            if len(p) == 3:
                data.setdefault(p[0].strip(), {})[p[1].strip()] = int(p[2])
    if not data:
        print("Henuz soru yok.")
        return
    print("=" * 74)
    print("KATEGORI".ljust(22) + "Kolay".rjust(8) + "Orta".rjust(8) + "Zor".rjust(8) + "CokZor".rjust(8) + "Toplam".rjust(8) + "Denge".rjust(12))
    print("-" * 74)
    for name in sorted(data.keys()):
        d = data[name]
        e, m = d.get("easy", 0), d.get("medium", 0)
        h, v = d.get("hard", 0), d.get("very_hard", 0)
        t = e + m + h + v
        if e > 0:
            eksik = []
            if m < (e * 2 / 3) * 0.7: eksik.append("orta")
            if h < (e / 3) * 0.7: eksik.append("zor")
            if v < (e / 3) * 0.7: eksik.append("cokzor")
            uyari = ("! " + ",".join(eksik)) if eksik else "OK"
        else:
            uyari = "bos"
        print(name.ljust(22) + str(e).rjust(8) + str(m).rjust(8) + str(h).rjust(8) + str(v).rjust(8) + str(t).rjust(8) + uyari.rjust(12))
    print("=" * 74)
    print("Hedef oran 3:2:1:1 (Kolay:Orta:Zor:CokZor)")
    print("Kategori basina onerilen: 30/20/10/10 (=70 soru) minimum")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
    elif sys.argv[1] == "--rapor":
        rapor()
    else:
        yukle(sys.argv[1])
        rapor()
