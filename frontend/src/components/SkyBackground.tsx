'use client'
import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

type Star = { top: number; left: number; size: number; delay: number; dur: number }

// Tüm ekranların arkasında gece gökyüzü: parlayan yıldızlar, kayan yıldızlar, ağır bulutlar.
// Admin panelden açılıp kapatılır (ui.background_animation) ve modu seçilir (ui.background_theme).
export default function SkyBackground() {
  const [enabled, setEnabled] = useState(false)
  const [variant, setVariant] = useState('night')
  const [stars, setStars] = useState<Star[]>([])

  useEffect(() => {
    fetch(`${API}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => {
        const ui = d?.ui || {}
        setEnabled(ui.background_animation !== false) // varsayılan açık
        const v = ui.background_theme
        if (v === 'night' || v === 'day' || v === 'sunset' || v === 'aurora' || v === 'galaxy') setVariant(v)
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

  if (!enabled) return null

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
