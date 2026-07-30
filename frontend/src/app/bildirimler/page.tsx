'use client'
import { useEffect, useState } from 'react'
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
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

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
      <h1 className="font-black text-2xl" style={{ color: '#fff', marginBottom: 4 }}>
        🔔 Bildirimler
      </h1>
      <p style={{ color: '#B0BEC5', fontSize: 14, marginBottom: 20 }}>
        Kazandığın kupa ve madalyalar
      </p>

      {loading ? (
        <div className="text-center py-10" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
      ) : !user ? (
        <div className="glass text-center" style={{ padding: 32, color: '#B0BEC5', borderRadius: 12 }}>
          Bildirimleri görmek için giriş yapmalısın.
        </div>
      ) : notifs.length === 0 ? (
        <div className="glass text-center" style={{ padding: 32, color: '#B0BEC5', borderRadius: 12 }}>
          Henüz bildiriminiz yok.
        </div>
      ) : (
        <div className="glass" style={{ borderRadius: 12, overflow: 'hidden' }}>
          {notifs.map((n, i) => (
            <div key={n.id}
              className="flex items-start gap-3 px-4 py-3"
              style={{
                borderBottom: i < notifs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                background: n.is_read ? 'transparent' : 'rgba(79,195,247,0.06)',
              }}>
              <div style={{ fontSize: 26, lineHeight: 1, marginTop: 2 }}>{iconFor(n)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>{n.title}</div>
                <div style={{ color: '#B0BEC5', fontSize: 13, marginTop: 2 }}>{n.message}</div>
                <div style={{ color: '#607D8B', fontSize: 11, marginTop: 6 }}>{formatDate(n.created_at)}</div>
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
