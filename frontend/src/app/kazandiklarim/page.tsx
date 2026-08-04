'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'

export default function KazandiklarimPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    fetchMe().then(() => {
      const u = useAuthStore.getState().user
      if (!u) { router.push('/giris'); return }
      api.get(`/api/profile/${u.username}/achievements`).then(r => setData(r.data)).catch(() => setData({ trophies: [], medals: [], badges: [] }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const trophies = (data?.trophies || []).filter((t: any) => t.earned)
  const medals = (data?.medals || []).filter((m: any) => m.earned)
  const badges = (data?.badges || []).filter((b: any) => b.earned)

  return (
    <div className="min-h-screen px-3 pt-4" style={{ paddingBottom: 96, maxWidth: 700, margin: '0 auto' }}>
      <h1 className="text-2xl font-black mb-1" style={{ color: 'var(--gold)' }}>🏆 Kazandıkların</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-dim)' }}>Kupaların, madalyaların ve rozetlerin</p>

      {!data ? (
        <div className="text-center py-10" style={{ color: 'var(--text-dim)' }}>Yükleniyor...</div>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="font-bold mb-2" style={{ color: 'var(--gold)' }}>🏆 Kupalar ({trophies.length})</h3>
            {trophies.length === 0 ? <Empty text="Henüz kupan yok" /> : (
              <div className="grid grid-cols-2 gap-2">
                {trophies.map((t: any, i: number) => <ItemCard key={i} icon={t.icon} title={t.title} count={t.count} color="#FFD700" />)}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold mb-2" style={{ color: 'var(--text-dim)' }}>🥈 Madalyalar ({medals.length})</h3>
            {medals.length === 0 ? <Empty text="Henüz madalyan yok" /> : (
              <div className="grid grid-cols-2 gap-2">
                {medals.map((m: any, i: number) => <ItemCard key={i} icon={m.icon} title={m.title} count={m.count} color="#CD7F32" />)}
              </div>
            )}
          </div>
          <div>
            <h3 className="font-bold mb-2" style={{ color: 'var(--blue)' }}>🎖 Rozetler ({badges.length})</h3>
            {badges.length === 0 ? <Empty text="Henüz rozetin yok" /> : (
              <div className="grid grid-cols-3 gap-2">
                {badges.map((b: any, i: number) => (
                  <div key={i} className="glass p-3 text-center" style={{ borderRadius: 12 }}>
                    <div className="text-3xl mb-1">{b.icon}</div>
                    <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>{b.name}</div>
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

function ItemCard({ icon, title, count, color }: { icon: string; title: string; count: number; color: string }) {
  return (
    <div className="glass p-3 flex items-center gap-2" style={{ borderRadius: 12 }}>
      <div className="text-3xl flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-xs font-bold" style={{ color }}>{title}</div>
        {count > 1 && <div className="text-xs" style={{ color: 'var(--text-dim)' }}>×{count}</div>}
      </div>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <div className="glass p-4 text-center text-sm" style={{ color: 'var(--text-dimmer)', borderRadius: 12 }}>{text}</div>
}
