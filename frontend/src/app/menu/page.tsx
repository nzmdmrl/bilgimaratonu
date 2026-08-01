'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

export default function MenuPage() {
  const { user, fetchMe, logout } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    fetchMe().then(() => {
      if (!useAuthStore.getState().user) router.push('/giris')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cards: { href?: string; onClick?: () => void; icon: string; label: string; color: string }[] = [
    { href: '/profil-duzenle', icon: '⚙️', label: 'Profili Düzenle', color: '#4FC3F7' },
    { href: '/bildirimler', icon: '🔔', label: 'Bildirimler', color: '#E91E63' },
    { href: '/kazandiklarim', icon: '🏆', label: 'Kazandıkların', color: '#FFD700' },
    { href: '/gecmis', icon: '🕐', label: 'Geçmiş', color: '#81C784' },
    { href: '/lig', icon: '🏅', label: 'Lig', color: '#FFB300' },
    { href: '/market', icon: '🛒', label: 'Market', color: '#9C27B0' },
  ]
  if (user?.role === 'admin') cards.push({ href: '/admin', icon: '🛠', label: 'Admin Panel', color: '#FF7043' })

  return (
    <div className="min-h-screen px-3 pt-4" style={{ paddingBottom: 96, maxWidth: 700, margin: '0 auto' }}>
      <h1 className="text-2xl font-black mb-1"><span style={{ color: '#FFD700' }}>Bilgi</span> <span style={{ color: '#4FC3F7' }}>Maratonu</span></h1>
      <p className="text-sm mb-5" style={{ color: '#B0BEC5' }}>Menü</p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href!} className="glass flex items-center gap-3 p-4" style={{ borderRadius: 14, textDecoration: 'none' }}>
            <span className="text-2xl">{c.icon}</span>
            <span className="font-bold text-sm" style={{ color: c.color }}>{c.label}</span>
          </Link>
        ))}
      </div>

      <button onClick={() => { logout(); router.push('/') }}
        className="w-full glass p-4 flex items-center gap-3" style={{ borderRadius: 14, color: '#F44336' }}>
        <span className="text-2xl">🚪</span><span className="font-bold text-sm">Çıkış Yap</span>
      </button>
    </div>
  )
}
