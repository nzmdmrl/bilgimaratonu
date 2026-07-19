'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import { useRouter } from 'next/navigation'

interface Category { id: string; name: string; icon: string }

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
  const [scoreboardTypes, setScoreboardTypes] = useState<string[]>(['all'])
  const [maxParticipants, setMaxParticipants] = useState(1000)
  const [questionCount, setQuestionCount] = useState(15)
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState('mixed')
  const [distribution, setDistribution] = useState({ easy: 5, medium: 5, hard: 3, very_hard: 2 })
  const [timeLimit, setTimeLimit] = useState(30)

  useEffect(() => { fetchMe(); loadCategories() }, [])

  const loadCategories = async () => {
    const r = await api.get('/api/solo/categories')
    setCategories(r.data.categories)
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

  if (created) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full text-center animate-fade-in">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-black mb-2" style={{ color: '#FFD700' }}>Test Oluşturuldu!</h2>
        <p className="mb-4 text-sm" style={{ color: '#B0BEC5' }}>{created.question_count} soru hazır.</p>
        
        <div className="glass p-4 mb-4">
          <p className="text-xs mb-2" style={{ color: '#B0BEC5' }}>Test Linki:</p>
          <div className="font-mono text-sm break-all" style={{ color: '#4FC3F7' }}>
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
          className="w-full glass p-3 text-sm font-bold" style={{ color: '#4FC3F7' }}>
          Teste Git →
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-6 animate-fade-in">
        <h1 className="text-2xl font-black mb-6" style={{ color: '#FFD700' }}>📝 Test Oluştur</h1>

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
            ].map(t => (
              <button key={t.key} onClick={() => {
                setType(t.key)
                if (t.key === 'duel') setMaxParticipants(4)
                else setMaxParticipants(1000)
              }}
                className="glass p-3 text-left transition-all"
                style={{
                  border: type === t.key ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                }}>
                <div className="font-bold text-sm">{t.label}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>{t.desc}</div>
              </button>
            ))}
          </div>
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
                  border: visibility === v.key ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                }}>
                <div className="font-bold text-sm">{v.label}</div>
                <div className="text-xs mt-0.5" style={{ color: '#B0BEC5' }}>{v.desc}</div>
              </button>
            ))}
          </div>
          {visibility === 'private' && (
            <input className="input-field w-full mt-2" placeholder="Şifre girin"
              value={password} onChange={e => setPassword(e.target.value)} />
          )}
        </div>

        {/* Maç Tipi */}
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
                  border: matchType === s.key ? '2px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
                }}>
                <div className="font-bold text-sm">{s.label}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Skor Tablosu */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Skor Tablosu <span style={{ color: '#B0BEC5', fontWeight: 400 }}>(çoklu seçim)</span></label>
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
                    border: selected ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                    background: selected ? 'rgba(255,215,0,0.08)' : '',
                  }}>
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>{s.desc}</div>
                  {selected && <span className="text-xs" style={{ color: '#FFD700' }}>✓ Seçildi</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Kategoriler */}
        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Kategoriler <span style={{ color: '#B0BEC5', fontWeight: 400 }}>(boş = tümü)</span></label>
          <div className="grid grid-cols-2 gap-2">
            {categories.map(c => (
              <button key={c.id} onClick={() => toggleCat(c.id)}
                className="glass p-2 flex items-center gap-2 text-sm transition-all"
                style={{
                  border: selectedCats.includes(c.id) ? '2px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedCats.includes(c.id) ? 'rgba(79,195,247,0.15)' : '',
                }}>
                <span>{c.icon}</span><span>{c.name}</span>
                {selectedCats.includes(c.id) && <span className="ml-auto" style={{ color: '#4FC3F7' }}>✓</span>}
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
                <label className="text-xs block mb-1" style={{ color: '#B0BEC5' }}>{d.label}</label>
                <input type="number" min={0} className="input-field w-full"
                  value={distribution[d.key as keyof typeof distribution]}
                  onChange={e => setDistribution(prev => ({ ...prev, [d.key]: parseInt(e.target.value) || 0 }))}
                />
              </div>
            ))}
          </div>
          <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>
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
                <div className="font-black text-2xl" style={{ color: '#FFD700' }}>4</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Max Katılımcı</div>
              </div>
            </div>
          )}
        </div>

        <button onClick={handleCreate} disabled={loading} className="btn-gold w-full text-lg">
          {loading ? 'Oluşturuluyor...' : '🚀 Test Oluştur'}
        </button>
      </div>
    </div>
  )
}
