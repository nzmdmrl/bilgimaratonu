'use client'
import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'
import { avatarSrc } from '@/lib/avatar'

interface Category { id: string; name: string; icon: string }

const FRIEND_FILTERS = [
  { key: 'all', label: 'Tümü', icon: '👥' },
  { key: 'aile', label: 'Aile', icon: '👨‍👩‍👧' },
  { key: 'is', label: 'İş', icon: '💼' },
  { key: 'yakin', label: 'Yakın', icon: '💚' },
  { key: 'diger', label: 'Diğer', icon: '👤' },
]

export default function OlusturPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()

  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [type, setType] = useState('quiz')
  const [created, setCreated] = useState<any>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [password, setPassword] = useState('')
  const [matchType, setMatchType] = useState('single')
  const [scoreboardTypes, setScoreboardTypes] = useState<string[]>(['all', 'daily', 'monthly', 'yearly'])
  const [maxParticipants, setMaxParticipants] = useState(1000)
  const [questionCount, setQuestionCount] = useState(15)
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState('mixed')
  const [distribution, setDistribution] = useState({ easy: 5, medium: 5, hard: 3, very_hard: 2 })
  const [timeLimit, setTimeLimit] = useState(30)

  // Arena davet akışı
  const [friends, setFriends] = useState<any[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedFriends, setSelectedFriends] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [friendFilter, setFriendFilter] = useState('all')

  useEffect(() => { fetchMe(); loadCategories() }, [])

  // ?arena=1 ile gelindiyse: otomatik Arena tipi + "username Arenası" başlığı + gizli
  const arenaPrefilled = useRef(false)
  useEffect(() => {
    let isArena = false
    try { isArena = new URLSearchParams(window.location.search).get('arena') === '1' } catch {}
    if (!isArena || arenaPrefilled.current || !user) return
    arenaPrefilled.current = true
    setType('arena')
    setMaxParticipants(5)
    setDistribution({ easy: 5, medium: 2, hard: 0, very_hard: 0 })
    setTimeLimit(10)
    setVisibility('hidden')
    setTitle(`${user.username} Arenası`)
  }, [user])

  const loadCategories = async () => {
    const r = await api.get('/api/solo/categories')
    const cats = r.data.categories || []
    setCategories(cats)
    // Genel Kültür otomatik işaretli gelsin
    const gk = cats.find((c: Category) => (c.name || '').toLocaleLowerCase('tr').includes('genel kültür'))
    if (gk) setSelectedCats(prev => prev.length ? prev : [gk.id])
  }

  const toggleCat = (id: string) => {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const handleCreate = async () => {
    if (!title.trim()) return alert('Test adı gerekli!')
    setLoading(true)
    try {
      const r = await api.post('/api/events/create', {
        type,
        title, description, visibility,
        password: visibility === 'private' ? password : null,
        scoreboard_type: matchType,
        scoreboard_types: scoreboardTypes,
        max_participants: maxParticipants,
        question_count: questionCount,
        category_ids: selectedCats,
        difficulty,
        distribution,
        time_limit_per_question: timeLimit,
      })
      setCreated(r.data)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const openInvite = async () => {
    setInviteOpen(true)
    try {
      const r = await api.get('/api/friends/list')
      setFriends(r.data.friends || [])
    } catch { setFriends([]) }
  }

  const joinPath = () => type === 'duel' ? `/testler/${created?.slug}` : `/arena?event=${created?.slug}`
  const shareLink = () => typeof window !== 'undefined' ? `${window.location.origin}${joinPath()}` : ''

  const sendInvites = async () => {
    setSending(true)
    try {
      if (selectedFriends.length) {
        await api.post(`/api/events/${created.slug}/invite`, { friend_ids: selectedFriends })
      }
      router.push(joinPath())
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Davet gönderilemedi')
      setSending(false)
    }
  }

  // ARENA / DÜELLO oluşturulduysa: davet + link ekranı
  if (created && (type === 'arena' || type === 'duel')) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-6 max-w-md w-full animate-fade-in">
        <div className="text-center">
          <div className="text-5xl mb-2">{type === 'duel' ? '⚔️' : '🎯'}</div>
          <h2 className="text-2xl font-black mb-1" style={{ color: '#FF7043' }}>{type === 'duel' ? 'Düello Hazır!' : 'Arena Hazır!'}</h2>
          <p className="mb-4 text-sm" style={{ color: 'var(--text-dim)' }}>{created.question_count} soru · {maxParticipants} kişilik</p>
        </div>

        {/* Paylaşım linki — link ile de katılabilirler */}
        <div className="glass p-3 mb-3">
          <p className="text-xs mb-1" style={{ color: 'var(--text-dim)' }}>Katılım linki (link ile de girebilirler):</p>
          <div className="font-mono text-xs break-all mb-2" style={{ color: 'var(--blue)' }}>{shareLink()}</div>
          <button onClick={() => { navigator.clipboard.writeText(shareLink()); alert('Link kopyalandı!') }}
            className="text-xs font-bold" style={{ color: '#FF7043' }}>📋 Linki Kopyala</button>
        </div>

        {!inviteOpen ? (
          <>
            <button onClick={openInvite} className="btn-gold w-full mb-3">
              🤝 Arkadaşlarını Davet Et
            </button>
            <button onClick={() => router.push(joinPath())}
              className="w-full glass p-3 text-sm font-bold" style={{ color: '#FF7043' }}>
              Davet etmeden {type === 'duel' ? 'düelloya' : 'arenaya'} geç →
            </button>
          </>
        ) : sending ? (
          <div className="text-center py-6">
            <div className="text-lg font-black" style={{ color: '#4CAF50' }}>✓ Davet gönderildi</div>
            <div className="text-sm mt-1" style={{ color: 'var(--text-dim)' }}>{type === 'duel' ? 'Düelloya' : 'Arenaya'} geçiliyor…</div>
          </div>
        ) : (
          <>
            <div className="glass p-3 mb-3 text-sm" style={{ color: '#FFD54F', background: 'rgba(255,213,79,0.08)' }}>
              🔒 Bu test sadece arkadaşlarınızın katılacağı şekilde ayarlandı.
            </div>
            {friends.length === 0 ? (
              <div className="text-center text-sm py-4" style={{ color: 'var(--text-dim)' }}>Henüz arkadaşın yok. Profillerden arkadaş ekleyebilirsin.</div>
            ) : (
              <>
              {/* Grup filtreleri */}
              <div className="flex gap-1 mb-2 flex-wrap">
                {FRIEND_FILTERS.map(ff => {
                  const active = friendFilter === ff.key
                  return (
                    <button key={ff.key} onClick={() => setFriendFilter(ff.key)}
                      className="text-xs px-2 py-1 rounded-full font-bold transition-all"
                      style={{
                        background: active ? 'rgba(255,112,67,0.2)' : 'var(--surface-2)',
                        border: active ? '1px solid #FF7043' : '1px solid var(--border)',
                        color: active ? '#FF7043' : 'var(--text-dim)',
                      }}>
                      {ff.icon} {ff.label}
                    </button>
                  )
                })}
              </div>
              {/* Hızlı seç: filtredeki tüm arkadaşları ekle */}
              {friendFilter !== 'all' && (
                <button onClick={() => {
                  const ids = friends.filter(f => (f.type || 'diger') === friendFilter).map(f => f.user_id)
                  setSelectedFriends(prev => Array.from(new Set([...prev, ...ids])))
                }} className="text-xs mb-2 font-bold" style={{ color: '#FF7043' }}>
                  + Bu gruptakilerin hepsini seç
                </button>
              )}
              <div className="space-y-2 mb-3" style={{ maxHeight: 260, overflowY: 'auto' }}>
                {friends.filter(f => friendFilter === 'all' || (f.type || 'diger') === friendFilter).map(f => {
                  const sel = selectedFriends.includes(f.user_id)
                  return (
                    <button key={f.user_id} onClick={() => setSelectedFriends(prev => sel ? prev.filter(x => x !== f.user_id) : [...prev, f.user_id])}
                      className="glass w-full flex items-center gap-3 p-2 transition-all"
                      style={{ border: sel ? '2px solid #4CAF50' : '1px solid var(--border)' }}>
                      <img src={avatarSrc(f.avatar_url, f.username)} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                      <span className="font-bold text-sm flex-1 text-left">{f.username}</span>
                      {sel && <span style={{ color: '#4CAF50' }}>✓</span>}
                    </button>
                  )
                })}
              </div>
              </>
            )}
            <button onClick={sendInvites} className="btn-gold w-full">
              {selectedFriends.length
                ? `Davet Et (${selectedFriends.length}) & ${type === 'duel' ? 'Düelloya' : 'Arenaya'} Geç`
                : `Davet etmeden ${type === 'duel' ? 'Düelloya' : 'Arenaya'} Geç`}
            </button>
          </>
        )}
      </div>
    </div>
  )

  if (created) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full text-center animate-fade-in">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-black mb-2" style={{ color: 'var(--gold)' }}>Test Oluşturuldu!</h2>
        <p className="mb-4 text-sm" style={{ color: 'var(--text-dim)' }}>{created.question_count} soru hazır.</p>

        <div className="glass p-4 mb-4">
          <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>Test Linki:</p>
          <div className="font-mono text-sm break-all" style={{ color: 'var(--blue)' }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/testler/${created.slug}` : ''}
          </div>
        </div>

        <button onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}/testler/${created.slug}`)
          alert('Link kopyalandı!')
        }} className="btn-gold w-full mb-3">
          📋 Linki Kopyala
        </button>
        <button onClick={() => router.push(`/testler/${created.slug}`)}
          className="w-full glass p-3 text-sm font-bold" style={{ color: 'var(--blue)' }}>
          Teste Git →
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-6 animate-fade-in">
        <h1 className="text-2xl font-black mb-6" style={{ color: 'var(--gold)' }}>📝 Test Oluştur</h1>

        {/* Temel Bilgiler */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Test Adı *</label>
          <input className="input-field w-full" placeholder="Örn: Trafik Kuralları Testi"
            value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Açıklama</label>
          <textarea className="input-field w-full" rows={2} placeholder="Test hakkında kısa bilgi..."
            value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        {/* Tip */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Test Tipi</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'quiz', label: '📝 Standart Test', desc: 'Herkes kendi hızında çözer' },
              { key: 'duel', label: '⚔️ Düello', desc: 'Max 4 kişi anlık yarışır' },
              { key: 'arena', label: '🎯 Arena', desc: 'Arkadaşlarınla eşzamanlı yarış' },
            ].map(t => (
              <button key={t.key} onClick={() => {
                setType(t.key)
                if (t.key === 'duel') { setMaxParticipants(2); setVisibility('hidden') }
                else if (t.key === 'arena') {
                  setMaxParticipants(5)
                  setDistribution({ easy: 5, medium: 2, hard: 0, very_hard: 0 })
                  setTimeLimit(10)
                  setVisibility('hidden')
                } else { setMaxParticipants(1000); setVisibility('public') }
              }}
                className="glass p-3 text-left transition-all"
                style={{
                  border: type === t.key ? '2px solid #FFD700' : '1px solid var(--border)',
                }}>
                <div className="font-bold text-sm">{t.label}</div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{t.desc}</div>
              </button>
            ))}
          </div>
          {(type === 'arena' || type === 'duel') && (
            <div className="mt-3">
              <label className="font-bold text-sm block mb-2">Kaç kişilik?</label>
              <div className={`grid gap-2 ${type === 'arena' ? 'grid-cols-4' : 'grid-cols-3'}`}>
                {(type === 'arena' ? [2, 3, 4, 5] : [2, 3, 4]).map(n => (
                  <button key={n} onClick={() => setMaxParticipants(n)}
                    className="glass p-3 text-center font-black transition-all"
                    style={{ border: maxParticipants === n ? '2px solid #FF7043' : '1px solid var(--border)', color: maxParticipants === n ? '#FF7043' : '#fff' }}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="text-xs mt-2" style={{ color: 'var(--text-dim)' }}>
                {type === 'arena'
                  ? 'Otomatik: Kolay 5 · Orta 2 soru · soru başına 10 sn. Ev sahibi 2 kişi olunca bile başlatabilir.'
                  : 'Otomatik gizli olarak işaretlendi. Görünürlükten “Genel” yaparak herkese açabilirsin.'}
              </div>
            </div>
          )}
        </div>

        {/* Görünürlük */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Görünürlük</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'public', label: '🌐 Genel', desc: 'Listede görünür' },
              { key: 'hidden', label: '🔗 Gizli', desc: 'Sadece link ile' },
              { key: 'private', label: '🔒 Şifreli', desc: 'Link + şifre' },
            ].map(v => (
              <button key={v.key} onClick={() => setVisibility(v.key)}
                className="glass p-3 text-center transition-all"
                style={{
                  border: visibility === v.key ? '2px solid #FFD700' : '1px solid var(--border)',
                }}>
                <div className="font-bold text-sm">{v.label}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>{v.desc}</div>
              </button>
            ))}
          </div>
          {visibility === 'private' && (
            <input className="input-field w-full mt-2" placeholder="Şifre girin"
              value={password} onChange={e => setPassword(e.target.value)} />
          )}
        </div>

        {/* Maç Tipi */}
        {type !== 'arena' && (
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Maç Tipi</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'single', label: '🏁 Tek Sonuç', desc: 'Her kişi 1 kez çözebilir' },
              { key: 'series', label: '🔄 Seri Maç', desc: 'Sınırsız kez oynanabilir' },
            ].map(s => (
              <button key={s.key} onClick={() => setMatchType(s.key)}
                className="glass p-3 text-left transition-all"
                style={{
                  border: matchType === s.key ? '2px solid #4FC3F7' : '1px solid var(--border)',
                }}>
                <div className="font-bold text-sm">{s.label}</div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Skor Tablosu */}
        {type !== 'arena' && (
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Skor Tablosu <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(çoklu seçim)</span></label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'all', label: '📊 Tüm Zamanlar', desc: 'Genel sıralama' },
              { key: 'daily', label: '📅 Günlük', desc: 'Günlük en iyi skor' },
              { key: 'monthly', label: '📆 Aylık', desc: 'Aylık en iyi skor' },
              { key: 'yearly', label: '🗓️ Yıllık', desc: 'Yıllık en iyi skor' },
            ].map(s => {
              const selected = scoreboardTypes.includes(s.key)
              return (
                <button key={s.key} onClick={() => setScoreboardTypes(prev =>
                  selected ? prev.filter(k => k !== s.key) : [...prev, s.key]
                )}
                  className="glass p-3 text-left transition-all"
                  style={{
                    border: selected ? '2px solid #FFD700' : '1px solid var(--border)',
                    background: selected ? 'rgba(255,215,0,0.08)' : '',
                  }}>
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-xs" style={{ color: 'var(--text-dim)' }}>{s.desc}</div>
                  {selected && <span className="text-xs" style={{ color: 'var(--gold)' }}>✓ Seçildi</span>}
                </button>
              )
            })}
          </div>
        </div>
        )}

        {/* Kategoriler */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Kategoriler <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>(boş = tümü)</span></label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map(c => (
              <button key={c.id} onClick={() => toggleCat(c.id)}
                className="glass p-2 flex items-center gap-2 text-sm transition-all"
                style={{
                  border: selectedCats.includes(c.id) ? '2px solid #4FC3F7' : '1px solid var(--border)',
                  background: selectedCats.includes(c.id) ? 'rgba(79,195,247,0.15)' : '',
                }}>
                <span>{c.icon}</span><span>{c.name}</span>
                {selectedCats.includes(c.id) && <span className="ml-auto" style={{ color: 'var(--blue)' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Soru Ayarları */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Soru Dağılımı</label>
          <div className="grid grid-cols-4 gap-2">
            {[
              { key: 'easy', label: 'Kolay' },
              { key: 'medium', label: 'Orta' },
              { key: 'hard', label: 'Zor' },
              { key: 'very_hard', label: 'Çok Zor' },
            ].map(d => (
              <div key={d.key}>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-dim)' }}>{d.label}</label>
                <input type="number" min={0} className="input-field w-full"
                  value={distribution[d.key as keyof typeof distribution]}
                  onChange={e => setDistribution(prev => ({ ...prev, [d.key]: parseInt(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
            Toplam: {Object.values(distribution).reduce((a, b) => a + b, 0)} soru
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <label className="font-bold text-sm block mb-2">Soru Başına Süre (sn)</label>
            <input type="number" className="input-field w-full" value={timeLimit}
              onChange={e => setTimeLimit(parseInt(e.target.value) || 30)} />
          </div>
          {type === 'quiz' && (
            <div>
              <label className="font-bold text-sm block mb-2">Max Katılımcı</label>
              <input type="number" className="input-field w-full" value={maxParticipants}
                onChange={e => setMaxParticipants(parseInt(e.target.value) || 1000)} />
            </div>
          )}
          {type === 'duel' && (
            <div className="glass p-3 flex items-center justify-center">
              <div className="text-center">
                <div className="font-black text-2xl" style={{ color: 'var(--gold)' }}>{maxParticipants}</div>
                <div className="text-xs" style={{ color: 'var(--text-dim)' }}>Max Katılımcı</div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleCreate} disabled={loading} className="btn-gold w-full text-lg">
          {loading ? 'Oluşturuluyor...' : '🚀 Test Oluştur'}
        </button>
        {(type === 'arena' || type === 'duel') && (
          <p className="text-xs text-center mt-3" style={{ color: 'var(--text-dim)' }}>
            ℹ️ Oluşturduktan sonraki ekranda arkadaşlarınızı davet edebilir veya test paylaşım çeşitlerini görebilirsiniz.
          </p>
        )}
      </div>
    </div>
  )
}
