'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import api from '@/lib/api'

interface CategoryOpt { slug: string; name: string }
interface Winner { rank: number; username: string; avatar_url: string }
interface Period { period_key: string; label: string; winners: Winner[] }

const PERIOD_LABELS: Record<string, string> = { daily: 'Günlük', monthly: 'Aylık', yearly: 'Yıllık' }
const PAGE = 12

function rankEmoji(rank: number) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

function ArchiveInner() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<'daily' | 'monthly' | 'yearly'>(
    (searchParams.get('period') as any) || 'daily'
  )
  const [category, setCategory] = useState<string>(searchParams.get('category') || 'genel')
  const [categories, setCategories] = useState<CategoryOpt[]>([])
  const [periods, setPeriods] = useState<Period[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get('/api/league/categories')
      .then(res => setCategories(res.data.categories || []))
      .catch(() => setCategories([]))
  }, [])

  // period/kategori değişince baştan yükle
  useEffect(() => {
    setPeriods([])
    setOffset(0)
    load(0, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, category])

  const load = async (off: number, replace = false) => {
    setLoading(true)
    const q = category && category !== 'genel' ? `&category=${encodeURIComponent(category)}` : ''
    try {
      const res = await api.get(`/api/league/past-winners?period_type=${tab}&limit=${PAGE}&offset=${off}${q}`)
      const newPeriods: Period[] = res.data.periods || []
      setPeriods(prev => replace ? newPeriods : [...prev, ...newPeriods])
      setHasMore(!!res.data.has_more)
      setOffset(off + newPeriods.length)
    } catch {
      if (replace) setPeriods([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }

  const catButtons: CategoryOpt[] = [{ slug: 'genel', name: 'Genel' }, ...categories]

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="flex items-center justify-between mb-6">
        <Link href="/lig" style={{ color: 'var(--text-dim)', fontSize: 14 }}>← Lig</Link>
        <h1 className="text-2xl font-black">
          <span style={{ color: '#FFD700' }}>Lig</span>
          <span style={{ color: '#4FC3F7' }}> Arşivi</span>
        </h1>
        <span style={{ width: 40 }} />
      </div>

      {/* Dönem sekmeleri */}
      <div className="flex gap-2 mb-3">
        {(['daily', 'monthly', 'yearly'] as const).map(p => (
          <button key={p} onClick={() => setTab(p)}
            className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: tab === p ? 'rgba(79,195,247,0.2)' : 'var(--surface-2)',
              border: tab === p ? '1px solid #4FC3F7' : '1px solid var(--border)',
              color: tab === p ? '#4FC3F7' : 'var(--text-dim)',
            }}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Kategori butonları */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {catButtons.map(c => (
          <button key={c.slug} onClick={() => setCategory(c.slug)}
            className="px-3 py-1.5 rounded-lg text-sm font-bold transition-all"
            style={{
              background: category === c.slug ? 'rgba(255,215,0,0.15)' : 'var(--surface-2)',
              border: category === c.slug ? '1px solid #FFD700' : '1px solid var(--border)',
              color: category === c.slug ? '#FFD700' : 'var(--text-dim)',
            }}>
            {c.name}
          </button>
        ))}
      </div>

      {periods.length === 0 && !loading ? (
        <div className="glass p-6 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          Bu lig için geçmiş dönem kaydı yok.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          {periods.map(p => (
            <div key={p.period_key} className="glass p-4">
              <div className="text-sm font-bold mb-2" style={{ color: '#4FC3F7' }}>{p.label}</div>
              {(!p.winners || p.winners.length === 0) ? (
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>—</div>
              ) : (
                p.winners.map(w => (
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

      {hasMore && (
        <div className="text-center mt-5">
          <button onClick={() => load(offset)} disabled={loading}
            className="btn-primary px-6">
            {loading ? 'Yükleniyor...' : 'Daha Fazla'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function LeagueArchivePage() {
  return (
    <Suspense fallback={<div className="min-h-screen p-4 text-center" style={{ color: 'var(--text-dim)' }}>Yükleniyor...</div>}>
      <ArchiveInner />
    </Suspense>
  )
}
