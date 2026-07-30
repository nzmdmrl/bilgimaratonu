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
]

let ctx: AudioContext | null = null
let master: GainNode | null = null
let unlocked = false
let overrides: Partial<Record<SoundKey, string>> = {}
let overridesLoaded = false
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
  if (m) stopRadar()
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
      .then(d => { if (d && d.sounds) overrides = d.sounds })
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
    // süre azaldıkça pitch yükselir (10..1 sn arası)
    const s = typeof secondsLeft === 'number' ? Math.max(1, Math.min(10, secondsLeft)) : 5
    const freq = 500 + (10 - s) * 90 // 10sn -> 500Hz, 1sn -> ~1310Hz
    const vol = 0.12 + (10 - s) * 0.02
    tone(freq, 0.09, { type: 'sine', gain: Math.min(0.3, vol) })
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

// Geri sayım tik'i — süre azaldıkça yükselir. Sadece son 10 saniyede çalar.
export function playCountdownTick(secondsLeft: number) {
  if (secondsLeft <= 0 || secondsLeft > 10) return
  playSound('countdown', secondsLeft)
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
