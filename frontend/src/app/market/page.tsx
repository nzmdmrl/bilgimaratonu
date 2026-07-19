'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'

export default function MarketPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [myItems, setMyItems] = useState<any>({})
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) { router.push('/giris'); return }
    fetchMe()
    loadData()
    // Sayfa focus'a gelince güncelle
    const onFocus = () => loadData()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const loadData = async () => {
    try {
      const [itemsR, myR] = await Promise.all([
        api.get('/api/shop/items'),
        api.get('/api/shop/my-items'),
      ])
      setItems(itemsR.data.items || [])
      setMyItems(myR.data)
    } finally { setLoading(false) }
  }

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const buy = async (itemId: string) => {
    setBuying(itemId)
    try {
      const r = await api.post('/api/shop/buy', { item_id: itemId })
      showMsg(`Satın alındı! Kalan XP: ${r.data.remaining_xp}`, true)
      await fetchMe()
      await loadData()
    } catch (e: any) {
      showMsg(e.response?.data?.detail || 'Hata oluştu', false)
    } finally { setBuying(null) }
  }

  const equip = async (itemId: string) => {
    try {
      await api.post('/api/shop/equip', { item_id: itemId })
      showMsg('Aktif edildi!', true)
      await loadData()
    } catch (e: any) {
      showMsg(e.response?.data?.detail || 'Hata', false)
    }
  }

  const owned = new Set(myItems.purchases?.map((p: any) => p.item_id) || [])
  const jokerItems = items.filter(i => i.type === 'extra_joker')
  const colorItems = items.filter(i => i.type === 'card_color')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-black" style={{ color: '#FFD700' }}>🛒 Market</h1>
        <div className="glass px-4 py-2 font-black" style={{ color: '#FFD700' }}>
          ⭐ {user?.xp || 0} XP
        </div>
      </div>

      {msg && (
        <div className="glass p-3 mb-4 text-center font-bold animate-fade-in"
          style={{ color: msg.ok ? '#4CAF50' : '#F44336', border: `1px solid ${msg.ok ? '#4CAF50' : '#F44336'}` }}>
          {msg.ok ? '✓' : '✗'} {msg.text}
        </div>
      )}

      {/* Ekstra Joker */}
      <div className="glass p-5 mb-5">
        <h2 className="font-black text-lg mb-1" style={{ color: '#FFD700' }}>💡 Ekstra Joker</h2>
        <p className="text-sm mb-4" style={{ color: '#555' }}>Her maçta +1 joker hakkı — tekrar tekrar satın alınabilir</p>
        <div className="flex items-center gap-3 mb-3">
          <div className="glass px-4 py-2 text-sm font-bold" style={{ color: '#B0BEC5' }}>
            Şu anki ekstra joker: <span style={{ color: '#FFD700' }}>{myItems.extra_jokers || 0}</span>
          </div>
        </div>
        {jokerItems.map(item => (
          <div key={item.id} className="glass p-4 flex items-center gap-3">
            <div className="text-3xl">💡</div>
            <div className="flex-1">
              <div className="font-bold">{item.name}</div>
              <div className="text-sm" style={{ color: '#B0BEC5' }}>{item.description}</div>
              <div className="text-sm mt-1" style={{ color: '#FFD700' }}>⭐ {item.price_xp} XP</div>
            </div>
            <button onClick={() => buy(item.id)}
              disabled={buying === item.id || (user?.xp || 0) < item.price_xp}
              className="btn-gold text-sm px-4 py-2"
              style={{ opacity: (user?.xp || 0) >= item.price_xp ? 1 : 0.4 }}>
              {buying === item.id ? '...' : 'Satın Al'}
            </button>
          </div>
        ))}
      </div>

      {/* Profil Kart Renkleri */}
      {colorItems.length > 0 && <div className="glass p-5 mb-5">
        <h2 className="font-black text-lg mb-1" style={{ color: '#4FC3F7' }}>🎨 Profil Kart Rengi</h2>
        <p className="text-sm mb-4" style={{ color: '#555' }}>Maç ekranında profil kartınızın arka plan rengi</p>
        <div className="grid grid-cols-2 gap-3">
          {colorItems.map(item => {
            const isOwned = owned.has(item.id)
            const isActive = myItems.card_color === item.value
            return (
              <div key={item.id} className="glass p-4 flex items-center gap-3"
                style={{ border: isActive ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.08)' }}>
                <div className="w-10 h-10 rounded-xl flex-shrink-0"
                  style={{ background: item.value }} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm">{item.name}</div>
                  <div className="text-xs" style={{ color: '#FFD700' }}>⭐ {item.price_xp} XP</div>
                </div>
                {isActive ? (
                  <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(255,215,0,0.2)', color: '#FFD700' }}>Aktif</span>
                ) : isOwned ? (
                  <button onClick={() => equip(item.id)}
                    className="text-xs font-bold px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>
                    Kullan
                  </button>
                ) : (
                  <button onClick={() => buy(item.id)}
                    disabled={buying === item.id || (user?.xp || 0) < item.price_xp}
                    className="text-xs font-bold px-2 py-1 rounded-lg"
                    style={{
                      background: (user?.xp || 0) >= item.price_xp ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
                      color: (user?.xp || 0) >= item.price_xp ? '#FFD700' : '#555',
                    }}>
                    {buying === item.id ? '...' : 'Satın Al'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>}

    </div>
  )
}
