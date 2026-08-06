// Merkezi ses yöneticisi.
// - Her ses için sentetik (Web Audio) bir varsayılan üretir.
// - Admin panelinden bir sese MP3 yüklenmişse, sentetik yerine o MP3 çalar.
// - Tarayıcı autoplay politikası gereği ilk kullanıcı etkileşiminde AudioContext açılır.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

export type SoundKey =
  | 'radar'
  | 'match_found'
  | 'countdown'
  | 'correct'
  | 'wrong'
  | 'both_wrong'
  | 'opponent_correct'
  | 'opponent_wrong'
  | 'new_question'
  | 'win'
  | 'lose'
  | 'badge'
  | 'notification'
  | 'click'
  | 'count_roll'
  | 'count_ding'
  | 'title_up'
  | 'music_wait'
  | 'music_lobby'
  | 'music_round'

// Admin panelinde gösterilecek insan-okunur etiketler (sıra bu listeye göre)
export const SOUND_SLOTS: { key: SoundKey; label: string; desc: string }[] = [
  { key: 'radar', label: '📡 Rakip Aranıyor (radar)', desc: 'Eşleşme beklerken tekrar eden radar sesi' },
  { key: 'match_found', label: '🎉 Rakip Bulundu', desc: 'Rakip bulunduğunda çalan kısa müzik' },
  { key: 'countdown', label: '⏱ Geri Sayım', desc: 'Soru süresi azaldıkça yükselen tik sesi' },
  { key: 'correct', label: '✅ Doğru Cevap', desc: 'Doğru cevap verildiğinde' },
  { key: 'wrong', label: '❌ Yanlış Cevap', desc: 'Yanlış cevap verildiğinde' },
  { key: 'both_wrong', label: '😬 İkiniz de Yanlış', desc: 'Her iki oyuncu da yanlış yaptığında' },
  { key: 'opponent_correct', label: '🔵 Rakip Doğru Yaptı', desc: 'Rakip doğru cevapladığında' },
  { key: 'opponent_wrong', label: '🟢 Rakip Yanlış Yaptı', desc: 'Rakip yanlış yaptığında (sıra sende)' },
  { key: 'new_question', label: '📋 Yeni Soru', desc: 'Yeni soru geldiğinde' },
  { key: 'win', label: '🏆 Kazandın', desc: 'Maç kazanıldığında' },
  { key: 'lose', label: '💔 Kaybettin', desc: 'Maç kaybedildiğinde' },
  { key: 'badge', label: '🎖 Rozet Kazanıldı', desc: 'Maç sonunda rozet kazanıldığında' },
  { key: 'notification', label: '🔔 Bildirim', desc: 'Yeni bildirim geldiğinde' },
  { key: 'click', label: '🖱 Buton Tık', desc: 'Butonlara tıklarken çalan kısa tık sesi' },
  { key: 'count_roll', label: '🔢 Puan Sayacı', desc: 'Maç sonu puan/XP 0’dan yukarı sayarken (dırdır)' },
  { key: 'count_ding', label: '🔔 Sayaç Bitiş', desc: 'Sayma bitince çalan çıngırak (çlink)' },
  { key: 'title_up', label: '🎉 Yeni Ünvan', desc: 'Yeni ünvan kazanıldığında çalan kutlama müziği' },
  { key: 'music_wait', label: '🎵 Turnuva Bekleme Müziği', desc: 'Sonraki turnuva geri sayımı beklenirken (döngü)' },
  { key: 'music_lobby', label: '🎵 Lobi Müziği', desc: 'Lobide oyuncular toplanırken (döngü)' },
  { key: 'music_round', label: '🎵 Tur Arası Müziği', desc: 'Maçlar arası / sonraki tur beklenirken (döngü)' },
]

let ctx: AudioContext | null = null
let master: GainNode | null = null
let unlocked = false
let overrides: Partial<Record<SoundKey, string>> = {}
let overridesLoaded = false
// Çoklu müzik alanları: { music_wait: {tracks:[{url,name}], volume(0-100)}, ... }
type MusicSlot = { tracks: { url: string; name?: string }[]; volume: number }
let musicData: Record<string, MusicSlot> = {}
const audioCache: Partial<Record<SoundKey, HTMLAudioElement>> = {}
let radarLoopEl: HTMLAudioElement | null = null
let radarInterval: ReturnType<typeof setInterval> | null = null

function isBrowser() {
  return typeof window !== 'undefined'
}

export function isMuted(): boolean {
  if (!isBrowser()) return false
  return localStorage.getItem('sound_muted') === '1'
}

export function setMuted(m: boolean) {
  if (!isBrowser()) return
  localStorage.setItem('sound_muted', m ? '1' : '0')
  if (m) { stopRadar(); stopMusic() }
}

export function toggleMuted(): boolean {
  const next = !isMuted()
  setMuted(next)
  return next
}

function getCtx(): AudioContext | null {
  if (!isBrowser()) return null
  if (!ctx) {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch {
      return null
    }
  }
  return ctx
}

// İlk kullanıcı etkileşiminde çağrılır — AudioContext'i açar.
export function unlockAudio() {
  if (unlocked) return
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  unlocked = true
}

// Sayfa yüklenince bir kez çağır: MP3 override'larını çek + etkileşim dinleyicisi kur.
export function initSounds() {
  if (!isBrowser()) return
  if (!overridesLoaded) {
    overridesLoaded = true
    fetch(`${API_URL}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => {
        if (d && d.sounds) overrides = d.sounds
        if (d && d.music) musicData = d.music
      })
      .catch(() => {})
  }
  const handler = () => {
    unlockAudio()
    window.removeEventListener('pointerdown', handler)
    window.removeEventListener('keydown', handler)
    window.removeEventListener('touchstart', handler)
  }
  window.addEventListener('pointerdown', handler)
  window.addEventListener('keydown', handler)
  window.addEventListener('touchstart', handler)
}

function overrideUrl(key: SoundKey): string | null {
  const v = overrides[key]
  if (!v) return null
  return v.startsWith('http') ? v : `${API_URL}${v}`
}

function playOverride(key: SoundKey): boolean {
  const url = overrideUrl(key)
  if (!url) return false
  try {
    let el = audioCache[key]
    if (!el) {
      el = new Audio(url)
      el.volume = 0.7
      audioCache[key] = el
    }
    el.currentTime = 0
    el.play().catch(() => {})
    return true
  } catch {
    return false
  }
}

// --- Sentetik ses yardımcıları ---

function tone(
  freq: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number; delay?: number; sweepTo?: number } = {}
) {
  const c = getCtx()
  if (!c || !master) return
  const t0 = c.currentTime + (opts.delay || 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = opts.type || 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), t0 + dur)
  const peak = opts.gain ?? 0.3
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function arpeggio(freqs: number[], step: number, dur: number, type: OscillatorType = 'triangle', gain = 0.28) {
  freqs.forEach((f, i) => tone(f, dur, { type, gain, delay: i * step }))
}

// Her sentetik ses tanımı
const SYNTH: Record<SoundKey, (arg?: any) => void> = {
  radar: () => {
    // tek bir radar "ping"i (loop dışarıdan tetiklenir)
    tone(880, 0.18, { type: 'sine', gain: 0.18, sweepTo: 440 })
  },
  match_found: () => {
    arpeggio([523.25, 659.25, 783.99, 1046.5], 0.09, 0.22, 'triangle', 0.3)
  },
  countdown: (secondsLeft?: number) => {
    // süre azaldıkça pitch ve ses yükselir (15..1 sn arası) — hoş, net bir tik
    const s = typeof secondsLeft === 'number' ? Math.max(1, Math.min(15, secondsLeft)) : 8
    const freq = 520 + (15 - s) * 55 // 15sn -> 520Hz, 1sn -> ~1290Hz
    const vol = Math.min(0.55, 0.28 + (15 - s) * 0.018)
    tone(freq, 0.1, { type: 'sine', gain: vol })
    tone(freq * 2, 0.06, { type: 'sine', gain: vol * 0.25 }) // hafif parlaklık
  },
  correct: () => {
    tone(659.25, 0.12, { type: 'sine', gain: 0.3 })
    tone(987.77, 0.18, { type: 'sine', gain: 0.3, delay: 0.1 })
  },
  wrong: () => {
    tone(200, 0.28, { type: 'sawtooth', gain: 0.25, sweepTo: 90 })
  },
  both_wrong: () => {
    tone(160, 0.22, { type: 'sawtooth', gain: 0.22 })
    tone(120, 0.3, { type: 'sawtooth', gain: 0.22, delay: 0.14 })
  },
  opponent_correct: () => {
    // rakip doğru yaptı — yumuşak, hafif olumsuz iki nota (in-in)
    tone(392, 0.14, { type: 'sine', gain: 0.2 })
    tone(311.13, 0.2, { type: 'sine', gain: 0.2, delay: 0.13 })
  },
  opponent_wrong: () => {
    // rakip yanlış yaptı, sıra sende — hafif olumlu blip
    tone(587.33, 0.1, { type: 'triangle', gain: 0.2 })
    tone(880, 0.14, { type: 'triangle', gain: 0.2, delay: 0.09 })
  },
  new_question: () => {
    tone(440, 0.12, { type: 'triangle', gain: 0.22, sweepTo: 880 })
  },
  win: () => {
    arpeggio([523.25, 659.25, 783.99, 1046.5], 0.11, 0.28, 'triangle', 0.32)
    tone(1318.5, 0.4, { type: 'sine', gain: 0.25, delay: 0.44 })
  },
  lose: () => {
    arpeggio([440, 349.23, 293.66], 0.16, 0.34, 'sawtooth', 0.24)
  },
  badge: () => {
    arpeggio([1046.5, 1318.5, 1567.98, 2093], 0.07, 0.2, 'sine', 0.24)
  },
  notification: () => {
    tone(880, 0.14, { type: 'sine', gain: 0.26 })
    tone(1174.66, 0.2, { type: 'sine', gain: 0.26, delay: 0.13 })
  },
  click: () => {
    // kısa, yumuşak tık
    tone(1300, 0.03, { type: 'triangle', gain: 0.13 })
    tone(2600, 0.02, { type: 'sine', gain: 0.05, delay: 0.008 })
  },
  count_roll: () => {
    // çok kısa tık — hızlı tekrarla "dırdır" sesi verir
    tone(1500, 0.02, { type: 'square', gain: 0.06 })
  },
  count_ding: () => {
    // parlak "çlink"
    tone(1046.5, 0.1, { type: 'sine', gain: 0.3 })
    tone(1568, 0.22, { type: 'sine', gain: 0.28, delay: 0.05 })
  },
  title_up: () => {
    // kutlama fanfarı
    arpeggio([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.09, 0.32, 'triangle', 0.32)
    tone(1567.98, 0.5, { type: 'sine', gain: 0.28, delay: 0.46 })
    tone(2093, 0.6, { type: 'sine', gain: 0.18, delay: 0.52 })
  },
  // Müzikler sadece MP3'ten çalar (sentetik yok)
  music_wait: () => {},
  music_lobby: () => {},
  music_round: () => {},
}

// Tek seferlik ses çal
export function playSound(key: SoundKey, arg?: any) {
  if (!isBrowser() || isMuted()) return
  unlockAudio()
  if (playOverride(key)) return
  try {
    SYNTH[key]?.(arg)
  } catch {
    /* sessizce yut */
  }
}

// Geri sayım tik'i — süre azaldıkça yükselir. Son 15 saniyede çalar.
export function playCountdownTick(secondsLeft: number) {
  if (secondsLeft <= 0 || secondsLeft > 15) return
  playSound('countdown', secondsLeft)
}

// Maç öncesi 3-2-1 geri sayım beep'i (her zaman sentetik, yükselen; 0'da "başla").
export function playCountdownBeep(n: number) {
  if (!isBrowser() || isMuted()) return
  unlockAudio()
  try {
    if (n > 0) {
      const k = Math.max(1, Math.min(3, n))
      const freq = 440 + (3 - k) * 120 // 3->440, 2->560, 1->680
      tone(freq, 0.16, { type: 'triangle', gain: 0.42 })
    } else {
      // Başla!
      tone(660, 0.14, { type: 'triangle', gain: 0.42 })
      tone(990, 0.24, { type: 'sine', gain: 0.4, delay: 0.1 })
    }
  } catch { /* yut */ }
}

// Radar döngüsü (rakip aranırken)
export function startRadar() {
  if (!isBrowser() || isMuted()) return
  unlockAudio()
  stopRadar()
  const url = overrideUrl('radar')
  if (url) {
    try {
      radarLoopEl = new Audio(url)
      radarLoopEl.loop = true
      radarLoopEl.volume = 0.5
      radarLoopEl.play().catch(() => {})
      return
    } catch {
      /* sentetiğe düş */
    }
  }
  SYNTH.radar()
  radarInterval = setInterval(() => {
    if (isMuted()) { stopRadar(); return }
    SYNTH.radar()
  }, 1300)
}

export function stopRadar() {
  if (radarInterval) { clearInterval(radarInterval); radarInterval = null }
  if (radarLoopEl) { try { radarLoopEl.pause() } catch {}; radarLoopEl = null }
}

// Puan sayacı döngüsü (maç sonu 0'dan yukarı sayarken)
let countRollEl: HTMLAudioElement | null = null
let countRollInterval: ReturnType<typeof setInterval> | null = null

export function startCountRoll() {
  if (!isBrowser() || isMuted()) return
  unlockAudio()
  stopCountRoll()
  const url = overrideUrl('count_roll')
  if (url) {
    try {
      countRollEl = new Audio(url)
      countRollEl.loop = true
      countRollEl.volume = 0.5
      countRollEl.play().catch(() => {})
      return
    } catch { /* sentetiğe düş */ }
  }
  SYNTH.count_roll()
  countRollInterval = setInterval(() => {
    if (isMuted()) { stopCountRoll(); return }
    SYNTH.count_roll()
  }, 55)
}

export function stopCountRoll() {
  if (countRollInterval) { clearInterval(countRollInterval); countRollInterval = null }
  if (countRollEl) { try { countRollEl.pause() } catch {}; countRollEl = null }
}

// ─── Arka plan müziği (turnuva fazları) — çoklu MP3, random çalar; fade-in/out ile ───
let musicEl: HTMLAudioElement | null = null
let musicKey: SoundKey | null = null
let musicFadeIv: ReturnType<typeof setInterval> | null = null
let musicTargetVol = 0.35   // aktif alanın hedef sesi (0-1)

function _clearMusicFade() { if (musicFadeIv) { clearInterval(musicFadeIv); musicFadeIv = null } }

// Bir müzik alanının parça listesini ve ses seviyesini çöz.
function _musicSlot(key: SoundKey): { urls: string[]; vol: number } {
  const slot = musicData[key as string]
  const raw = (slot && Array.isArray(slot.tracks)) ? slot.tracks : []
  const urls = raw
    .map(t => (typeof t === 'string' ? t : (t && t.url)))
    .filter(Boolean)
    .map(u => (u.startsWith('http') ? u : `${API_URL}${u}`))
  // yüklü liste yoksa tekli ses override'ına düş (geriye dönük uyum)
  if (urls.length === 0) {
    const single = overrideUrl(key)
    if (single) urls.push(single)
  }
  const vol = slot && typeof slot.volume === 'number'
    ? Math.max(0, Math.min(1, slot.volume / 100))
    : 0.35
  return { urls, vol }
}

function _pickRandom(urls: string[], notUrl?: string): string {
  if (urls.length === 1) return urls[0]
  const pool = notUrl ? urls.filter(u => u !== notUrl) : urls
  const list = pool.length ? pool : urls
  const i = Math.floor(Math.random() * list.length)
  return list[i]
}

function _playMusicUrl(url: string, urls: string[]) {
  try {
    unlockAudio()
    const el = new Audio(url)
    el.loop = false            // biten parçadan sonra rastgele yenisi
    el.volume = 0
    el.onended = () => {
      if (musicEl !== el) return          // alan değişti
      const next = _pickRandom(urls, url)
      _playMusicUrl(next, urls)
    }
    el.play().catch(() => {})
    musicEl = el
    _clearMusicFade()
    musicFadeIv = setInterval(() => {       // fade-in
      if (!musicEl) { _clearMusicFade(); return }
      const v = Math.min(musicTargetVol, musicEl.volume + 0.03)
      musicEl.volume = v
      if (v >= musicTargetVol) _clearMusicFade()
    }, 45)
  } catch { /* yut */ }
}

export function playMusic(key: SoundKey) {
  if (!isBrowser() || isMuted()) { stopMusic(); return }
  if (musicKey === key && musicEl) return   // zaten bu alan çalıyor
  const { urls, vol } = _musicSlot(key)
  stopMusic()                                // öncekini fade-out ile durdur
  if (urls.length === 0) { musicKey = null; return }
  musicKey = key
  musicTargetVol = vol
  _playMusicUrl(_pickRandom(urls), urls)
}

export function stopMusic() {
  _clearMusicFade()
  const el = musicEl
  musicEl = null
  musicKey = null
  if (!el) return
  const iv = setInterval(() => {               // fade-out (sesi kısılarak bit)
    const v = el.volume - 0.045
    if (v <= 0.02) {
      try { el.pause() } catch {}
      clearInterval(iv)
    } else {
      el.volume = v
    }
  }, 45)
}
