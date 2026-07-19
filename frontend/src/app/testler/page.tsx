'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import Link from 'next/link'

interface EventItem {
  id: string; slug: string; title: string; type: string
  visibility: string; scoreboard_type: string
  question_count: number; participant_count: number; created_at: string
  is_active: boolean
}

const SCOREBOARD_LABELS: Record<string, string> = {
  single: 'Tek Sonuç', daily: 'Günlük', monthly: 'Aylık', yearly: 'Yıllık'
}
const VISIBILITY_LABELS: Record<string, string> = {
  public: '🌐 Genel', hidden: '🔗 Gizli', private: '🔒 Şifreli'
}

export default function TestlerPage() {
  const { user } = useAuthStore()
  const [events, setEvents] = useState<EventItem[]>([])
  const [myEvents, setMyEvents] = useState<EventItem[]>([])
  const [tab, setTab] = useState<'genel' | 'benim'>('genel')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [editingEvent, setEditingEvent] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => { loadEvents() }, [])

  const loadEvents = async () => {
    setLoading(true)
    try {
      const r = await api.get('/api/events/list')
      setEvents(r.data.events)
      if (user) {
        const r2 = await api.get('/api/events/my')
        setMyEvents(r2.data.events)
      }
    } finally {
      setLoading(false)
    }
  }

  const deleteEvent = async (slug: string, title: string) => {
    if (!confirm(`"${title}" testini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) return
    setActionLoading(true)
    try {
      await api.delete(`/api/events/${slug}`)
      await loadEvents()
    } finally {
      setActionLoading(false)
    }
  }

  const archiveEvent = async (slug: string, isActive: boolean) => {
    setActionLoading(true)
    try {
      const endpoint = isActive ? 'archive' : 'restore'
      await api.patch(`/api/events/${slug}/${endpoint}`)
      await loadEvents()
    } finally {
      setActionLoading(false)
    }
  }

  const saveEdit = async () => {
    if (!editingEvent) return
    setActionLoading(true)
    try {
      await api.patch(`/api/events/${editingEvent.slug}/update`, editForm)
      setEditingEvent(null)
      await loadEvents()
    } finally {
      setActionLoading(false)
    }
  }

  const filtered = (tab === 'genel' ? events : myEvents).filter(e =>
    e.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Düzenleme Modal */}
      {editingEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="glass p-6 w-full max-w-md">
            <h3 className="font-black mb-4" style={{ color: '#FFD700' }}>✏️ Test Düzenle</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: '#B0BEC5' }}>Test Adı</label>
                <input className="input-field w-full" value={editForm.title || ''}
                  onChange={e => setEditForm((p: any) => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#B0BEC5' }}>Açıklama</label>
                <textarea className="input-field w-full" rows={2} value={editForm.description || ''}
                  onChange={e => setEditForm((p: any) => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: '#B0BEC5' }}>Görünürlük</label>
                <select className="input-field w-full" value={editForm.visibility || 'public'}
                  onChange={e => setEditForm((p: any) => ({ ...p, visibility: e.target.value }))}>
                  <option value="public">🌐 Genel</option>
                  <option value="hidden">🔗 Gizli</option>
                  <option value="private">🔒 Şifreli</option>
                </select>
              </div>
              {editForm.visibility === 'private' && (
                <div>
                  <label className="text-xs block mb-1" style={{ color: '#B0BEC5' }}>Yeni Şifre</label>
                  <input className="input-field w-full" placeholder="Boş bırakırsan değişmez"
                    onChange={e => setEditForm((p: any) => ({ ...p, password: e.target.value }))} />
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={saveEdit} disabled={actionLoading} className="btn-gold flex-1">
                {actionLoading ? 'Kaydediliyor...' : '💾 Kaydet'}
              </button>
              <button onClick={() => setEditingEvent(null)} className="flex-1 glass p-3 text-sm" style={{ color: '#B0BEC5' }}>
                İptal
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: '#FFD700' }}>📝 Testler</h1>
          <p className="text-sm" style={{ color: '#B0BEC5' }}>Testleri çöz veya kendi testini oluştur</p>
        </div>
        {user && (
          <Link href="/testler/olustur" className="btn-gold">+ Test Oluştur</Link>
        )}
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'genel', label: '🌐 Genel Testler' },
          { key: 'benim', label: '👤 Testlerim' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
            style={{
              background: tab === t.key ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
              border: tab === t.key ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
              color: tab === t.key ? '#4FC3F7' : '#B0BEC5',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Arama */}
      <input
        className="input-field w-full mb-4"
        placeholder="Test ara..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Liste */}
      {loading ? (
        <div className="text-center py-8" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
      ) : filtered.length === 0 ? (
        <div className="glass p-8 text-center" style={{ color: '#B0BEC5' }}>
          {tab === 'benim' ? (
            <>Henüz test oluşturmadınız. <Link href="/testler/olustur" style={{ color: '#4FC3F7' }}>Test Oluştur →</Link></>
          ) : 'Test bulunamadı.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(e => (
            <Link key={e.id} href={`/testler/${e.slug}`}
              className="glass p-4 flex items-center gap-4 hover:bg-white hover:bg-opacity-5 transition-all block">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{e.title}</div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-xs" style={{ color: '#B0BEC5' }}>
                    {VISIBILITY_LABELS[e.visibility]}
                  </span>
                  <span className="text-xs" style={{ color: '#4FC3F7' }}>
                    📊 {SCOREBOARD_LABELS[e.scoreboard_type]}
                  </span>
                  <span className="text-xs" style={{ color: '#B0BEC5' }}>
                    ❓ {e.question_count} soru
                  </span>
                  <span className="text-xs" style={{ color: '#B0BEC5' }}>
                    👥 {e.participant_count} çözüm
                  </span>
                  <span className="text-xs" style={{ color: '#555' }}>
                    {e.created_at}
                  </span>
                </div>
              </div>
              {tab === 'benim' ? (
                <div className="flex items-center gap-2" onClick={e => e.preventDefault()}>
                  <button onClick={() => { setEditingEvent(e); setEditForm({ title: e.title, description: '', visibility: e.visibility, scoreboard_type: e.scoreboard_type }) }}
                    className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>
                    ✏️
                  </button>
                  <button onClick={() => archiveEvent(e.slug, e.is_active)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: e.is_active ? 'rgba(255,152,0,0.2)' : 'rgba(76,175,80,0.2)',
                      color: e.is_active ? '#FF9800' : '#4CAF50' }}>
                    {e.is_active ? '📦' : '♻️'}
                  </button>
                  {user?.role === 'admin' && (
                    <button onClick={() => deleteEvent(e.slug, e.title)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                      🗑️
                    </button>
                  )}
                </div>
              ) : (
                <span style={{ color: '#4FC3F7' }}>→</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
