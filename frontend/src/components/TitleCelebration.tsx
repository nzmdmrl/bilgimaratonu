'use client'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import { playSound } from '@/lib/sound'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

interface TitleDef { min_xp: number; title: string; color: string; icon: string }

const DEFAULT_TITLES: TitleDef[] = [
  { min_xp: 0, title: 'Çaylak', color: '#B0BEC5', icon: '🌱' },
]

// Verilen XP için ünvan index'i (min_xp <= xp olan en yüksek)
function titleIndexFor(xp: number, titles: TitleDef[]): number {
  let idx = 0
  for (let i = 0; i < titles.length; i++) if (xp >= titles[i].min_xp) idx = i
  return idx
}

const CONFETTI_COLORS = ['#FFD700', '#FF7043', '#4FC3F7', '#81C784', '#E91E63', '#AB47BC', '#FFCA28', '#4DD0E1']

export default function TitleCelebration() {
  const { user } = useAuthStore()
  const [titles, setTitles] = useState<TitleDef[]>(DEFAULT_TITLES)
  const [show, setShow] = useState<TitleDef | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // İlk yüklemede kutlama yapmamak için baseline kurulduğunu izle
  const baselineSet = useRef(false)

  useEffect(() => {
    fetch(`${API}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.titles) && d.titles.length) setTitles(d.titles) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!user || !titles.length) return
    const uname = (user as any).username || 'me'
    const xp = (user as any).xp || 0
    const idx = titleIndexFor(xp, titles)
    const key = `title_idx_${uname}`
    let stored: number | null = null
    try { const v = localStorage.getItem(key); stored = v === null ? null : parseInt(v) } catch {}

    if (stored === null || isNaN(stored)) {
      // İlk kez: baseline kur, kutlama yok
      try { localStorage.setItem(key, String(idx)) } catch {}
      baselineSet.current = true
      return
    }
    if (idx > stored) {
      try { localStorage.setItem(key, String(idx)) } catch {}
      celebrate(titles[idx])
    } else if (idx < stored) {
      try { localStorage.setItem(key, String(idx)) } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, titles])

  const celebrate = (t: TitleDef) => {
    setShow(t)
    playSound('title_up')
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setShow(null), 5000)  // 5sn kalıp kapanır
  }

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])

  if (!show) return null

  const pieces = Array.from({ length: 44 })
  return (
    <div onClick={() => setShow(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(2px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', cursor: 'pointer',
      }}>
      {/* konfeti */}
      {pieces.map((_, i) => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.6
        const dur = 2.2 + Math.random() * 1.8
        const size = 7 + Math.random() * 8
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length]
        const rot = Math.random() * 360
        return (
          <span key={i} className="confetti-piece" style={{
            left: `${left}%`, width: size, height: size * 0.4, background: color,
            animationDelay: `${delay}s`, animationDuration: `${dur}s`,
            transform: `rotate(${rot}deg)`,
          }} />
        )
      })}

      <div className="title-cele-in" style={{ textAlign: 'center', padding: '0 24px', position: 'relative', zIndex: 2 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: 1, marginBottom: 8 }}>🎉 YENİ ÜNVANIN! 🎉</div>
        <div className="title-cele-icon" style={{ fontSize: 96, lineHeight: 1, filter: `drop-shadow(0 6px 20px ${show.color}aa)` }}>{show.icon}</div>
        <div className="font-black" style={{ fontSize: 40, marginTop: 8, color: show.color, textShadow: `0 0 26px ${show.color}88` }}>{show.title}</div>
        <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Kapatmak için dokun</div>
      </div>
    </div>
  )
}
