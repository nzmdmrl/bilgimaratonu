'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'

const DIFF: Record<string, { label: string; color: string }> = {
  easy: { label: 'Kolay', color: '#4CAF50' },
  medium: { label: 'Orta', color: '#FFC107' },
  hard: { label: 'Zor', color: '#FF7043' },
  very_hard: { label: 'Çok Zor', color: '#E91E63' },
}
const PAGE = 30

function fmt(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function GecmisPage() {
  const { fetchMe } = useAuthStore()
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async (off: number, replace = false) => {
    setLoading(true)
    try {
      const r = await api.get(`/api/profile/me/answers?limit=${PAGE}&offset=${off}`)
      const newItems = r.data.answers || []
      setItems(prev => replace ? newItems : [...prev, ...newItems])
      setHasMore(!!r.data.has_more)
      setOffset(off + newItems.length)
    } catch { if (replace) setItems([]) } finally { setLoading(false) }
  }

  useEffect(() => {
    fetchMe().then(() => {
      if (!useAuthStore.getState().user) { router.push('/giris'); return }
      load(0, true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const optText = (it: any, letter: string | null) => {
    if (!letter) return 'Boş'
    const m: Record<string, string> = { A: it.option_a, B: it.option_b, C: it.option_c, D: it.option_d }
    return m[letter] || letter
  }

  return (
    <div className="min-h-screen px-3 pt-4" style={{ paddingBottom: 96, maxWidth: 700, margin: '0 auto' }}>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#81C784' }}>🕐 Geçmiş</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-dim)' }}>Son cevapladığın sorular</p>

      {loading && items.length === 0 ? (
        <div className="text-center py-10" style={{ color: 'var(--text-dim)' }}>Yükleniyor...</div>
      ) : items.length === 0 ? (
        <div className="glass p-8 text-center" style={{ borderRadius: 14, color: 'var(--text-dimmer)' }}>Henüz cevapladığın soru yok.</div>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => {
            const d = DIFF[it.difficulty] || { label: it.difficulty, color: '#888' }
            return (
              <div key={i} className="glass p-3 flex items-start gap-3" style={{ borderRadius: 12 }}>
                <span className="text-xl flex-shrink-0">{it.is_correct ? '✅' : '❌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{it.question_text}</div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                    Cevabın: <span style={{ color: it.is_correct ? '#4CAF50' : '#F44336' }}>{optText(it, it.selected)}</span>
                    {!it.is_correct && <> · Doğru: <span style={{ color: '#4CAF50' }}>{optText(it, it.correct_answer)}</span></>}
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-dimmer)' }}>
                    <span style={{ color: d.color }}>{d.label}</span>{it.category_name ? ` · ${it.category_name}` : ''} · {fmt(it.created_at)}
                  </div>
                </div>
              </div>
            )
          })}
          {hasMore && (
            <div className="text-center pt-2">
              <button onClick={() => load(offset)} disabled={loading} className="btn-primary px-6">
                {loading ? 'Yükleniyor...' : 'Daha Fazla'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
