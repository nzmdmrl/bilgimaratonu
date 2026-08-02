'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

export default function BottomNav() {
  const { user } = useAuthStore()
  const pathname = usePathname()

  if (!user) return null // sadece giriş yapınca

  // Tam ekran oyun ekranlarında gizle (kontrolleri kapatmasın)
  const hidden = ['/mac', '/kategori-mac', '/turnuva', '/arena'].some(p => pathname.startsWith(p))
    || (pathname.startsWith('/testler/') && pathname !== '/testler')
    || ['/giris', '/kayit'].includes(pathname)
  if (hidden) return null

  const items = [
    { href: '/profil', icon: '👤', label: 'Profil', match: (p: string) => p.startsWith('/p/') || p === '/profil' },
    { href: '/gecmis', icon: '🕐', label: 'Geçmiş', match: (p: string) => p === '/gecmis' },
    { href: '/', icon: '🏠', label: 'Ana', center: true, match: (p: string) => p === '/' },
    { href: '/kazandiklarim', icon: '🏆', label: 'Kazandıkların', match: (p: string) => p === '/kazandiklarim' },
    { href: '/menu', icon: '☰', label: 'Menü', match: (p: string) => p === '/menu' },
  ]

  // Profil özel: kullanıcı adına git
  const hrefFor = (it: any) => (it.href === '/profil' ? `/p/${user.username}` : it.href)

  return (
    <nav className="md:hidden flex items-end justify-around" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      background: 'rgba(15,20,40,0.98)', borderTop: '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(10px)',
      padding: '6px 4px 8px', paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
    }}>
      {items.map(it => {
        const active = it.match(pathname)
        if (it.center) {
          return (
            <Link key={it.href} href={hrefFor(it)} aria-label={it.label}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textDecoration: 'none', flex: 1 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', marginTop: -22,
                background: 'linear-gradient(135deg,#4FC3F7,#1565C0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                border: '3px solid rgba(15,20,40,0.98)',
              }}>{it.icon}</div>
              <span style={{ fontSize: 10, marginTop: 2, color: active ? '#4FC3F7' : '#78909C', fontWeight: 700 }}>{it.label}</span>
            </Link>
          )
        }
        return (
          <Link key={it.href} href={hrefFor(it)} aria-label={it.label}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, textDecoration: 'none', flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 20, opacity: active ? 1 : 0.6 }}>{it.icon}</span>
            <span style={{ fontSize: 10, color: active ? '#4FC3F7' : '#78909C', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{it.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
