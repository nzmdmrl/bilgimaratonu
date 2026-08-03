'use client'
import { useEffect } from 'react'
import { getMode, applyTheme, hasUserChoice } from '@/lib/theme'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

export default function ThemeProvider() {
  useEffect(() => {
    // Kullanıcı seçimi varsa onu uygula; yoksa varsayılan gece + admin varsayılanını çek
    if (hasUserChoice()) {
      applyTheme(getMode('dark'))
    } else {
      applyTheme('dark') // varsayılan gece
      fetch(`${API}/api/admin/settings/public`)
        .then(r => r.json())
        .then(d => {
          const def = d?.ui?.default_theme
          if (!hasUserChoice() && (def === 'light' || def === 'dark' || def === 'auto')) applyTheme(def)
        })
        .catch(() => {})
    }
    // otomatik mod: saat ilerledikçe yeniden değerlendir
    const iv = setInterval(() => { if (getMode('dark') === 'auto') applyTheme('auto') }, 60000)
    const onChange = () => applyTheme(getMode('dark'))
    window.addEventListener('themechange', onChange)
    return () => { clearInterval(iv); window.removeEventListener('themechange', onChange) }
  }, [])
  return null
}
