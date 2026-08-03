'use client'
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { initSounds, playSound } from '@/lib/sound'

// Oyun/quiz ekranlarında tık sesi çalma (cevap sesleriyle karışmasın)
const GAME_ROUTES = ['/mac', '/kategori-mac', '/arena', '/turnuva', '/maraton', '/solo']

export default function ClickSound() {
  const pathname = usePathname()
  const pathRef = useRef(pathname)
  pathRef.current = pathname

  useEffect(() => {
    initSounds()
    const onClick = (e: MouseEvent) => {
      const p = pathRef.current || ''
      const isGame = GAME_ROUTES.some(r => p.startsWith(r)) || (p.startsWith('/testler/') && p !== '/testler' && p !== '/testler/olustur')
      if (isGame) return
      const t = e.target as HTMLElement | null
      if (t && t.closest('button, a, [role="button"], .btn-gold')) {
        playSound('click')
      }
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [])

  return null
}
