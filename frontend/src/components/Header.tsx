'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { useEffect, useState } from 'react'

export default function Header() {
  const { user, fetchMe, logout } = useAuthStore()
  const pathname = usePathname()
  const [modules, setModules] = useState<any>({ match_1v1: true, marathon: true, league_monthly: true })
  const [version, setVersion] = useState('1.0')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      fetchMe()
      fetch('https://api.bilgimaratonu.com/api/admin/settings/public')
        .then(r => r.json())
        .then(d => {
          if (d.modules) setModules(d.modules)
          if (d.version) setVersion(d.version)
        })
        .catch(() => {})
    }
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const allLinks = [
    { href: '/mac', label: '⚡ Maç', color: '#4FC3F7', moduleKey: 'match_1v1' },
    { href: '/kategoriler', label: '🗂 Kategoriler', color: '#FFD700', moduleKey: 'match_1v1' },
    { href: '/solo', label: '🎯 Solo', color: '#81C784', moduleKey: 'match_bot' },
    { href: '/testler', label: '📝 Testler', color: '#E91E63', moduleKey: 'match_1v1' },
    { href: '/maraton', label: '🏅 Maraton', color: '#FFD700', moduleKey: 'marathon' },
    { href: '/lig', label: '🏆 Lig', color: '#81C784', moduleKey: 'league_daily' },
    { href: '/market', label: '🛒 Market', color: '#FFD700', moduleKey: 'match_1v1' },
  ]
  const navLinks = allLinks.filter(l => modules[l.moduleKey] !== false)

  return (
    <>
      <header style={{
        background: 'rgba(15,20,40,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Logo */}
          <Link href="/" className="font-black text-lg flex items-center gap-1" style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <span style={{ color: '#FFD700' }}>Bilgi</span>
            <span style={{ color: '#4FC3F7' }}> Maratonu</span>
            <span style={{ color: '#555', fontSize: 10, fontWeight: 400, marginLeft: 2 }}>v{version}</span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <Link key={link.href} href={link.href}
                className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
                style={{
                  color: pathname === link.href ? link.color : '#B0BEC5',
                  background: pathname === link.href ? link.color + '20' : 'transparent',
                }}>
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Sağ: Kullanıcı + Hamburger */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden sm:block text-sm" style={{ color: '#FFD700' }}>⭐ {user.xp}</span>
                <Link href={`/p/${user.username}`}
                  className="text-sm font-bold px-2 py-1.5 rounded-lg"
                  style={{ color: '#4FC3F7', background: 'rgba(79,195,247,0.1)' }}>
                  👤 <span className="hidden sm:inline">{user.username}</span>
                </Link>
                {user.role === 'admin' && (
                  <Link href="/admin" className="hidden md:block text-sm font-bold" style={{ color: '#E91E63' }}>⚙️</Link>
                )}
                <button onClick={logout} className="hidden md:block text-sm" style={{ color: '#B0BEC5' }}>Çıkış</button>
              </>
            ) : (
              <>
                <Link href="/giris" className="text-sm font-bold px-2 py-1.5 rounded-lg hidden sm:block"
                  style={{ color: '#B0BEC5', background: 'rgba(255,255,255,0.05)' }}>Giriş</Link>
                <Link href="/kayit" className="btn-gold text-sm hidden sm:block" style={{ padding: '5px 10px' }}>Kayıt</Link>
              </>
            )}

            {/* Hamburger — mobilde her zaman, desktop'ta gizli */}
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, padding: '5px 10px',
                color: '#B0BEC5', cursor: 'pointer', fontSize: 18, lineHeight: 1,
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
            background: 'rgba(15,20,40,0.98)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
            display: 'flex', flexDirection: 'column',
          }} onClick={e => e.stopPropagation()}>

            {user && (
              <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Link href={`/p/${user.username}`} onClick={() => setMenuOpen(false)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', textDecoration: 'none' }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #4FC3F7, #1565C0)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700,
                  }}>{user.username?.[0]?.toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{user.username}</div>
                    <div style={{ color: '#FFD700', fontSize: 12 }}>⭐ {user.xp} XP</div>
                  </div>
                </Link>
              </div>
            )}

            <div style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
              {navLinks.map(link => (
                <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'block', padding: '13px 20px',
                    color: pathname === link.href ? link.color : '#B0BEC5',
                    background: pathname === link.href ? link.color + '15' : 'transparent',
                    fontWeight: pathname === link.href ? 700 : 500,
                    fontSize: 15, textDecoration: 'none',
                    borderLeft: pathname === link.href ? `3px solid ${link.color}` : '3px solid transparent',
                  }}>
                  {link.label}
                </Link>
              ))}
            </div>

            <div style={{ padding: '12px 20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              {user ? (
                <>
                  {user.role === 'admin' && (
                    <Link href="/admin" onClick={() => setMenuOpen(false)}
                      style={{ display: 'block', color: '#E91E63', fontWeight: 700, fontSize: 14, marginBottom: 10, textDecoration: 'none' }}>
                      ⚙️ Admin Panel
                    </Link>
                  )}
                  <button onClick={() => { logout(); setMenuOpen(false) }}
                    style={{ color: '#B0BEC5', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    🚪 Çıkış Yap
                  </button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Link href="/giris" onClick={() => setMenuOpen(false)}
                    style={{ textAlign: 'center', padding: '10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: '#B0BEC5', fontWeight: 600, textDecoration: 'none' }}>
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
