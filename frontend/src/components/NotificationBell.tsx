'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import { playSound } from '@/lib/sound'

export default function NotificationBell() {
  const { user } = useAuthStore()
  const pathname = usePathname()
  const [count, setCount] = useState(0)
  const prevCount = useRef<number | null>(null)

  const loadCount = () => {
    api.get('/api/notifications/unread-count')
      .then(r => {
        const c = r.data.count || 0
        // Sayı arttıysa (yeni bildirim) ses çal — ilk yüklemede çalma
        if (prevCount.current !== null && c > prevCount.current) {
          playSound('notification')
        }
        prevCount.current = c
        setCount(c)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!user) { setCount(0); return }
    loadCount()
    const id = setInterval(loadCount, 60000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Bildirimler sayfasına girince badge anında sıfırlansın
  useEffect(() => {
    if (pathname === '/bildirimler') setCount(0)
  }, [pathname])

  if (!user) return null

  return (
    <Link href="/bildirimler"
      aria-label="Bildirimler"
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        background: 'var(--surface-2)',
        color: 'var(--text-dim)', fontSize: 18, lineHeight: 1,
        textDecoration: 'none',
      }}>
      🔔
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4,
          minWidth: 17, height: 17, padding: '0 4px',
          borderRadius: 9,
          background: '#E91E63', color: 'var(--text)',
          fontSize: 10, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1,
        }}>
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
}
