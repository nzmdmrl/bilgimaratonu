'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Link from 'next/link'
import { avatarSrc } from '@/lib/avatar'

interface LeagueRow {
  rank: number
  username: string
  total_score: number
  days_played: number
}





export default function HomePage() {
  const { user, fetchMe } = useAuthStore()
  const [leagueTop, setLeagueTop] = useState<LeagueRow[]>([])
  const [recentMatches, setRecentMatches] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [announcement, setAnnouncement] = useState<any>(null)
  const [marathonInfo, setMarathonInfo] = useState<any>(null)
  const [marathonEnabled, setMarathonEnabled] = useState(false)
  const [announcementClosed, setAnnouncementClosed] = useState(false)
  const [modules, setModules] = useState<any>({})
  const [titles, setTitles] = useState<any[]>([])
  const [showOzet, setShowOzet] = useState(false)
  const [today, setToday] = useState<any>(null)

  useEffect(() => {
    fetchMe()
    api.get('/api/profile/me/today').then(r => setToday(r.data)).catch(() => {})
    api.get('/api/league/daily?limit=10').then(r => setLeagueTop(r.data.table)).catch(() => {})
    api.get('/api/admin/settings/public').then(r => {
      setModules(r.data.modules || {})
      if (r.data.titles) setTitles(r.data.titles)
      if (r.data.modules?.marathon) {
        setMarathonEnabled(true)
        api.get('/api/marathon/active').then(mr => {
          if (mr.data.marathon) setMarathonInfo(mr.data.marathon)
          else api.get('/api/marathon/next').then(nr => setMarathonInfo({ next_at: nr.data.next_marathon_at }))
        }).catch(() => {})
      }
    }).catch(() => {})

    api.get('/api/announcements/active').then(r => {
      const ann = r.data.announcement
      if (ann) {
        const closed = localStorage.getItem(`ann_closed_${ann.id}`)
        if (closed) setAnnouncementClosed(true)
        setAnnouncement(ann)
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const loadMatches = () => {
      // Sekme arka plandaysa istek atma
      if (typeof document !== 'undefined' && document.hidden) return
      api.get('/api/league/recent-matches?limit=10')
        .then(r => setRecentMatches(r.data.matches || []))
        .catch(() => {})
    }
    api.get('/api/categories').then(r => setCategories(r.data || [])).catch(() => {})
    loadMatches()
    const interval = setInterval(loadMatches, 20000)
    return () => clearInterval(interval)
  }, [])

  const DEFAULT_TITLES = [
    { min_xp: 0, title: 'Çaylak', color: 'var(--text-dim)', icon: '🌱' },
    { min_xp: 500, title: 'Sohbetçi', color: 'var(--blue)', icon: '💬' },
    { min_xp: 2000, title: 'Mahalli Ünlü', color: '#81C784', icon: '⭐' },
    { min_xp: 5000, title: 'Şehir Efsanesi', color: 'var(--gold)', icon: '🏆' },
    { min_xp: 15000, title: 'Sanal Efsane', color: '#E91E63', icon: '👑' },
  ]
  const tlist: any[] = titles.length ? titles : DEFAULT_TITLES
  const xp = user?.xp || 0
  const unvan = [...tlist].reverse().find((u: any) => xp >= u.min_xp) || tlist[0]
  const nextUnvan = tlist.find((u: any) => u.min_xp > xp)
  const xpProgress = nextUnvan ? Math.min(100, Math.round(((xp - unvan.min_xp) / (nextUnvan.min_xp - unvan.min_xp)) * 100)) : 100

  const playCard = (href: string, icon: string, label: string, color: string) => (
    <Link href={href} key={href}
      className="play-card flex flex-col items-center justify-center gap-2 py-5"
      style={{
        borderRadius: 18,
        background: `linear-gradient(150deg, ${color}26, ${color}0d)`,
        border: `1px solid ${color}55`,
        boxShadow: `0 6px 18px ${color}1f`,
        textDecoration: 'none',
      }}>
      <div style={{
        width: 54, height: 54, borderRadius: 15,
        background: `linear-gradient(145deg, ${color}, ${color}b0)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 27, boxShadow: `0 4px 14px ${color}66`,
      }}>{icon}</div>
      <div className="font-black text-sm" style={{ color }}>{label}</div>
    </Link>
  )

  return (
    <div className="min-h-screen">

      {/* ─── MOBİL ─── */}
      <div className="md:hidden px-3 pt-3" style={{ paddingBottom: 96 }}>
        {user ? (
          <>
            {/* XP çizgisi + ünvan */}
            <div className="glass p-3 mb-3" style={{ borderRadius: 14 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="font-black text-sm" style={{ color: unvan.color }}>{unvan.icon} {unvan.title}</span>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>💎 {xp.toLocaleString()} XP · 🌟 {user.solo_stars ?? 0}</span>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ width: `${xpProgress}%`, height: '100%', background: 'linear-gradient(90deg,#4FC3F7,#FFD700)', borderRadius: 999, transition: 'width .4s' }} />
              </div>
              {nextUnvan && (
                <div className="text-right mt-1" style={{ fontSize: 10, color: 'var(--text-dimmer)' }}>
                  Sonraki: {nextUnvan.icon} {nextUnvan.title} ({nextUnvan.min_xp.toLocaleString()} XP)
                </div>
              )}
            </div>

            {/* Oyna */}
            <div className="font-black text-lg mb-2" style={{ color: 'var(--text)' }}>🎮 Oyna</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {playCard('/maraton', '🏅', 'Maraton', '#81C784')}
              {playCard('/mac', '⚡', '1v1 Maç', '#4FC3F7')}
            </div>

            {/* Turnuva — tam genişlik (Maraton + 1v1 altında) */}
            {marathonEnabled && (
              <Link href="/turnuva" className="block glass p-4 mb-3" style={{ borderRadius: 14, background: 'rgba(255,215,0,0.08)', border: '1px solid rgba(255,215,0,0.25)', textDecoration: 'none' }}>
                <div className="flex items-center gap-3">
                  <div className="text-4xl">🏆</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black" style={{ color: 'var(--gold)' }}>Turnuva</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>
                      {marathonInfo?.status === 'waiting' || marathonInfo?.status === 'lobby' ? 'Lobi açık — hemen katıl!' : 'Eleme usulü büyük yarış'}
                    </div>
                  </div>
                  <div className="text-2xl" style={{ color: 'var(--gold)' }}>›</div>
                </div>
              </Link>
            )}

            {/* Arena — 5 kişilik eşzamanlı */}
            {modules.arena !== false && (
              <Link href="/arena" className="block glass p-4 mb-3" style={{ borderRadius: 14, background: 'rgba(255,112,67,0.1)', border: '1px solid rgba(255,112,67,0.3)', textDecoration: 'none' }}>
                <div className="flex items-center gap-3">
                  <div className="text-4xl">🎯</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black" style={{ color: '#FF7043' }}>Arena</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>5 kişi aynı anda yarışır — en hızlı ve en doğru kazanır!</div>
                  </div>
                  <div className="text-2xl" style={{ color: '#FF7043' }}>›</div>
                </div>
              </Link>
            )}

            {/* Özel Arena — aile/arkadaş */}
            {modules.arena !== false && (
              <Link href="/testler/olustur?arena=1" className="block glass p-4 mb-3" style={{ borderRadius: 14, background: 'rgba(156,39,176,0.1)', border: '1px solid rgba(156,39,176,0.3)', textDecoration: 'none' }}>
                <div className="flex items-center gap-3">
                  <div className="text-4xl">🔒</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-black" style={{ color: '#BA68C8' }}>Özel Arena</div>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Ailen ve arkadaşlarınla yarış</div>
                  </div>
                  <div className="text-2xl" style={{ color: '#BA68C8' }}>›</div>
                </div>
              </Link>
            )}

            {/* Kategoriler — Turnuva/Arena altında tam genişlik */}
            <Link href="/kategoriler" className="block glass p-4 mb-3" style={{ borderRadius: 14, background: 'rgba(255,215,0,0.09)', border: '1px solid rgba(255,215,0,0.3)', textDecoration: 'none' }}>
              <div className="flex items-center gap-3">
                <div className="text-4xl">🗂</div>
                <div className="flex-1 min-w-0">
                  <div className="font-black" style={{ color: '#FFD700' }}>Kategoriler</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Konu konu kategori maçları ve sorular</div>
                </div>
                <div className="text-2xl" style={{ color: '#FFD700' }}>›</div>
              </div>
            </Link>

            <div className="grid grid-cols-3 gap-3 mb-3">
              {playCard('/testler', '📝', 'Testler', '#E91E63')}
              {playCard('/lig', '🏆', 'Lig', '#FFB300')}
              {playCard('/market', '🛒', 'Market', '#9C27B0')}
            </div>

            {/* Mini Oyunlar */}
            <Link href="/mini-oyunlar" className="block glass p-4 mb-3" style={{ borderRadius: 14, background: 'rgba(0,188,212,0.08)', border: '1px solid rgba(0,188,212,0.25)', textDecoration: 'none' }}>
              <div className="flex items-center gap-3">
                <div className="text-4xl">🧩</div>
                <div className="flex-1 min-w-0">
                  <div className="font-black" style={{ color: '#00BCD4' }}>Mini Oyunlar</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Bellek oyunları ve daha fazlası — yakında</div>
                </div>
                <div className="text-2xl" style={{ color: '#00BCD4' }}>›</div>
              </div>
            </Link>

            {/* Günün özeti */}
            <button onClick={() => setShowOzet(v => !v)}
              className="w-full glass p-3 mb-3 flex items-center justify-between" style={{ borderRadius: 14 }}>
              <span className="font-bold" style={{ color: 'var(--blue)' }}>📊 Günün Özeti — Son Maçlar</span>
              <span style={{ color: 'var(--text-dim)' }}>{showOzet ? '▲' : '▼'}</span>
            </button>
            {showOzet && (
              <div className="glass p-2 mb-3" style={{ borderRadius: 14 }}>
                {today && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {[
                      { l: 'Maç', v: today.matches, c: '#4FC3F7' },
                      { l: 'Galibiyet', v: today.wins, c: '#4CAF50' },
                      { l: 'Doğru', v: today.correct, c: '#FFD700' },
                      { l: 'İsabet', v: `%${today.accuracy}`, c: '#E91E63' },
                    ].map(s => (
                      <div key={s.l} className="text-center py-2 rounded-lg" style={{ background: 'var(--surface-2)' }}>
                        <div className="font-black" style={{ color: s.c, fontSize: 18 }}>{s.v}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-xs font-bold mb-1 px-1" style={{ color: 'var(--text-dim)' }}>Son Maçlar</div>
                {recentMatches.length === 0 ? (
                  <div className="text-xs text-center py-4" style={{ color: 'var(--text-dimmer)' }}>Henüz maç yok</div>
                ) : recentMatches.slice(0, 8).map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 px-1 py-1.5" style={{ fontSize: 12, borderBottom: i < 7 ? '1px solid var(--border)' : 'none' }}>
                    <img src={avatarSrc(m.avatar1, m.player1)} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                    <span className="flex-1 truncate" style={{ color: m.winner === m.player1 ? '#FFD700' : '#E0E0E0' }}>{m.player1}</span>
                    <span style={{ fontWeight: 800, color: 'var(--blue)' }}>{m.score1}-{m.score2}</span>
                    <span className="flex-1 truncate text-right" style={{ color: m.winner === m.player2 ? '#FFD700' : '#E0E0E0' }}>{m.player2}</span>
                    <img src={avatarSrc(m.avatar2, m.player2)} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <h1 className="text-2xl font-black mb-2"><span style={{ color: 'var(--gold)' }}>Bilgi</span> <span style={{ color: 'var(--blue)' }}>Maratonu</span></h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-dim)' }}>Bilginin rekabetle buluştuğu adres</p>
            <Link href="/kayit" className="btn-gold block mb-3">🚀 Hemen Başla</Link>
            <Link href="/giris" className="btn-primary block">Giriş Yap</Link>
          </div>
        )}
      </div>

      {/* ─── MASAÜSTÜ ─── */}
      <main className="max-w-5xl mx-auto px-4 py-12 hidden md:block">

        {/* Hero */}
        <div className="text-center mb-14 animate-fade-in">
          <h2 className="text-5xl font-black mb-4">
            <span style={{ color: 'var(--gold)' }}>Bilginin Rekabetle</span><br />
            Buluştuğu Adres
          </h2>
          <p className="text-lg mb-8" style={{ color: 'var(--text-dim)' }}>
            1v1 düellolar · Maraton · Testler · Lig
          </p>
          {!user && (
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/kayit" className="btn-gold" style={{ fontSize: 18, padding: '14px 36px' }}>
                🏆 Hemen Başla — Ücretsiz!
              </Link>
              <Link href="/giris" className="btn-primary" style={{ fontSize: 18, padding: '14px 36px' }}>
                Giriş Yap
              </Link>
            </div>
          )}
          {user && null}
        </div>

        {/* Duyuru */}
        {announcement && !announcementClosed && (
          <div className="mb-8 animate-fade-in rounded-2xl p-4 flex items-start gap-3 relative"
            style={{ background: announcement.bg_color, color: announcement.text_color }}>
            <div className="flex-1">
              <div className="font-black text-base">{announcement.title}</div>
              {announcement.content && (
                <div className="text-sm mt-1 opacity-90">{announcement.content}</div>
              )}
              {announcement.link_url && (
                <a href={announcement.link_url}
                  className="inline-block mt-2 text-sm font-bold underline opacity-90 hover:opacity-100">
                  {announcement.link_label || 'Daha fazla →'}
                </a>
              )}
            </div>
            <button onClick={() => {
              setAnnouncementClosed(true)
              if (announcement?.id) localStorage.setItem(`ann_closed_${announcement.id}`, '1')
            }}
              className="flex-shrink-0 text-xl font-black opacity-60 hover:opacity-100 leading-none"
              style={{ color: announcement.text_color }}>
              ✕
            </button>
          </div>
        )}

        {/* Kullanıcı istatistikleri */}
        {user && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 animate-fade-in">
            {[
              { label: 'Toplam Maç', value: user.total_matches, icon: '🎮' },
              { label: 'Galibiyet', value: user.total_wins, icon: '🏆' },
              { label: 'ELO', value: Math.round(user.elo_rating), icon: '📊' },
              { label: 'XP', value: user.xp, icon: '⭐' },
            ].map(stat => (
              <div key={stat.label} className="glass p-5 text-center">
                <div className="text-3xl mb-2">{stat.icon}</div>
                <div className="text-2xl font-black" style={{ color: 'var(--gold)' }}>{stat.value}</div>
                <div className="text-sm" style={{ color: 'var(--text-dim)' }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* 4 Ana Bölüm */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12 animate-fade-in">
          {/* 1v1 ve Solo */}
          {[
            {
              href: '/mac',
              icon: '⚡',
              title: '1v1 Maç',
              desc: 'Gerçek rakiplerle anlık bilgi yarışması. İlk doğru cevaplayan puan alır!',
              color: 'var(--blue)',
              bg: 'rgba(79,195,247,0.08)',
            },
            {
              href: '/maraton',
              icon: '🏅',
              title: 'Maraton',
              desc: 'Seviye seviye ilerle, yıldız topla, bilgini geliştir.',
              color: '#81C784',
              bg: 'rgba(129,199,132,0.08)',
            },
          ].map(card => (
            <Link key={card.href} href={card.href}
              className="glass p-7 flex gap-5 items-start hover:scale-105 transition-transform"
              style={{ background: card.bg, border: `1px solid ${card.color}22` }}>
              <div className="text-5xl flex-shrink-0">{card.icon}</div>
              <div>
                <h3 className="text-xl font-black mb-2" style={{ color: card.color }}>{card.title}</h3>
                <p className="text-sm" style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </Link>
          ))}

          {/* Maraton - tam genişlik */}
          {marathonEnabled && (
            <div className="col-span-1 md:col-span-2 glass p-6"
              style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-5xl">🏆</div>
                  <div>
                    <h3 className="text-xl font-black" style={{ color: 'var(--gold)' }}>Turnuva</h3>
                    {marathonInfo?.status === 'waiting' || marathonInfo?.status === 'lobby' ? (
                      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                        Lobi açık — {marathonInfo.current_participants || 0}/{marathonInfo.max_participants || 32} katılımcı
                      </p>
                    ) : marathonInfo?.next_at ? (
                      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>
                        Sonraki turnuva: ⏰ {new Date(new Date(marathonInfo.next_at).getTime() + 3*60*60*1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--text-dim)' }}>{marathonInfo?.max_participants || 32} kişilik turnuva — en bilgili sen misin?</p>
                    )}
                  </div>
                </div>
                <Link href="/turnuva" className="btn-gold px-6 py-3 font-black">
                  {marathonInfo?.status === 'waiting' || marathonInfo?.status === 'lobby' ? '🏆 Katıl' : '🏆 Turnuvaya Git'}
                </Link>
              </div>
            </div>
          )}

          {/* Arena - tam genişlik */}
          {modules.arena !== false && (
            <div className="col-span-1 md:col-span-2 glass p-6"
              style={{ background: 'rgba(255,112,67,0.07)', border: '1px solid rgba(255,112,67,0.25)' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-5xl">🎯</div>
                  <div>
                    <h3 className="text-xl font-black" style={{ color: '#FF7043' }}>Arena</h3>
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>5 kişi aynı anda yarışır — en hızlı ve en doğru kazanır! Kupa ve madalya seni bekliyor.</p>
                  </div>
                </div>
                <Link href="/arena" className="btn-gold px-6 py-3 font-black" style={{ background: 'linear-gradient(135deg,#FF7043,#FF5722)' }}>
                  🎯 Arenaya Gir
                </Link>
              </div>
            </div>
          )}

          {/* Özel Arena — aile/arkadaş */}
          {modules.arena !== false && (
            <div className="col-span-1 md:col-span-2 glass p-6"
              style={{ background: 'rgba(156,39,176,0.07)', border: '1px solid rgba(156,39,176,0.25)' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-5xl">🔒</div>
                  <div>
                    <h3 className="text-xl font-black" style={{ color: '#BA68C8' }}>Özel Arena</h3>
                    <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Ailen ve arkadaşlarınla yarış</p>
                  </div>
                </div>
                <Link href="/testler/olustur?arena=1" className="btn-gold px-6 py-3 font-black" style={{ background: 'linear-gradient(135deg,#AB47BC,#8E24AA)' }}>
                  🔒 Özel Arena Kur
                </Link>
              </div>
            </div>
          )}

          {/* Kategoriler — Turnuva/Arena altında tam genişlik */}
          <div className="col-span-1 md:col-span-2 glass p-6"
            style={{ background: 'rgba(255,215,0,0.07)', border: '1px solid rgba(255,215,0,0.25)' }}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="text-5xl">🗂</div>
                <div>
                  <h3 className="text-xl font-black" style={{ color: '#FFD700' }}>Kategoriler</h3>
                  <p className="text-sm" style={{ color: 'var(--text-dim)' }}>Konu konu kategori maçları — güçlü olduğun alanda yarış!</p>
                </div>
              </div>
              <Link href="/kategoriler" className="btn-gold px-6 py-3 font-black">
                🗂 Kategorilere Git
              </Link>
            </div>
          </div>

          {/* Testler ve Lig */}
          {[
            {
              href: '/testler',
              icon: '📝',
              title: 'Testler',
              desc: 'Kendi testini oluştur veya başkalarının testlerini çöz. Arkadaşlarınla yarış!',
              color: '#FF9800',
              bg: 'rgba(255,152,0,0.08)',
            },
            {
              href: '/lig',
              icon: '🏆',
              title: 'Lig',
              desc: 'Günlük, aylık ve yıllık liglerde sıralamalara gir. En iyi ol!',
              color: 'var(--gold)',
              bg: 'rgba(255,215,0,0.08)',
            },
            {
              href: '/mini-oyunlar',
              icon: '🧩',
              title: 'Mini Oyunlar',
              desc: 'Bellek oyunları, hızlı sorular ve daha fazlası — yakında!',
              color: '#00BCD4',
              bg: 'rgba(0,188,212,0.08)',
            },
            {
              href: '/market',
              icon: '🛒',
              title: 'Market',
              desc: 'Jokerler, avatarlar ve özel eşyalarla oyununu güçlendir.',
              color: '#9C27B0',
              bg: 'rgba(156,39,176,0.08)',
            },
          ].map(card => (
            <Link key={card.href} href={card.href}
              className="glass p-7 flex gap-5 items-start hover:scale-105 transition-transform"
              style={{ background: card.bg, border: `1px solid ${card.color}22` }}>
              <div className="text-5xl flex-shrink-0">{card.icon}</div>
              <div>
                <h3 className="text-xl font-black mb-2" style={{ color: card.color }}>{card.title}</h3>
                <p className="text-sm" style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Özel Kategori Maçları */}
        {categories.filter((c: any) => c.has_category_match).length > 0 && (
          <div className="mb-10 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black" style={{ color: 'var(--gold)' }}>⚡ Kategori Maçları</h3>
              <a href="/kategoriler" style={{ color: 'var(--blue)', fontSize: 14 }}>Tümü →</a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {categories.filter((c: any) => c.has_category_match).map((cat: any) => (
                <a key={cat.id} href={`/kategori-mac/${cat.slug}`}
                  className="glass p-4 rounded-2xl text-center hover:scale-105 transition-transform"
                  style={{ textDecoration: 'none' }}>
                  <div className="text-3xl mb-1">{cat.icon}</div>
                  <div className="font-bold text-sm">{cat.name}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--blue)' }}>Maça Gir →</div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Son Maçlar + Günlük Lig yan yana */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12 animate-fade-in">

        {/* Sol: Son Maçlar */}
        {recentMatches.length > 0 && (
          <div>
            <h3 className="text-xl font-black mb-4" style={{ color: 'var(--blue)' }}>⚡ Son Maçlar</h3>
            <div className="space-y-2 overflow-hidden" style={{ maxHeight: 380 }}>
              {recentMatches.map((m: any, i: number) => {
                const p1won = m.winner === m.player1
                const p2won = m.winner === m.player2
                const isDraw = !m.winner
                return (
                  <div key={m.match_id} className="glass p-3 flex items-center gap-2 animate-fade-in"
                    style={{ transition: 'all 0.3s ease' }}>

                    {/* Sol oyuncu */}
                    <div className="flex items-center gap-2" style={{ width: '40%' }}>
                      <div className="rounded-full flex-shrink-0 overflow-hidden" style={{ width: 36, height: 36, border: p1won ? '2px solid #FFD700' : '2px solid var(--border)' }}>
                        <img src={avatarSrc(m.avatar1, m.player1)} alt={m.player1} className="w-full h-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <Link href={`/p/${m.player1}`} className="font-bold text-xs hover:underline block truncate"
                          style={{ color: p1won ? '#FFD700' : 'var(--text-dim)' }}>
                          {p1won ? '🏆 ' : ''}{m.player1}
                        </Link>
                        <div className="text-xs" style={{ color: '#555' }}>{Math.round(m.elo1 ?? 0)} ELO</div>
                      </div>
                    </div>

                    {/* Orta skor */}
                    <div className="text-center flex-shrink-0" style={{ width: '20%' }}>
                      <div className="font-black text-base">
                        <span style={{ color: p1won ? '#FFD700' : '#4FC3F7' }}>{m.score1 ?? 0}</span>
                        <span style={{ color: '#333' }}>:</span>
                        <span style={{ color: p2won ? '#FFD700' : '#FF7043' }}>{m.score2 ?? 0}</span>
                      </div>
                      <div className="text-xs" style={{ color: '#444' }}>{m.finished_at?.split(' ')[1]}</div>
                    </div>

                    {/* Sağ oyuncu */}
                    <div className="flex items-center gap-2 justify-end" style={{ width: '40%' }}>
                      <div className="min-w-0 text-right">
                        <Link href={`/p/${m.player2}`} className="font-bold text-xs hover:underline block truncate"
                          style={{ color: p2won ? '#FFD700' : 'var(--text-dim)' }}>
                          {m.player2}{p2won ? ' 🏆' : ''}
                        </Link>
                        <div className="text-xs" style={{ color: '#555' }}>{Math.round(m.elo2 ?? 0)} ELO</div>
                      </div>
                      <div className="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden"
                        style={{ border: p2won ? '2px solid #FFD700' : '2px solid var(--border)' }}>
                        <img src={avatarSrc(m.avatar2, m.player2)} alt={m.player2} className="w-full h-full object-cover" />
                      </div>
                    </div>

                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Sağ: Günlük Lig */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-black" style={{ color: 'var(--gold)' }}>📅 Bugünün Ligi</h3>
            <Link href="/lig" style={{ color: 'var(--blue)', fontSize: 14 }}>Tümünü Gör →</Link>
          </div>
          {leagueTop.length > 0 ? (
            <div className="glass overflow-hidden">
              {leagueTop.map((row, i) => (
                <div key={row.username} className="flex items-center px-4 py-3"
                  style={{ borderBottom: i < leagueTop.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span className="mr-3" style={{ fontSize: i < 3 ? 20 : 14, width: 32 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                  </span>
                  <Link href={`/p/${row.username}`} className="flex-1 font-bold hover:underline">
                    {row.username}
                  </Link>
                  <span className="text-sm mr-4" style={{ color: 'var(--text-dim)' }}>{row.days_played} gün</span>
                  <span className="font-black" style={{ color: 'var(--gold)' }}>{row.total_score}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="glass p-8 text-center" style={{ color: '#555' }}>
              Bugün henüz maç oynanmadı
            </div>
          )}
        </div>

        </div>

      </main>
    </div>
  )
}
