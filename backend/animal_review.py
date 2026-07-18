#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Hayvan gorsel kontrol sunucusu — her resmi tek tikla degistir.
Kullanim: python3 animal_review.py  -> http://localhost:8899 ac
"""
import json, os, io, urllib.request, urllib.parse, http.server, socketserver, re
from PIL import Image

# API anahtarini download_animals.py'den oku
with io.open("download_animals.py", encoding="utf-8") as f:
    _src = f.read()
API_KEY = re.search(r'API_KEY = "([^"]+)"', _src).group(1)

W, H = 480, 300
OUT = "uploads/questions/animals"
PORT = 8899

# slug -> ingilizce arama terimi (download_animals.py'den cek)
ANIMALS = {}
for m in re.finditer(r'"([a-z_0-9]+)": \("([^"]+)", "([^"]+)"\)', _src):
    ANIMALS[m.group(1)] = {"ad": m.group(2), "q": m.group(3)}

# her slug icin kacinci sonuca bakildigini tut
STATE_FILE = OUT + "/_state.json"
if os.path.exists(STATE_FILE):
    with io.open(STATE_FILE, encoding="utf-8") as f:
        STATE = json.load(f)
else:
    STATE = {}

def save_state():
    with io.open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(STATE, f)

def crop_center(img, tw, th):
    sr, tr = img.width / img.height, tw / th
    if sr > tr:
        nw = int(img.height * tr); left = (img.width - nw) // 2
        img = img.crop((left, 0, left + nw, img.height))
    else:
        nh = int(img.width / tr); top = (img.height - nh) // 2
        img = img.crop((0, top, img.width, top + nh))
    return img.resize((tw, th), Image.LANCZOS)

def fetch_next(slug):
    """Bir sonraki Pixabay sonucunu indir"""
    info = ANIMALS.get(slug)
    if not info:
        return False, "slug bulunamadi"
    idx = STATE.get(slug, 0) + 1
    page = (idx // 20) + 1
    pos = idx % 20
    try:
        params = urllib.parse.urlencode({
            "key": API_KEY, "q": info["q"], "image_type": "photo",
            "orientation": "horizontal", "category": "animals",
            "safesearch": "true", "per_page": 20, "page": page, "order": "popular",
        })
        req = urllib.request.Request("https://pixabay.com/api/?" + params,
                                     headers={"User-Agent": "BilgiMaratonu/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode("utf-8"))
        hits = data.get("hits", [])
        if not hits:
            STATE[slug] = 0; save_state()
            return False, "sonuc yok"
        if pos >= len(hits):
            pos = 0; idx = 0
        img_url = hits[pos].get("largeImageURL") or hits[pos].get("webformatURL")
        req2 = urllib.request.Request(img_url, headers={"User-Agent": "BilgiMaratonu/1.0"})
        with urllib.request.urlopen(req2, timeout=25) as r2:
            raw = r2.read()
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img = crop_center(img, W, H)
        img.save(OUT + "/" + slug + ".jpg", "JPEG", quality=85, optimize=True)
        STATE[slug] = idx; save_state()
        return True, "ok"
    except Exception as e:
        return False, str(e)[:80]

def build_html():
    with io.open(OUT + "/_liste.json", encoding="utf-8") as f:
        animals = json.load(f)
    cards = ""
    for a in animals:
        s = a["slug"]
        cards += ('<div class="card" id="c_' + s + '">'
                  '<img src="/img/' + s + '.jpg?v=0" id="i_' + s + '">'
                  '<div class="name">' + a["ad"] + '</div>'
                  '<div class="row"><span class="slug">' + s + '</span>'
                  '<button onclick="yenile(\'' + s + '\')">🔄 Yenile</button></div>'
                  '</div>\n')
    return """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Hayvan Kontrol</title>
<style>
body{font-family:system-ui,sans-serif;background:#1a1a2e;color:#eee;padding:20px;margin:0}
h1{color:#FFD700;margin:0 0 8px}
.info{background:rgba(255,255,255,.06);padding:12px;border-radius:8px;margin-bottom:20px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.card{background:rgba(255,255,255,.05);border-radius:10px;overflow:hidden;border:1px solid rgba(255,255,255,.1)}
.card img{width:100%;height:156px;object-fit:cover;display:block;background:#333}
.card .name{padding:8px 8px 4px;font-weight:600;font-size:14px}
.row{display:flex;justify-content:space-between;align-items:center;padding:0 8px 8px;gap:8px}
.slug{font-size:11px;color:#888;font-family:monospace}
button{background:rgba(79,195,247,.2);color:#4FC3F7;border:1px solid #4FC3F7;border-radius:6px;
padding:4px 10px;font-size:12px;cursor:pointer;font-weight:600}
button:hover{background:rgba(79,195,247,.35)}
button:disabled{opacity:.4;cursor:wait}
</style></head><body>
<h1>Hayvan Gorselleri</h1>
<div class="info">Begenmedigin resimde <b>🔄 Yenile</b>'ye bas — Pixabay'den sonraki foto gelir.
Istedigin kadar basabilirsin. Bitince sayfayi kapat, bana haber ver.</div>
<div class="grid">""" + cards + """</div>
<script>
async function yenile(slug){
  const btn = event.target; btn.disabled = true; btn.textContent = '...';
  try{
    const r = await fetch('/yenile/' + slug);
    const j = await r.json();
    if(j.ok){
      const img = document.getElementById('i_' + slug);
      img.src = '/img/' + slug + '.jpg?v=' + Date.now();
    } else { alert(slug + ': ' + j.msg); }
  }catch(e){ alert('Hata: ' + e); }
  btn.disabled = false; btn.textContent = '🔄 Yenile';
}
</script></body></html>"""

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            body = build_html().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
        elif self.path.startswith("/img/"):
            fname = self.path[5:].split("?")[0]
            p = OUT + "/" + fname
            if os.path.exists(p):
                with open(p, "rb") as f: data = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers(); self.wfile.write(data)
            else:
                self.send_response(404); self.end_headers()
        elif self.path.startswith("/yenile/"):
            slug = self.path[8:]
            ok, msg = fetch_next(slug)
            body = json.dumps({"ok": ok, "msg": msg}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers(); self.wfile.write(body)
        else:
            self.send_response(404); self.end_headers()

print("Kontrol sayfasi: http://localhost:" + str(PORT))
print("Bitince Ctrl+C ile kapat.\n")
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try: httpd.serve_forever()
    except KeyboardInterrupt: print("\nKapatildi.")
