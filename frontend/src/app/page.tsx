'use client'
import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Link from 'next/link'

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

  useEffect(() => {
    fetchMe()
    api.get('/api/league/daily?limit=10').then(r => setLeagueTop(r.data.table)).catch(() => {})
    api.get('/api/admin/settings/public').then(r => {
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

  return (
    <div className="min-h-screen">
      <main className="max-w-5xl mx-auto px-4 py-12">

        {/* Hero */}
        <div className="text-center mb-14 animate-fade-in">
          <h2 className="text-5xl font-black mb-4">
            <span style={{ color: '#FFD700' }}>Bilginin Rekabetle</span><br />
            Buluştuğu Adres
          </h2>
          <p className="text-lg mb-8" style={{ color: '#B0BEC5' }}>
            1v1 düellolar · Solo pratik · Testler · Lig
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
                <div className="text-2xl font-black" style={{ color: '#FFD700' }}>{stat.value}</div>
                <div className="text-sm" style={{ color: '#B0BEC5' }}>{stat.label}</div>
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
              color: '#4FC3F7',
              bg: 'rgba(79,195,247,0.08)',
            },
            {
              href: '/solo',
              icon: '📚',
              title: 'Solo Pratik',
              desc: 'Kendi hızında çalış, zayıf noktalarını keşfet, sonraki maça hazırlan.',
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
                <p className="text-sm" style={{ color: '#B0BEC5', lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </Link>
          ))}

          {/* Maraton - tam genişlik */}
          {marathonEnabled && (
            <div className="col-span-1 md:col-span-2 glass p-6"
              style={{ background: 'rgba(255,215,0,0.06)', border: '1px solid rgba(255,215,0,0.2)' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-5xl">🏅</div>
                  <div>
                    <h3 className="text-xl font-black" style={{ color: '#FFD700' }}>Bilgi Maratonu</h3>
                    {marathonInfo?.status === 'waiting' || marathonInfo?.status === 'lobby' ? (
                      <p className="text-sm" style={{ color: '#B0BEC5' }}>
                        Lobi açık — {marathonInfo.current_participants || 0}/{marathonInfo.max_participants || 32} katılımcı
                      </p>
                    ) : marathonInfo?.next_at ? (
                      <p className="text-sm" style={{ color: '#B0BEC5' }}>
                        Sonraki maraton: ⏰ {new Date(new Date(marathonInfo.next_at).getTime() + 3*60*60*1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-sm" style={{ color: '#B0BEC5' }}>{marathonInfo?.max_participants || 32} kişilik turnuva — en bilgili sen misin?</p>
                    )}
                  </div>
                </div>
                <Link href="/maraton" className="btn-gold px-6 py-3 font-black">
                  {marathonInfo?.status === 'waiting' || marathonInfo?.status === 'lobby' ? '🏅 Katıl' : '🏅 Maratona Git'}
                </Link>
              </div>
            </div>
          )}

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
              color: '#FFD700',
              bg: 'rgba(255,215,0,0.08)',
            },
          ].map(card => (
            <Link key={card.href} href={card.href}
              className="glass p-7 flex gap-5 items-start hover:scale-105 transition-transform"
              style={{ background: card.bg, border: `1px solid ${card.color}22` }}>
              <div className="text-5xl flex-shrink-0">{card.icon}</div>
              <div>
                <h3 className="text-xl font-black mb-2" style={{ color: card.color }}>{card.title}</h3>
                <p className="text-sm" style={{ color: '#B0BEC5', lineHeight: 1.6 }}>{card.desc}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Özel Kategori Maçları */}
        {categories.filter((c: any) => c.has_category_match).length > 0 && (
          <div className="mb-10 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-black" style={{ color: '#FFD700' }}>⚡ Kategori Maçları</h3>
              <a href="/kategoriler" style={{ color: '#4FC3F7', fontSize: 14 }}>Tümü →</a>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {categories.filter((c: any) => c.has_category_match).map((cat: any) => (
                <a key={cat.id} href={`/kategori-mac/${cat.slug}`}
                  className="glass p-4 rounded-2xl text-center hover:scale-105 transition-transform"
                  style={{ textDecoration: 'none' }}>
                  <div className="text-3xl mb-1">{cat.icon}</div>
                  <div className="font-bold text-sm">{cat.name}</div>
                  <div className="text-xs mt-1" style={{ color: '#4FC3F7' }}>Maça Gir →</div>
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
            <h3 className="text-xl font-black mb-4" style={{ color: '#4FC3F7' }}>⚡ Son Maçlar</h3>
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
                      <div className="rounded-full flex-shrink-0 overflow-hidden" style={{ width: 36, height: 36, border: p1won ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.1)' }}>
                        {m.avatar1 ? <img src={`https://api.bilgimaratonu.com${m.avatar1}`} alt={m.player1} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-sm font-black" style={{ background: 'linear-gradient(135deg, #4FC3F7, #1565C0)' }}>{m.player1[0]?.toUpperCase()}</div>}
                      </div>
                      <div className="min-w-0">
                        <Link href={`/p/${m.player1}`} className="font-bold text-xs hover:underline block truncate"
                          style={{ color: p1won ? '#FFD700' : '#B0BEC5' }}>
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
                          style={{ color: p2won ? '#FFD700' : '#B0BEC5' }}>
                          {m.player2}{p2won ? ' 🏆' : ''}
                        </Link>
                        <div className="text-xs" style={{ color: '#555' }}>{Math.round(m.elo2 ?? 0)} ELO</div>
                      </div>
                      <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-base"
                        style={{ background: p2won ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.08)', border: p2won ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.1)' }}>
                        👤
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
            <h3 className="text-xl font-black" style={{ color: '#FFD700' }}>📅 Bugünün Ligi</h3>
            <Link href="/lig" style={{ color: '#4FC3F7', fontSize: 14 }}>Tümünü Gör →</Link>
          </div>
          {leagueTop.length > 0 ? (
            <div className="glass overflow-hidden">
              {leagueTop.map((row, i) => (
                <div key={row.username} className="flex items-center px-4 py-3"
                  style={{ borderBottom: i < leagueTop.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                  <span className="mr-3" style={{ fontSize: i < 3 ? 20 : 14, width: 32 }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`}
                  </span>
                  <Link href={`/p/${row.username}`} className="flex-1 font-bold hover:underline">
                    {row.username}
                  </Link>
                  <span className="text-sm mr-4" style={{ color: '#B0BEC5' }}>{row.days_played} gün</span>
                  <span className="font-black" style={{ color: '#FFD700' }}>{row.total_score}</span>
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
