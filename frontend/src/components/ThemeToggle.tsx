'use client'
import { useEffect, useState } from 'react'
import { getMode, setMode, type ThemeMode } from '@/lib/theme'

const NEXT: Record<ThemeMode, ThemeMode> = { dark: 'light', light: 'auto', auto: 'dark' }
const ICON: Record<ThemeMode, string> = { dark: '🌙', light: '☀️', auto: '🌗' }
const LABEL: Record<ThemeMode, string> = { dark: 'Gece', light: 'Gündüz', auto: 'Otomatik' }

// Desktop üst menü tema geçişi — tıklayınca Gece → Gündüz → Otomatik döngüsü.
export default function ThemeToggle() {
  const [mode, setModeState] = useState<ThemeMode>('dark')

  useEffect(() => {
    setModeState(getMode('dark'))
    const onChange = () => setModeState(getMode('dark'))
    window.addEventListener('themechange', onChange)
    return () => window.removeEventListener('themechange', onChange)
  }, [])

  const cycle = () => {
    const next = NEXT[mode]
    setMode(next)
    setModeState(next)
  }

  return (
    <button
      onClick={cycle}
      aria-label={`Tema: ${LABEL[mode]}`}
      title={`Tema: ${LABEL[mode]} (değiştir)`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        background: 'var(--surface-2)',
        border: 'none', color: 'var(--text-dim)', fontSize: 16, lineHeight: 1,
        cursor: 'pointer',
      }}>
      {ICON[mode]}
    </button>
  )
}
