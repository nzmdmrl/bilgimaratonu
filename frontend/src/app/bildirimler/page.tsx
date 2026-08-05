'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'

interface Notif {
  id: string
  type: string
  title: string
  message: string
  data?: { rank?: number; [k: string]: any }
  is_read: boolean
  created_at: string | null
}

function iconFor(n: Notif): string {
  if (n.type === 'trophy') return '🏆'
  if (n.type === 'medal') return n.data?.rank === 3 ? '🥉' : '🥈'
  if (n.type === 'friend_request' || n.type === 'friend_accepted') return '🤝'
  if (n.type === 'arena_invite') return '🎯'
  if (n.type === 'duel_invite') return '⚔️'
  if (n.type === 'title') return n.data?.icon || '🎉'
  return '🔔'
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function BildirimlerPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [acted, setActed] = useState<Record<string, 'accepted' | 'rejected'>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const handleInvite = async (n: Notif, action: 'accept' | 'reject') => {
    const slug = n.data?.slug
    if (!slug) return
    const isDuel = n.type === 'duel_invite'
    if (action === 'accept') { router.push(isDuel ? `/testler/${slug}` : `/arena?event=${slug}`); return }
    setBusy(n.id)
    try {
      await api.post(`/api/events/${slug}/decline`)
      setActed(a => ({ ...a, [n.id]: 'rejected' }))
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'İşlem başarısız.')
    } finally { setBusy(null) }
  }

  const handleFriend = async (n: Notif, action: 'accept' | 'reject') => {
    const fid = n.data?.friendship_id
    if (!fid) return
    setBusy(n.id)
    try {
      await api.post(`/api/friends/${action}/${fid}`)
      setActed(a => ({ ...a, [n.id]: action === 'accept' ? 'accepted' : 'rejected' }))
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'İşlem başarısız.')
    } finally { setBusy(null) }
  }

  useEffect(() => {
    fetchMe()
    api.get('/api/notifications/')
      .then(res => setNotifs(res.data.notifications || []))
      .catch(() => setNotifs([]))
      .finally(() => setLoading(false))
    // Sayfa açılınca hepsini okundu işaretle (badge sıfırlansın)
    api.post('/api/notifications/read-all').catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="animate-fade-in" style={{ maxWidth: 700, margin: '0 auto', padding: '24px 16px' }}>
      <h1 className="font-black text-2xl" style={{ color: 'var(--text)', marginBottom: 4 }}>
        🔔 Bildirimler
      </h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 20 }}>
        Kazandığın kupa ve madalyalar
      </p>

      {loading ? (
        <div className="text-center py-10" style={{ color: 'var(--text-dim)' }}>Yükleniyor...</div>
      ) : !user ? (
        <div className="glass text-center" style={{ padding: 32, color: 'var(--text-dim)', borderRadius: 12 }}>
          Bildirimleri görmek için giriş yapmalısın.
        </div>
      ) : notifs.length === 0 ? (
        <div className="glass text-center" style={{ padding: 32, color: 'var(--text-dim)', borderRadius: 12 }}>
          Henüz bildiriminiz yok.
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 12, overflow: 'hidden' }}>
          {notifs.map((n, i) => (
            <div key={n.id}
              onClick={n.type === 'title' ? () => router.push(`/p/${n.data?.username || user?.username || ''}`) : undefined}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                borderBottom: i < notifs.length - 1 ? '1px solid var(--border)' : 'none',
                background: n.is_read ? 'transparent' : 'rgba(79,195,247,0.06)',
                cursor: n.type === 'title' ? 'pointer' : 'default',
              }}>
              <div style={{ fontSize: 26, lineHeight: 1, marginTop: 2 }}>{iconFor(n)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 15 }}>{n.title}</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>{n.message}</div>
                <div style={{ color: 'var(--text-dimmer)', fontSize: 11, marginTop: 6 }}>{formatDate(n.created_at)}</div>
                {n.type === 'friend_request' && (
                  acted[n.id] ? (
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: acted[n.id] === 'accepted' ? '#4CAF50' : 'var(--text-dim)' }}>
                      {acted[n.id] === 'accepted' ? '✓ Kabul edildi' : 'Reddedildi'}
                    </div>
                  ) : (
                    <div className="flex gap-2" style={{ marginTop: 10 }}>
                      <button onClick={() => handleFriend(n, 'accept')} disabled={busy === n.id}
                        className="font-bold" style={{ fontSize: 13, padding: '6px 14px', borderRadius: 10, background: 'rgba(76,175,80,0.2)', border: '1px solid #4CAF50', color: '#4CAF50' }}>
                        ✓ Kabul Et
                      </button>
                      <button onClick={() => handleFriend(n, 'reject')} disabled={busy === n.id}
                        className="font-bold" style={{ fontSize: 13, padding: '6px 14px', borderRadius: 10, background: 'rgba(244,67,54,0.12)', border: '1px solid rgba(244,67,54,0.4)', color: '#F44336' }}>
                        Reddet
                      </button>
                    </div>
                  )
                )}
                {(n.type === 'arena_invite' || n.type === 'duel_invite') && (
                  acted[n.id] === 'rejected' ? (
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, color: 'var(--text-dim)' }}>Reddedildi</div>
                  ) : (
                    <div className="flex gap-2" style={{ marginTop: 10 }}>
                      <button onClick={() => handleInvite(n, 'accept')} disabled={busy === n.id}
                        className="font-bold" style={{ fontSize: 13, padding: '6px 14px', borderRadius: 10, background: 'rgba(255,112,67,0.2)', border: '1px solid #FF7043', color: '#FF7043' }}>
                        {n.type === 'duel_invite' ? '⚔️' : '🎯'} Kabul Et & Katıl
                      </button>
                      <button onClick={() => handleInvite(n, 'reject')} disabled={busy === n.id}
                        className="font-bold" style={{ fontSize: 13, padding: '6px 14px', borderRadius: 10, background: 'rgba(244,67,54,0.12)', border: '1px solid rgba(244,67,54,0.4)', color: '#F44336' }}>
                        Reddet
                      </button>
                    </div>
                  )
                )}
              </div>
              {!n.is_read && (
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: '#4FC3F7', marginTop: 6, flexShrink: 0,
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
