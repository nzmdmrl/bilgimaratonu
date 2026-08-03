'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store'

interface LeagueRow {
  rank: number
  username: string
  total_score: number
  days_played: number
  elo_rating: number
}

interface LeagueData {
  period: string
  period_label: string
  category?: string
  table: LeagueRow[]
}

interface CategoryOpt {
  slug: string
  name: string
}

export default function LigPage() {
  const { user, fetchMe } = useAuthStore()
  const [daily, setDaily] = useState<LeagueData | null>(null)
  const [monthly, setMonthly] = useState<LeagueData | null>(null)
  const [yearly, setYearly] = useState<LeagueData | null>(null)
  const [tab, setTab] = useState<'daily' | 'monthly' | 'yearly'>('daily')
  const [loading, setLoading] = useState(true)

  // 'genel' = genel lig, aksi halde kategori slug'ı
  const [category, setCategory] = useState<string>('genel')
  const [categories, setCategories] = useState<CategoryOpt[]>([])
  const [pastWinners, setPastWinners] = useState<any[]>([])

  // Kategori listesini bir kez çek
  useEffect(() => {
    fetchMe()
    api.get('/api/league/categories')
      .then(res => setCategories(res.data.categories || []))
      .catch(() => setCategories([]))
  }, [])

  // Kategori değişince ligi yeniden yükle
  useEffect(() => {
    loadLeague(category)
  }, [category])

  // Önceki dönem kazananları (seçili dönem + kategori) — son 3 dönem
  useEffect(() => {
    const q = category && category !== 'genel' ? `&category=${encodeURIComponent(category)}` : ''
    api.get(`/api/league/past-winners?period_type=${tab}&limit=3${q}`)
      .then(res => setPastWinners(res.data.periods || []))
      .catch(() => setPastWinners([]))
  }, [tab, category])

  const loadLeague = async (cat: string) => {
    setLoading(true)
    const q = cat && cat !== 'genel' ? `?category=${encodeURIComponent(cat)}` : ''
    try {
      const [d, m, y] = await Promise.all([
        api.get(`/api/league/daily${q}`),
        api.get(`/api/league/monthly${q}`),
        api.get(`/api/league/yearly${q}`),
      ])
      setDaily(d.data)
      setMonthly(m.data)
      setYearly(y.data)
    } finally {
      setLoading(false)
    }
  }

  const data = tab === 'daily' ? daily : tab === 'monthly' ? monthly : yearly
  const myRank = data?.table.find(r => r.username === user?.username)

  const rankEmoji = (rank: number) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return `#${rank}`
  }

  // Buton grubu: Genel + kategori maçı açık kategoriler
  const catButtons: CategoryOpt[] = [{ slug: 'genel', name: 'Genel' }, ...categories]

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/" style={{ color: 'var(--text-dim)', fontSize: 14 }}>← Ana Sayfa</Link>
        <h1 className="text-2xl font-black">
          <span style={{ color: '#FFD700' }}>Lig</span>
          <span style={{ color: '#4FC3F7' }}> Tablosu</span>
        </h1>
        <div style={{ width: 80 }} />
      </div>

      {/* Kategori seçici (buton grubu) */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-2" style={{
        WebkitOverflowScrolling: 'touch',
        maskImage: 'linear-gradient(to right, black calc(100% - 40px), transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 40px), transparent 100%)',
      }}>
        {catButtons.map(c => {
          const active = category === c.slug
          return (
            <button key={c.slug} onClick={() => setCategory(c.slug)}
              className="py-2 px-4 rounded-xl font-bold transition-all flex-shrink-0 whitespace-nowrap"
              style={{
                background: active ? 'rgba(79,195,247,0.15)' : 'var(--surface-2)',
                border: active ? '1px solid #4FC3F7' : '1px solid var(--border)',
                color: active ? '#4FC3F7' : 'var(--text-dim)',
                fontSize: 14,
              }}>
              {c.name}
            </button>
          )
        })}
      </div>

      {/* Dönem seçici */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'daily', label: `📅 ${daily?.period_label || 'Günlük'}` },
          { key: 'monthly', label: `📆 ${monthly?.period_label || 'Aylık'}` },
          { key: 'yearly', label: `🗓️ ${yearly?.period_label || 'Yıllık'}` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className="flex-1 py-3 rounded-xl font-bold transition-all"
            style={{
              background: tab === t.key ? 'rgba(255,215,0,0.15)' : 'var(--surface-2)',
              border: tab === t.key ? '1px solid #FFD700' : '1px solid var(--border)',
              color: tab === t.key ? '#FFD700' : 'var(--text-dim)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Benim sıram */}
      {myRank && (
        <div className="glass p-4 mb-4 animate-fade-in"
          style={{ border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.05)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black" style={{ color: '#FFD700' }}>
                {rankEmoji(myRank.rank)}
              </span>
              <div>
                <div className="font-bold">{myRank.username} <span style={{ color: '#4FC3F7', fontSize: 12 }}>(Sen)</span></div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{myRank.days_played} gün oynadı</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-black" style={{ color: '#FFD700' }}>
                {typeof myRank.total_score === "number" ? myRank.total_score.toFixed(2) : myRank.total_score}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-dim)' }}>puan</div>
            </div>
          </div>
        </div>
      )}

      {/* Kural açıklaması */}
      <div className="glass p-3 mb-4 text-xs" style={{ color: 'var(--text-dim)' }}>
        {category === 'genel'
          ? '💡 Her gün oynadığın en yüksek genel maç puanı lig tablosuna eklenir. Her gün oyna, her gün puan kazan!'
          : '💡 Bu kategoride her gün oynadığın en yüksek maç puanı bu kategori ligine eklenir.'}
      </div>

      {/* Lig tablosu */}
      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--text-dim)' }}>Yükleniyor...</div>
      ) : (
        <div className="glass overflow-hidden">
          {/* Başlık */}
          <div className="flex items-center px-4 py-3 text-xs font-bold"
            style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 40 }}>Sıra</span>
            <span className="flex-1">Kullanıcı</span>
            <span style={{ width: 80, textAlign: 'right' }}>Gün</span>
            <span style={{ width: 100, textAlign: 'right' }}>Puan</span>
          </div>

          {data?.table.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-dim)' }}>
              Henüz bu dönemde maç oynanmamış.
            </div>
          ) : (
            data?.table.map((row, i) => {
              const isMe = row.username === user?.username
              return (
                <div key={row.username}
                  className="flex items-center px-4 py-3 transition-all"
                  style={{
                    borderBottom: '1px solid var(--border)',
                    background: isMe ? 'rgba(255,215,0,0.05)' : i % 2 === 0 ? 'transparent' : 'var(--surface-2)',
                  }}>
                  {/* Sıra */}
                  <span style={{ width: 40, fontSize: row.rank <= 3 ? 20 : 14, color: 'var(--text-dim)' }}>
                    {rankEmoji(row.rank)}
                  </span>

                  {/* Kullanıcı */}
                  <div className="flex-1">
                    <Link href={`/p/${row.username}`}
                      className="font-bold hover:underline"
                      style={{ color: isMe ? '#FFD700' : 'white' }}>
                      {row.username}
                      {isMe && <span className="ml-1 text-xs" style={{ color: '#4FC3F7' }}>(Sen)</span>}
                    </Link>
                    <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{row.elo_rating} ELO</div>
                  </div>

                  {/* Gün */}
                  <span style={{ width: 80, textAlign: 'right', color: 'var(--text-dim)', fontSize: 13 }}>
                    {row.days_played} gün
                  </span>

                  {/* Puan */}
                  <span style={{
                    width: 100,
                    textAlign: 'right',
                    fontSize: 18,
                    fontWeight: 900,
                    color: row.rank === 1 ? '#FFD700' : row.rank === 2 ? 'var(--text-dim)' : row.rank === 3 ? '#CD7F32' : 'white',
                  }}>
                    {typeof row.total_score === "number" ? row.total_score.toFixed(2) : row.total_score}
                  </span>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Önceki Dönem Kazananları */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold" style={{ color: '#FFD700' }}>🏅 Önceki Dönem Kazananları</h3>
          <Link href={`/lig/arsiv?period=${tab}&category=${category}`} className="text-sm font-bold" style={{ color: '#4FC3F7' }}>
            Arşiv →
          </Link>
        </div>
        {pastWinners.length === 0 ? (
          <div className="glass p-4 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
            Bu lig için henüz geçmiş dönem kaydı yok.
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
            {pastWinners.map((p: any) => (
              <div key={p.period_key} className="glass p-4">
                <div className="text-sm font-bold mb-2" style={{ color: '#4FC3F7' }}>{p.label}</div>
                {(!p.winners || p.winners.length === 0) ? (
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>—</div>
                ) : (
                  p.winners.map((w: any) => (
                    <div key={w.rank} className="flex items-center gap-2 py-1">
                      <span style={{ width: 24, fontSize: 16, textAlign: 'center' }}>{rankEmoji(w.rank)}</span>
                      <Link href={`/p/${w.username}`} className="font-bold hover:underline text-sm"
                        style={{ color: w.rank === 1 ? '#FFD700' : w.rank === 2 ? 'var(--text-dim)' : '#CD7F32' }}>
                        {w.username}
                      </Link>
                    </div>
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
