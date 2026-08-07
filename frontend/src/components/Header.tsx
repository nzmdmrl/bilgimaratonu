'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { useEffect, useState } from 'react'
import NotificationBell from './NotificationBell'
import SoundToggle from './SoundToggle'
import ThemeToggle from './ThemeToggle'
import { initSounds } from '@/lib/sound'
import { avatarSrc } from '@/lib/avatar'

export default function Header() {
  const { user, fetchMe, logout } = useAuthStore()
  const pathname = usePathname()
  const router = useRouter()
  const [modules, setModules] = useState<any>({ match_1v1: true, marathon: true, league_monthly: true })
  const [version, setVersion] = useState('1.0')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileMatchHeader, setMobileMatchHeader] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      initSounds()
      fetchMe()
      fetch('https://api.bilgimaratonu.com/api/admin/settings/public')
        .then(r => r.json())
        .then(d => {
          if (d.modules) setModules(d.modules)
          if (d.version) setVersion(d.version)
          if (d.ui) setMobileMatchHeader(!!d.ui.mobile_match_header)
        })
        .catch(() => {})
    }
  }, [])

  // Maç ekranları — mobilde üst menü gizlenir (ayar kapalıysa)
  const MATCH_PREFIXES = ['/mac', '/kategori-mac', '/arena', '/turnuva', '/maraton']
  const isMatchScreen = MATCH_PREFIXES.some(p => pathname.startsWith(p))
    || (pathname.startsWith('/testler/') && pathname !== '/testler' && pathname !== '/testler/olustur')
  const hideOnMobile = isMatchScreen && !mobileMatchHeader

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const allLinks = [
    { href: '/mac', label: '⚡ Maç', color: 'var(--blue)', moduleKey: 'match_1v1' },
    { href: '/kategoriler', label: '🗂 Kategoriler', color: 'var(--gold)', moduleKey: 'match_1v1' },
    { href: '/maraton', label: '🏅 Maraton', color: '#81C784', moduleKey: 'match_bot' },
    { href: '/testler', label: '📝 Testler', color: '#E91E63', moduleKey: 'match_1v1' },
    { href: '/turnuva', label: '🏆 Turnuva', color: 'var(--gold)', moduleKey: 'marathon' },
    { href: '/lig', label: '🏆 Lig', color: '#81C784', moduleKey: 'league_daily' },
    { href: '/market', label: '🛒 Market', color: 'var(--gold)', moduleKey: 'match_1v1' },
  ]
  const navLinks = allLinks.filter(l => modules[l.moduleKey] !== false)
  // Desktop üst menü: sadece Maç, Kategoriler, Lig, Market (gerisi ana sayfada buton)
  const desktopLinks = navLinks.filter(l => ['/mac', '/kategoriler', '/lig', '/market'].includes(l.href))

  return (
    <>
      {/* Mobil maç ekranı: header gizli — küçük geri oku (az yer kaplar) */}
      {hideOnMobile && (
        <button onClick={() => { try { router.back() } catch { router.push('/') } }}
          className="md:hidden flex items-center justify-center"
          aria-label="Geri"
          style={{
            position: 'fixed', top: 6, left: 6, zIndex: 120,
            width: 34, height: 34, borderRadius: '50%',
            background: 'var(--header-bg)', border: '1px solid var(--border)',
            color: 'var(--text)', fontSize: 18, lineHeight: 1, cursor: 'pointer',
            backdropFilter: 'blur(6px)', boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          }}>
          ←
        </button>
      )}
      <header className={hideOnMobile ? 'hidden md:block' : ''} style={{
        background: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Logo */}
          <Link href="/" className="font-black text-lg flex items-center gap-1" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ color: 'var(--gold)' }}>Bilgi</span>
            <span style={{ color: 'var(--blue)' }}> Maratonu</span>
            <span style={{ color: '#555', fontSize: 10, fontWeight: 400, marginLeft: 2 }}>v{version}</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {desktopLinks.map(link => (
              <Link key={link.href} href={link.href}
                className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                style={{
                  color: pathname === link.href ? link.color : 'var(--text-dim)',
                  background: pathname === link.href ? link.color + '20' : 'transparent',
                }}>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Sağ: Kullanıcı + Hamburger */}
          <div className="flex items-center gap-2">
            {/* Sıra: ses kısma → gece/gündüz → puanlar → bildirim */}
            <SoundToggle />
            {/* Desktop tema geçişi (mobilde menü > ayarlarda mevcut) */}
            <span className="hidden md:flex"><ThemeToggle /></span>
            {user ? (
              <>
                <span className="hidden sm:block text-sm" style={{ color: 'var(--gold)' }}>💎 {user.xp}</span>
                <Link href="/maraton" className="hidden sm:block text-sm" style={{ color: 'var(--gold)', textDecoration: 'none' }} title="Maraton yıldızların">🌟 {user.solo_stars ?? 0}</Link>
                <NotificationBell />
                <Link href={`/p/${user.username}`}
                  className="text-sm font-bold px-2 py-1.5 rounded-lg"
                  style={{ color: 'var(--blue)', background: 'rgba(79,195,247,0.1)' }}>
                  👤 <span className="hidden sm:inline">{user.username}</span>
                </Link>
                {user.role === 'admin' && (
                  <Link href="/admin" className="hidden md:block text-sm font-bold" style={{ color: '#E91E63' }}>⚙️</Link>
                )}
                <button onClick={logout} className="hidden md:block text-sm" style={{ color: 'var(--text-dim)' }}>Çıkış</button>
              </>
            ) : (
              <>
                <Link href="/giris" className="text-sm font-bold px-2 py-1.5 rounded-lg hidden sm:block"
                  style={{ color: 'var(--text-dim)', background: 'var(--surface-2)' }}>Giriş</Link>
                <Link href="/kayit" className="btn-gold text-sm hidden sm:block" style={{ padding: '5px 10px' }}>Kayıt</Link>
              </>
            )}

            {/* Hamburger — mobilde her zaman, desktop'ta gizli */}
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden"
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8, padding: '5px 10px',
                color: 'var(--text-dim)', cursor: 'pointer', fontSize: 18, lineHeight: 1,
              }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </header>

      {/* Mobil Menü */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 57, right: 0, left: 0, bottom: 0,
          zIndex: 99, background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setMenuOpen(false)}>
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 260, height: '100%',
            background: 'var(--header-bg)',
            borderLeft: '1px solid var(--border)',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>

            {user && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <Link href={`/p/${user.username}`} onClick={() => setMenuOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text)', textDecoration: 'none' }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
                    <img src={avatarSrc((user as any).avatar_url, user.username)} alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{user.username}</div>
                    <div style={{ color: 'var(--gold)', fontSize: 12 }}>💎 {user.xp} XP · 🌟 {user.solo_stars ?? 0}</div>
                  </div>
                </Link>
              </div>
            )}

            <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
              {user && (
                <Link href="/bildirimler" onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'block', padding: '13px 20px',
                    color: pathname === '/bildirimler' ? '#4FC3F7' : 'var(--text-dim)',
                    background: pathname === '/bildirimler' ? '#4FC3F720' : 'transparent',
                    fontWeight: pathname === '/bildirimler' ? 700 : 500,
                    fontSize: 15, textDecoration: 'none',
                    borderLeft: pathname === '/bildirimler' ? '3px solid #4FC3F7' : '3px solid transparent',
                  }}>
                  🔔 Bildirimler
                </Link>
              )}
              {navLinks.map(link => (
                <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'block', padding: '13px 20px',
                    color: pathname === link.href ? link.color : 'var(--text-dim)',
                    background: pathname === link.href ? link.color + '15' : 'transparent',
                    fontWeight: pathname === link.href ? 700 : 500,
                    fontSize: 15, textDecoration: 'none',
                    borderLeft: pathname === link.href ? `3px solid ${link.color}` : '3px solid transparent',
                  }}>
                  {link.label}
                </Link>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
              {user ? (
                <>
                  {user.role === 'admin' && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)}
                      style={{ display: 'block', color: '#E91E63', fontWeight: 700, fontSize: 14, marginBottom: 10, textDecoration: 'none' }}>
                      ⚙️ Admin Panel
                    </Link>
                  )}
                  <button onClick={() => { logout(); setMenuOpen(false) }}
                    style={{ color: 'var(--text-dim)', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    🚪 Çıkış Yap
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Link href="/giris" onClick={() => setMenuOpen(false)}
                    style={{ textAlign: 'center', padding: '10px', borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-dim)', fontWeight: 600, textDecoration: 'none' }}>
                    Giriş Yap
                  </Link>
                  <Link href="/kayit" onClick={() => setMenuOpen(false)}
                    className="btn-gold" style={{ textAlign: 'center', textDecoration: 'none', padding: '10px' }}>
                    Kayıt Ol
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
