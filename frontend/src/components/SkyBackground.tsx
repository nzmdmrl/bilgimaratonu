'use client'
import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

type Star = { top: number; left: number; size: number; delay: number; dur: number }

// Tüm ekranların arkasında gökyüzü. Kullanıcının temasını takip eder:
//  • Gündüz (light) tema  → mavi gündüz gökyüzü (güneş + beyaz bulutlar)
//  • Gece (dark) tema     → admin'in seçtiği gece modu (night/sunset/aurora/galaxy)
// Admin panelden açılıp kapatılır (ui.background_animation) ve gece modu seçilir (ui.background_theme).
export default function SkyBackground() {
  const [enabled, setEnabled] = useState(false)
  const [nightVariant, setNightVariant] = useState('night')
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [stars, setStars] = useState<Star[]>([])

  useEffect(() => {
    fetch(`${API}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => {
        const ui = d?.ui || {}
        setEnabled(ui.background_animation !== false) // varsayılan açık
        const v = ui.background_theme
        // 'day' gece modu olarak anlamsız — gündüz teması zaten mavi gökyüzü gösterir
        if (v === 'night' || v === 'sunset' || v === 'aurora' || v === 'galaxy') setNightVariant(v)
      })
      .catch(() => {})
  }, [])

  // Yıldızları client'ta üret (SSR hydration uyumsuzluğu olmasın)
  useEffect(() => {
    const arr: Star[] = []
    for (let i = 0; i < 90; i++) {
      arr.push({
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 2 + 1,
        delay: Math.random() * 6,
        dur: Math.random() * 3 + 2.5,
      })
    }
    setStars(arr)
  }, [])

  // Temayı takip et (html[data-theme]) — kullanıcı gündüz/gece değiştirince gökyüzü de değişsin
  useEffect(() => {
    const read = () => {
      const t = document.documentElement.getAttribute('data-theme')
      setTheme(t === 'light' ? 'light' : 'dark')
    }
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener('themechange', read)
    return () => { obs.disconnect(); window.removeEventListener('themechange', read) }
  }, [])

  if (!enabled) return null

  // Gündüz tema → mavi gökyüzü; gece tema → admin'in seçtiği gece modu
  const variant = theme === 'light' ? 'day' : nightVariant

  return (
    <div className={`sky-bg sky-${variant}`} aria-hidden="true">
      <span className="sun" />
      <span className="cloud c1" />
      <span className="cloud c2" />
      <span className="cloud c3" />
      <div className="sky-stars">
        {stars.map((s, i) => (
          <span
            key={i}
            className="star"
            style={{
              top: `${s.top}%`,
              left: `${s.left}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.dur}s`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
