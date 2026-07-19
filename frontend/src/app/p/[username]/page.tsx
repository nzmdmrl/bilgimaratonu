'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface Profile {
  id: string
  username: string
  xp: number
  elo_rating: number
  total_matches: number
  total_wins: number
  total_losses: number
  win_rate: number
  role: string
  created_at: string
}

interface CategoryStat {
  category: string
  slug: string
  icon: string
  total: number
  correct: number
  wrong: number
  accuracy: number
}

interface DifficultyStat {
  difficulty: string
  label: string
  total: number
  correct: number
  accuracy: number
}

interface TitleDef {
  min_xp: number
  title: string
  color: string
  icon: string
}

interface Badge {
  code: string
  name: string
  icon: string
  description: string
  category: string
  earned_at: string
}

interface MatchRecord {
  match_id: string
  opponent_username: string
  my_score: number
  opponent_score: number
  won: boolean | null
  elo_change: number
  finished_at: string
}

type Tab = 'genel' | 'istatistikler' | 'maclar' | 'rozetler'

const DIFF_COLORS: Record<string, string> = {
  easy: '#4CAF50', medium: '#FFC107', hard: '#FF7043', very_hard: '#E91E63'
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuthStore()
  const router = useRouter()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)
  const [stats, setStats] = useState<{ category_stats: CategoryStat[]; difficulty_stats: DifficultyStat[]; titles?: TitleDef[] } | null>(null)
  const [matches, setMatches] = useState<MatchRecord[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [allBadges, setAllBadges] = useState<any[]>([])
  const [achievements, setAchievements] = useState<any>(null)
  const [achTab, setAchTab] = useState<'trophy'|'medal'|'badge'>('trophy')
  const [tab, setTab] = useState<Tab>('genel')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [username])

  const loadProfile = async () => {
    setLoading(true)
    try {
      const [profileRes, statsRes, matchesRes, badgesRes, allBadgesRes, achRes] = await Promise.all([
        api.get(`/api/profile/${username}`),
        api.get(`/api/profile/${username}/stats`),
        api.get(`/api/profile/${username}/matches`),
        api.get(`/api/badges/user/${username}`),
        api.get('/api/badges/all'),
        api.get(`/api/profile/${username}/achievements`),
      ])
      setProfile(profileRes.data)
      // Kendi profilini görüyorsa pending avatarı çek
      if (user?.username === username) {
        api.get('/api/upload/my-pending-avatar').then(r => {
          setPendingAvatar(r.data.pending_avatar_url)
        }).catch(() => {})
      }
      setStats(statsRes.data)
      setMatches(matchesRes.data.matches)
      setBadges(badgesRes.data?.badges || [])
      setAllBadges(allBadgesRes.data?.badges || [])
      setAchievements(achRes.data || null)
    } catch {
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
      </div>
    )
  }

  if (!profile) return null

  const isOwnProfile = user?.username === profile.username
  // Unvanları settings'den al
  const unvanlar = stats?.titles || [
    { min_xp: 0, title: 'Çaylak', color: '#B0BEC5', icon: '🌱' },
    { min_xp: 500, title: 'Sohbetçi', color: '#4FC3F7', icon: '💬' },
    { min_xp: 2000, title: 'Mahalli Ünlü', color: '#81C784', icon: '⭐' },
    { min_xp: 5000, title: 'Şehir Efsanesi', color: '#FFD700', icon: '🏆' },
    { min_xp: 15000, title: 'Sanal Efsane', color: '#E91E63', icon: '👑' },
  ]
  const unvan = [...unvanlar].reverse().find((u: any) => profile.xp >= u.min_xp) || unvanlar[0]
  const nextUnvan = unvanlar.find((u: any) => u.min_xp > profile.xp)
  const xpProgress = nextUnvan
    ? Math.round(((profile.xp - unvan.min_xp) / (nextUnvan.min_xp - unvan.min_xp)) * 100)
    : 100

  // Radar grafik için en iyi 5 kategori
  const topCategories = stats?.category_stats
    .filter(c => c.total > 0)
    .sort((a, b) => b.accuracy - a.accuracy)
    .slice(0, 5) || []

  const weakCategories = stats?.category_stats
    .filter(c => c.total > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 2) || []

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/" style={{ color: '#B0BEC5', fontSize: 14 }}>← Ana Sayfa</Link>
      </div>

      {/* Profil Hero */}
      <div className="glass p-4 mb-4 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black overflow-hidden"
              style={{ background: 'linear-gradient(135deg, #4FC3F7, #1565C0)' }}>
              {(isOwnProfile && pendingAvatar) ? (
                <div className="relative w-full h-full">
                  <img src={`https://api.bilgimaratonu.com${pendingAvatar}`}
                    alt="avatar" className="w-full h-full object-cover opacity-60" />
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white text-center" style={{ background: 'rgba(0,0,0,0.4)', fontSize: 9 }}>
                    Onay<br/>Bekliyor
                  </div>
                </div>
              ) : (profile as any).avatar_url ? (
                <img src={`https://api.bilgimaratonu.com${(profile as any).avatar_url}`}
                  alt="avatar" className="w-full h-full object-cover" />
              ) : profile.username[0].toUpperCase()}
            </div>
          </div>

          {/* Bilgiler */}
          <div className="flex-1 w-full">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-black">{profile.username}</h1>
              <span className="text-sm px-3 py-1 rounded-full font-bold"
                style={{ background: unvan.color + '22', color: unvan.color }}>
                {unvan.title}
              </span>
              {profile.role === 'admin' && (
                <span className="text-xs px-2 py-1 rounded-full"
                  style={{ background: 'rgba(233,30,99,0.2)', color: '#E91E63' }}>
                  Admin
                </span>
              )}
            </div>
            <div className="text-sm mt-1" style={{ color: '#B0BEC5' }}>
              {profile.created_at.replace('January','Ocak').replace('February','Şubat').replace('March','Mart').replace('April','Nisan').replace('May','Mayıs').replace('June','Haziran').replace('July','Temmuz').replace('August','Ağustos').replace('September','Eylül').replace('October','Ekim').replace('November','Kasım').replace('December','Aralık')}'den beri üye
            </div>

            {/* XP Bar */}
            <div className="mt-3">
              <div className="flex justify-between text-xs mb-1" style={{ color: '#B0BEC5' }}>
                <span>⭐ {profile.xp.toLocaleString()} XP</span>
                {nextUnvan && <span>{nextUnvan.title} için {(nextUnvan.min_xp - profile.xp).toLocaleString()} XP</span>}
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <div className="h-full rounded-full transition-all" style={{
                  width: `${xpProgress}%`,
                  background: `linear-gradient(90deg, ${unvan.color}, ${nextUnvan?.color || unvan.color})`,
                }} />
              </div>
            </div>

            {/* Başarılar özeti */}
            {achievements && (
              <div className="mt-3 flex flex-wrap gap-3">
                <button onClick={() => { setTab('rozetler'); setAchTab('trophy') }}
                  className="flex items-center gap-1 px-3 py-1 rounded-full transition-all"
                  style={{ background: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.3)', fontSize: 15 }}>
                  <span style={{ fontSize: 18 }}>🏆</span>
                  <span className="font-black" style={{ color: '#FFD700' }}>{achievements.summary.trophies}</span>
                </button>
                <button onClick={() => { setTab('rozetler'); setAchTab('medal') }}
                  className="flex items-center gap-1 px-3 py-1 rounded-full transition-all"
                  style={{ background: 'rgba(176,190,197,0.12)', border: '1px solid rgba(176,190,197,0.3)', fontSize: 15 }}>
                  <span style={{ fontSize: 18 }}>🥈</span>
                  <span className="font-black" style={{ color: '#B0BEC5' }}>{achievements.summary.medals}</span>
                </button>
                <button onClick={() => { setTab('rozetler'); setAchTab('badge') }}
                  className="flex items-center gap-1 px-3 py-1 rounded-full transition-all"
                  style={{ background: 'rgba(79,195,247,0.12)', border: '1px solid rgba(79,195,247,0.3)', fontSize: 15 }}>
                  <span style={{ fontSize: 18 }}>🎖️</span>
                  <span className="font-black" style={{ color: '#4FC3F7' }}>{achievements.summary.badges}</span>
                </button>
              </div>
            )}
          </div>

          {/* Sağ taraf butonlar */}
          {isOwnProfile ? (
              <Link href="/profil-duzenle" className="btn-gold" style={{ fontSize: 14, padding: '8px 16px' }}>
                ⚙️ Profili Düzenle
              </Link>
            ) : (
              <Link href="/mac" className="btn-gold" style={{ fontSize: 14, padding: '8px 16px' }}>
                ⚡ Maç Başlat
              </Link>
            )}
        </div>
      </div>

      {/* Hızlı İstatistik Kartları */}
      <div className="grid grid-cols-2 gap-3 mb-4 md:grid-cols-4">
        {[
          { label: 'Toplam Maç', value: profile.total_matches, icon: '🎮', color: '#4FC3F7' },
          { label: 'Galibiyet %', value: `${profile.win_rate}%`, icon: '🏆', color: '#FFD700' },
          { label: 'ELO Puanı', value: profile.elo_rating, icon: '📊', color: '#81C784' },
          { label: 'Toplam XP', value: profile.xp.toLocaleString(), icon: '⭐', color: '#E91E63' },
        ].map(stat => (
          <div key={stat.label} className="glass p-4 text-center">
            <div className="text-2xl mb-1">{stat.icon}</div>
            <div className="text-xl font-black" style={{ color: stat.color }}>{stat.value}</div>
            <div className="text-xs" style={{ color: '#B0BEC5' }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'genel', label: '📋 Genel' },
          { key: 'istatistikler', label: '📊 İstatistik' },
          { key: 'maclar', label: '🎮 Maç' },
          { key: 'rozetler', label: '🏆 Başarılar' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === t.key ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
              border: tab === t.key ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
              color: tab === t.key ? '#4FC3F7' : '#B0BEC5',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* GENEL BAKIŞ */}
      {tab === 'genel' && (
        <div className="animate-fade-in space-y-4">
          {/* Maç özeti */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>Maç Özeti</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-black" style={{ color: '#4CAF50' }}>{profile.total_wins}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Galibiyet</div>
              </div>
              <div>
                <div className="text-2xl font-black" style={{ color: '#F44336' }}>{profile.total_losses}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Mağlubiyet</div>
              </div>
              <div>
                <div className="text-2xl font-black" style={{ color: '#B0BEC5' }}>
                  {profile.total_matches - profile.total_wins - profile.total_losses}
                </div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Beraberlik</div>
              </div>
            </div>
            {/* Galibiyet bar */}
            <div className="mt-4 h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(255,255,255,0.1)' }}>
              <div style={{ width: `${profile.win_rate}%`, background: '#4CAF50' }} />
              <div style={{
                width: `${profile.total_matches > 0 ? (profile.total_losses / profile.total_matches * 100) : 0}%`,
                background: '#F44336'
              }} />
            </div>
            <div className="flex justify-between text-xs mt-1" style={{ color: '#B0BEC5' }}>
              <span style={{ color: '#4CAF50' }}>%{profile.win_rate} Galibiyet</span>
              <span style={{ color: '#F44336' }}>%{profile.total_matches > 0 ? Math.round(profile.total_losses / profile.total_matches * 100) : 0} Mağlubiyet</span>
            </div>
          </div>

          {/* Güçlü kategoriler */}
          {topCategories.length > 0 && (
            <div className="glass p-5">
              <h3 className="font-bold mb-4" style={{ color: '#4CAF50' }}>💪 Güçlü Kategoriler</h3>
              <div className="space-y-3">
                {topCategories.map(cat => (
                  <div key={cat.slug} className="flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <div className="flex-1 w-full">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{cat.category}</span>
                        <span style={{ color: '#4CAF50' }}>%{cat.accuracy}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div style={{ width: `${cat.accuracy}%`, background: '#4CAF50', height: '100%', borderRadius: 999 }} />
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: '#B0BEC5' }}>{cat.total} soru</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Zayıf kategoriler */}
          {weakCategories.length > 0 && (
            <div className="glass p-5">
              <h3 className="font-bold mb-4" style={{ color: '#FF7043' }}>🎯 Geliştirme Alanları</h3>
              <div className="space-y-3">
                {weakCategories.map(cat => (
                  <div key={cat.slug} className="flex items-center gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <div className="flex-1 w-full">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{cat.category}</span>
                        <span style={{ color: '#FF7043' }}>%{cat.accuracy}</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div style={{ width: `${cat.accuracy}%`, background: '#FF7043', height: '100%', borderRadius: 999 }} />
                      </div>
                    </div>
                    <span className="text-xs" style={{ color: '#B0BEC5' }}>{cat.total} soru</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* İSTATİSTİKLER */}
      {tab === 'istatistikler' && stats && (
        <div className="animate-fade-in space-y-4">
          {/* Kategori bazlı */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>Kategori Performansı</h3>
            <div className="space-y-3">
              {stats.category_stats.map(cat => (
                <div key={cat.slug} className="flex items-center gap-3">
                  <span className="text-xl w-8">{cat.icon}</span>
                  <div className="flex-1 w-full">
                    <div className="flex justify-between text-sm mb-1">
                      <span>{cat.category}</span>
                      <span style={{ color: cat.accuracy >= 70 ? '#4CAF50' : cat.accuracy >= 40 ? '#FFC107' : '#F44336' }}>
                        %{cat.accuracy}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <div style={{
                        width: `${cat.accuracy}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: cat.accuracy >= 70 ? '#4CAF50' : cat.accuracy >= 40 ? '#FFC107' : '#F44336',
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                  </div>
                  <span className="text-xs w-20 text-right" style={{ color: '#B0BEC5' }}>
                    {cat.correct}/{cat.total}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Zorluk bazlı */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>Zorluk Seviyesi Performansı</h3>
            <div className="grid grid-cols-2 gap-3">
              {stats.difficulty_stats.map(d => (
                <div key={d.difficulty} className="rounded-xl p-4 text-center"
                  style={{ background: DIFF_COLORS[d.difficulty] + '15', border: `1px solid ${DIFF_COLORS[d.difficulty]}44` }}>
                  <div className="font-bold mb-1" style={{ color: DIFF_COLORS[d.difficulty] }}>{d.label}</div>
                  <div className="text-2xl font-black">%{d.accuracy}</div>
                  <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>{d.correct}/{d.total} doğru</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* BAŞARILAR */}
      {tab === 'rozetler' && (
        <div className="animate-fade-in space-y-4">
          {/* Alt sekme: Kupa / Madalya / Rozet */}
          <div className="flex gap-2">
            {[
              { key: 'trophy', label: '🏆 Kupalar', color: '#FFD700', count: achievements?.summary.trophies ?? 0 },
              { key: 'medal', label: '🥈 Madalyalar', color: '#B0BEC5', count: achievements?.summary.medals ?? 0 },
              { key: 'badge', label: '🎖️ Rozetler', color: '#4FC3F7', count: achievements?.summary.badges ?? 0 },
            ].map(t => (
              <button key={t.key} onClick={() => setAchTab(t.key as any)}
                className="flex-1 px-3 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: achTab === t.key ? t.color + '22' : 'rgba(255,255,255,0.05)',
                  border: achTab === t.key ? `1px solid ${t.color}` : '1px solid rgba(255,255,255,0.1)',
                  color: achTab === t.key ? t.color : '#B0BEC5',
                }}>
                {t.label} <span style={{ opacity: 0.8 }}>({t.count})</span>
              </button>
            ))}
          </div>

          {/* KUPALAR */}
          {achTab === 'trophy' && (
            <div className="glass p-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {(achievements?.trophies || []).map((t: any, i: number) => (
                  <div key={i} className="glass p-3 flex items-center gap-3"
                    style={{ opacity: t.earned ? 1 : 0.28,
                             border: t.earned ? '1px solid rgba(255,215,0,0.4)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-2xl">{t.earned ? t.icon : '🔒'}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{t.title}</div>
                      {t.earned && t.count > 1 && (
                        <div className="text-xs font-black" style={{ color: '#FFD700' }}>×{t.count}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MADALYALAR */}
          {achTab === 'medal' && (
            <div className="glass p-5">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {(achievements?.medals || []).map((m: any, i: number) => (
                  <div key={i} className="glass p-3 flex items-center gap-3"
                    style={{ opacity: m.earned ? 1 : 0.28,
                             border: m.earned ? '1px solid rgba(176,190,197,0.4)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-2xl">{m.earned ? m.icon : '🔒'}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{m.title}</div>
                      {m.earned && m.count > 1 && (
                        <div className="text-xs font-black" style={{ color: '#B0BEC5' }}>×{m.count}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ROZETLER */}
          {achTab === 'badge' && (
            <div className="glass p-5">
              <div className="grid grid-cols-2 gap-3">
                {(achievements?.badges || []).map((b: any) => (
                  <div key={b.code} className="glass p-3 flex items-center gap-3"
                    style={{ opacity: b.earned ? 1 : 0.3 }}>
                    <span className="text-2xl">{b.earned ? b.icon : '🔒'}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{b.name}</div>
                      <div className="text-xs" style={{ color: '#B0BEC5' }}>{b.description}</div>
                      {b.earned && <div className="text-xs" style={{ color: '#4CAF50' }}>✓ Kazanıldı</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {/* SON MAÇLAR */}
      {tab === 'maclar' && (
        <div className="animate-fade-in">
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>Son Maçlar</h3>
            {matches.length === 0 ? (
              <p style={{ color: '#B0BEC5' }}>Henüz maç oynanmamış.</p>
            ) : (
              <div className="space-y-3">
                {matches.map(m => (
                  <div key={m.match_id} className="flex items-center justify-between p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-center" style={{ minWidth: 48 }}>
                        <span className="text-xl">
                          {m.won === true ? '🏆' : m.won === false ? '😔' : '🤝'}
                        </span>
                        <span className="text-xs font-bold" style={{
                          color: m.won === true ? '#4CAF50' : m.won === false ? '#F44336' : '#B0BEC5'
                        }}>
                          {m.won === true ? 'Kazandın' : m.won === false ? 'Kaybettin' : 'Berabere'}
                        </span>
                      </div>
                      <div>
                        <div className="font-bold text-sm">
                          <span style={{ color: '#4FC3F7' }}>{m.my_score > 0 ? '+' : ''}{m.my_score}</span>
                          <span style={{ color: '#B0BEC5' }}> vs </span>
                          <span style={{ color: '#FF7043' }}>{m.opponent_score > 0 ? '+' : ''}{m.opponent_score}</span>
                          <span className="ml-2" style={{ color: '#B0BEC5' }}>— {m.opponent_username}</span>
                        </div>
                        <div className="text-xs" style={{ color: '#B0BEC5' }}>{m.finished_at}</div>
                      </div>
                    </div>
                    <div className="text-sm font-bold" style={{ color: m.elo_change >= 0 ? '#4CAF50' : '#F44336' }}>
                      {m.elo_change >= 0 ? '+' : ''}{m.elo_change} ELO
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
