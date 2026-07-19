'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import Link from 'next/link'

type Tab = 'dashboard' | 'sorular' | 'kullanicilar' | 'kategoriler' | 'csv' | 'ayarlar' | 'unvanlar' | 'sayfalar' | 'blog' | 'duyurular' | 'avatarlar' | 'import' | 'generator' | 'sistem' | 'market' | 'moderasyon'

interface DashboardData { users: number; questions: number; matches: number }
interface Question {
  id: string; text: string; category: string; difficulty: string
  correct_answer: string; is_active: boolean
  option_a: string; option_b: string; option_c?: string; option_d?: string
}
interface UserRow {
  id: string; username: string; email: string; role: string
  xp: number; elo_rating: number; total_matches: number
  is_active: boolean; created_at: string
}
interface Category {
  id: string; name: string; slug: string; icon: string
  is_active: boolean; question_count: number
  in_general_match: boolean; has_category_match: boolean
}

export default function AdminPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [qPage, setQPage] = useState(1)
  const [qTotal, setQTotal] = useState(0)
  const [qSearch, setQSearch] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [uPage, setUPage] = useState(1)
  const [uTotal, setUTotal] = useState(0)
  const [uSearch, setUSearch] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvResult, setCsvResult] = useState<any>(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [siteSettings, setSiteSettings] = useState<any>(null)
  const [titles, setTitles] = useState<any[]>([])
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [staticPages, setStaticPages] = useState<any[]>([])
  const [editingPage, setEditingPage] = useState<any>(null)
  const [blogPosts, setBlogPosts] = useState<any[]>([])
  const [editingPost, setEditingPost] = useState<any>(null)
  const [newPost, setNewPost] = useState(false)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [editingAnn, setEditingAnn] = useState<any>(null)
  const [avatarRequests, setAvatarRequests] = useState<any[]>([])
  const [importUrl, setImportUrl] = useState('')
  const [importCategoryId, setImportCategoryId] = useState('')
  const [importDifficulty, setImportDifficulty] = useState('medium')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const [importCategories, setImportCategories] = useState<any[]>([])
  const [skipImages, setSkipImages] = useState(true)
  const [genApiKey, setGenApiKey] = useState('')
  const [genLanguage, setGenLanguage] = useState('Türkçe')
  const [genCountry, setGenCountry] = useState('Türkiye')
  const [genCategories, setGenCategories] = useState<string[]>([])
  const [genDifficulties, setGenDifficulties] = useState<string[]>(['easy', 'medium', 'hard'])
  const [genCount, setGenCount] = useState(5)
  const [genModel, setGenModel] = useState('gpt-4o-mini')
  const [genDelay, setGenDelay] = useState(1.0)
  const [botLanguage, setBotLanguage] = useState('turkish')
  const [shopItems, setShopItems] = useState<any[]>([])
  const [newColorName, setNewColorName] = useState('')
  const [newColorValue, setNewColorValue] = useState('#1565C0')
  const [newColorPrice, setNewColorPrice] = useState(500)
  const [botCount, setBotCount] = useState(10)
  const [botTotal, setBotTotal] = useState<number | null>(null)
  const [sistemLoading, setSistemLoading] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState<any>(null)
  const [genCategList, setGenCategList] = useState<any[]>([])
  const [pendingEvents, setPendingEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMe().then(() => {
      const u = useAuthStore.getState().user
      if (!u || u.role !== 'admin') {
        router.push('/')
        return
      }
      loadDashboard()
      setLoading(false)
    })
  }, [])

  useEffect(() => { if (tab === 'sorular') loadQuestions() }, [tab, qPage, qSearch])
  useEffect(() => { if (tab === 'kullanicilar') loadUsers() }, [tab, uPage, uSearch])
  useEffect(() => { if (tab === 'kategoriler') loadCategories() }, [tab])
  useEffect(() => { if (tab === 'ayarlar') loadSettings() }, [tab])
  useEffect(() => { if (tab === 'unvanlar') loadTitles() }, [tab])
  useEffect(() => { if (tab === 'sayfalar') loadPages() }, [tab])
  useEffect(() => { if (tab === 'blog') loadBlogPosts() }, [tab])
  useEffect(() => { if (tab === 'duyurular') loadAnnouncements() }, [tab])
  useEffect(() => { if (tab === 'avatarlar') loadAvatarRequests() }, [tab])
  useEffect(() => { if (tab === 'import') loadImportCategories() }, [tab])
  useEffect(() => { if (tab === 'generator') loadGenCategories() }, [tab])
  useEffect(() => { if (tab === 'sistem') loadBotCount() }, [tab])
  useEffect(() => { if (tab === 'market') loadShopItems() }, [tab])
  useEffect(() => {
    const saved = localStorage.getItem('openai_api_key')
    if (saved) setGenApiKey(saved)
  }, [])
  useEffect(() => { if (tab === 'moderasyon') loadPendingEvents() }, [tab])

  const loadPendingEvents = async () => {
    const r = await api.get('/api/events/admin/pending')
    setPendingEvents(r.data.events || [])
  }
  const approveEvent = async (id: string) => {
    await api.post(`/api/events/admin/${id}/approve`)
    await loadPendingEvents()
  }
  const rejectEvent = async (id: string) => {
    await api.delete(`/api/events/admin/${id}/reject`)
    await loadPendingEvents()
  }

  const loadImportCategories = async () => {
    const r = await api.get('/api/import/categories')
    setImportCategories(r.data.categories || [])
  }

  const loadShopItems = async () => {
    const r = await api.get('/api/shop/admin/items')
    setShopItems(r.data.items || [])
  }

  const updateShopItem = async (id: string, data: any) => {
    await api.patch(`/api/shop/admin/items/${id}`, data)
    await loadShopItems()
  }

  const deleteShopItem = async (id: string) => {
    if (!confirm('Bu ürünü silmek istediğinize emin misiniz?')) return
    await api.delete(`/api/shop/admin/items/${id}`)
    await loadShopItems()
  }

  const addColorItem = async () => {
    if (!newColorName || !newColorValue) return
    await api.post('/api/shop/admin/items/color', {
      name: newColorName, value: newColorValue, price_xp: newColorPrice
    })
    setNewColorName('')
    setNewColorValue('#1565C0')
    setNewColorPrice(500)
    await loadShopItems()
  }

  const loadBotCount = async () => {
    const r = await api.get('/api/admin/bots/count')
    setBotTotal(r.data.count)
  }

  const resetMarathon = async () => {
    if (!confirm('Tüm aktif maratonlar sıfırlanacak. Emin misin?')) return
    setSistemLoading('marathon')
    await api.post('/api/admin/reset/marathon')
    setSistemLoading('')
    alert('Maraton sıfırlandı!')
  }

  const resetTests = async () => {
    if (!confirm('Tüm testler silinecek. Emin misin?')) return
    setSistemLoading('tests')
    await api.post('/api/admin/reset/tests')
    setSistemLoading('')
    alert('Testler silindi!')
  }

  const resetStats = async () => {
    if (!confirm('Tüm maç, XP, rozet ve lig verileri silinecek. Emin misin?')) return
    setSistemLoading('stats')
    await api.post('/api/admin/reset/stats')
    setSistemLoading('')
    alert('Sıfırlandı!')
  }

  const resetAchievements = async () => {
    if (!confirm('Tüm kupa, madalya ve rozetler silinecek. Emin misiniz?')) return
    setSistemLoading('achievements')
    await api.post('/api/admin/reset/achievements')
    setSistemLoading('')
    alert('Kupa, madalya ve rozetler sıfırlandı!')
  }

  const resetQuestions = async () => {
    if (!confirm('Tüm sorular silinecek. Emin misin?')) return
    setSistemLoading('questions')
    await api.post('/api/admin/reset/questions')
    setSistemLoading('')
    alert('Sorular silindi!')
  }

  const createBots = async () => {
    setSistemLoading('bots')
    const r = await api.post('/api/admin/bots/create', { language: botLanguage, count: botCount })
    setSistemLoading('')
    alert(`${r.data.added} bot eklendi!`)
    loadBotCount()
  }

  const deleteAllBots = async () => {
    if (!confirm('Tüm botlar silinecek. Emin misin?')) return
    setSistemLoading('delbots')
    await api.delete('/api/admin/bots/all')
    setSistemLoading('')
    alert('Tüm botlar silindi!')
    loadBotCount()
  }

  const loadGenCategories = async () => {
    const r = await api.get('/api/generator/categories')
    setGenCategList(r.data.categories || [])
  }

  const runGenerate = async () => {
    if (!genApiKey || genCategories.length === 0 || genDifficulties.length === 0) return
    setGenerating(true)
    setGenResult(null)
    try {
      const r = await api.post('/api/generator/generate', {
        openai_api_key: genApiKey,
        category_ids: genCategories,
        difficulties: genDifficulties,
        count_per_combo: genCount,
        language: genLanguage,
        country: genCountry,
        model: genModel,
        delay_seconds: genDelay,
      })
      setGenResult(r.data)
    } catch (e: any) {
      setGenResult({ errors: [e.response?.data?.detail || 'Hata oluştu'] })
    } finally { setGenerating(false) }
  }

  const runImport = async () => {
    if (!importUrl || !importCategoryId) return
    setImporting(true)
    setImportResult(null)
    try {
      const r = await api.post('/api/import/url', {
        url: importUrl,
        category_id: importCategoryId,
        difficulty: importDifficulty,
        skip_images: skipImages,
      })
      setImportResult(r.data)
    } catch (e: any) {
      setImportResult({ error: e.response?.data?.detail || 'Hata oluştu' })
    } finally { setImporting(false) }
  }

  const loadAvatarRequests = async () => {
    const r = await api.get('/api/upload/avatar-requests')
    setAvatarRequests(r.data.requests || [])
  }

  const approveAvatar = async (id: string) => {
    await api.post(`/api/upload/avatar-requests/${id}/approve`)
    await loadAvatarRequests()
  }

  const rejectAvatar = async (id: string) => {
    await api.post(`/api/upload/avatar-requests/${id}/reject`)
    await loadAvatarRequests()
  }

  const loadAnnouncements = async () => {
    const r = await api.get('/api/announcements')
    setAnnouncements(r.data.announcements || [])
  }

  const saveAnnouncement = async () => {
    if (!editingAnn) return
    if (editingAnn.id) {
      await api.put(`/api/announcements/${editingAnn.id}`, editingAnn)
    } else {
      await api.post('/api/announcements', editingAnn)
    }
    setEditingAnn(null)
    await loadAnnouncements()
  }

  const deleteAnnouncement = async (id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await api.delete(`/api/announcements/${id}`)
    await loadAnnouncements()
  }

  const loadBlogPosts = async () => {
    const r = await api.get('/api/blog')
    setBlogPosts(r.data.posts || [])
  }

  const saveBlogPost = async () => {
    if (!editingPost) return
    if (editingPost.id) {
      await api.put(`/api/blog/${editingPost.id}`, editingPost)
    } else {
      await api.post('/api/blog', editingPost)
    }
    setEditingPost(null)
    setNewPost(false)
    await loadBlogPosts()
  }

  const deleteBlogPost = async (id: string) => {
    if (!confirm('Silmek istediğinize emin misiniz?')) return
    await api.delete(`/api/blog/${id}`)
    await loadBlogPosts()
  }

  const loadPages = async () => {
    const r = await api.get('/api/pages')
    setStaticPages(r.data.pages || [])
  }

  const savePage = async () => {
    if (!editingPage) return
    await api.put(`/api/pages/${editingPage.id}`, editingPage)
    setEditingPage(null)
    await loadPages()
  }

  const loadTitles = async () => {
    const r = await api.get('/api/admin/settings/')
    setTitles(r.data.settings?.titles || [])
  }

  const saveTitles = async () => {
    await api.post('/api/admin/settings/', { key: 'titles', value: titles })
    alert('Unvanlar kaydedildi!')
  }

  const loadSettings = async () => {
    const r = await api.get('/api/admin/settings/')
    setSiteSettings(r.data.settings)
  }

  const saveSettings = async (key: string, value: any) => {
    setSettingsSaving(true)
    try {
      await api.post('/api/admin/settings/', { key, value })
      await loadSettings()
    } finally {
      setSettingsSaving(false)
    }
  }

  const loadDashboard = async () => {
    const r = await api.get('/api/admin/dashboard')
    setDashboard(r.data)
  }

  const loadQuestions = async () => {
    const r = await api.get(`/api/admin/questions?page=${qPage}&limit=15&search=${qSearch}`)
    setQuestions(r.data.questions)
    setQTotal(r.data.total)
  }

  const loadUsers = async () => {
    const r = await api.get(`/api/admin/users?page=${uPage}&limit=15&search=${uSearch}`)
    setUsers(r.data.users)
    setUTotal(r.data.total)
  }

  const loadCategories = async () => {
    const r = await api.get('/api/categories/all')
    setCategories(r.data.categories)
  }

  const toggleQuestion = async (id: string) => {
    await api.post(`/api/admin/questions/${id}/toggle-active`)
    loadQuestions()
  }

  const deleteQuestion = async (id: string) => {
    if (!confirm('Soruyu silmek istediğinize emin misiniz?')) return
    await api.delete(`/api/admin/questions/${id}`)
    loadQuestions()
  }

  const toggleUser = async (id: string) => {
    await api.post(`/api/admin/users/${id}/toggle-active`)
    loadUsers()
  }

  const makeAdmin = async (id: string) => {
    if (!confirm('Bu kullanıcıyı admin yapmak istediğinize emin misiniz?')) return
    await api.post(`/api/admin/users/${id}/make-admin`)
    loadUsers()
  }

  const toggleCategory = async (id: string) => {
    await api.patch(`/api/admin/categories/${id}/toggle`)
    loadCategories()
  }

  const uploadCsv = async () => {
    if (!csvFile) return
    setCsvLoading(true)
    setCsvResult(null)
    const form = new FormData()
    form.append('file', csvFile)
    try {
      const r = await api.post('/api/admin/questions/import-csv', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setCsvResult(r.data)
      loadDashboard()
    } catch (e: any) {
      setCsvResult({ error: e.response?.data?.detail || 'Hata oluştu.' })
    } finally {
      setCsvLoading(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
    </div>
  )

  const tabs = [
    { key: 'dashboard', label: '📊 Dashboard' },
    { key: 'sorular', label: '❓ Sorular' },
    { key: 'kullanicilar', label: '👤 Kullanıcılar' },
    { key: 'kategoriler', label: '🏷️ Kategoriler' },
    { key: 'csv', label: '📥 CSV Import' },
    { key: 'ayarlar', label: '⚙️ Ayarlar' },
    { key: 'unvanlar', label: '🏅 Unvanlar' },
    { key: 'sayfalar', label: '📄 Sayfalar' },
    { key: 'blog', label: '📝 Blog' },
    { key: 'duyurular', label: '📢 Duyurular' },
    { key: 'avatarlar', label: '🖼 Avatarlar' },
    { key: 'import', label: '📥 Import' },
    { key: 'generator', label: '🤖 Soru Üretici' },
    { key: 'sistem', label: '⚙️ Sistem' },
    { key: 'market', label: '🛒 Market' },
    { key: 'moderasyon', label: '🔍 Moderasyon' },
  ]

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 1000, margin: '0 auto' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black">
          <span style={{ color: '#FFD700' }}>Admin</span>
          <span style={{ color: '#4FC3F7' }}> Paneli</span>
        </h1>
        <Link href="/" style={{ color: '#B0BEC5', fontSize: 14 }}>← Ana Sayfa</Link>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
            style={{
              background: tab === t.key ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
              border: tab === t.key ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
              color: tab === t.key ? '#4FC3F7' : '#B0BEC5',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {tab === 'dashboard' && dashboard && (
        <div className="grid grid-cols-3 gap-4 animate-fade-in">
          {[
            { label: 'Toplam Kullanıcı', value: dashboard.users, icon: '👤', color: '#4FC3F7' },
            { label: 'Aktif Soru', value: dashboard.questions, icon: '❓', color: '#FFD700' },
            { label: 'Toplam Maç', value: dashboard.matches, icon: '🎮', color: '#81C784' },
          ].map(stat => (
            <div key={stat.label} className="glass p-6 text-center">
              <div className="text-4xl mb-2">{stat.icon}</div>
              <div className="text-3xl font-black" style={{ color: stat.color }}>{stat.value}</div>
              <div className="text-sm mt-1" style={{ color: '#B0BEC5' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* SORULAR */}
      {tab === 'sorular' && (
        <div className="animate-fade-in">
          <div className="flex gap-3 mb-4">
            <input
              className="input-field flex-1"
              placeholder="Soru ara..."
              value={qSearch}
              onChange={e => { setQSearch(e.target.value); setQPage(1) }}
            />
            <span style={{ color: '#B0BEC5', alignSelf: 'center', fontSize: 14 }}>
              {qTotal} soru
            </span>
          </div>

          <div className="glass overflow-hidden">
            <div className="grid text-xs font-bold px-4 py-3"
              style={{ gridTemplateColumns: '1fr 120px 80px 80px 120px', color: '#B0BEC5', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span>Soru</span>
              <span>Kategori</span>
              <span>Zorluk</span>
              <span>Cevap</span>
              <span>İşlem</span>
            </div>
            {questions.map(q => (
              <div key={q.id} className="grid px-4 py-3 items-center gap-2"
                style={{
                  gridTemplateColumns: '1fr 120px 80px 80px 120px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  opacity: q.is_active ? 1 : 0.5,
                }}>
                <span className="text-sm" style={{ color: 'white' }}>{q.text}</span>
                <span className="text-xs" style={{ color: '#B0BEC5' }}>{q.category}</span>
                <span className="text-xs" style={{
                  color: q.difficulty === 'Kolay' ? '#4CAF50' : q.difficulty === 'Orta' ? '#FFC107' : q.difficulty === 'Zor' ? '#FF7043' : '#E91E63'
                }}>{q.difficulty}</span>
                <span className="font-bold text-sm" style={{ color: '#4FC3F7' }}>{q.correct_answer}</span>
                <div className="flex gap-1">
                  <button onClick={() => toggleQuestion(q.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: q.is_active ? 'rgba(244,67,54,0.2)' : 'rgba(76,175,80,0.2)', color: q.is_active ? '#F44336' : '#4CAF50' }}>
                    {q.is_active ? 'Pasif' : 'Aktif'}
                  </button>
                  <button onClick={() => deleteQuestion(q.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: 'rgba(244,67,54,0.15)', color: '#F44336' }}>
                    Sil
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Sayfalama */}
          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => setQPage(p => Math.max(1, p-1))} disabled={qPage === 1}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', color: qPage === 1 ? '#555' : '#4FC3F7' }}>
              ← Önceki
            </button>
            <span className="px-4 py-2 text-sm" style={{ color: '#B0BEC5' }}>
              {qPage} / {Math.ceil(qTotal/15)}
            </span>
            <button onClick={() => setQPage(p => p+1)} disabled={qPage >= Math.ceil(qTotal/15)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', color: qPage >= Math.ceil(qTotal/15) ? '#555' : '#4FC3F7' }}>
              Sonraki →
            </button>
          </div>
        </div>
      )}

      {/* KULLANICILAR */}
      {tab === 'kullanicilar' && (
        <div className="animate-fade-in">
          <div className="flex gap-3 mb-4">
            <input
              className="input-field flex-1"
              placeholder="Kullanıcı ara..."
              value={uSearch}
              onChange={e => { setUSearch(e.target.value); setUPage(1) }}
            />
            <span style={{ color: '#B0BEC5', alignSelf: 'center', fontSize: 14 }}>
              {uTotal} kullanıcı
            </span>
          </div>

          <div className="glass overflow-hidden">
            <div className="grid text-xs font-bold px-4 py-3"
              style={{ gridTemplateColumns: '1fr 80px 80px 80px 80px 140px', color: '#B0BEC5', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <span>Kullanıcı</span>
              <span>Rol</span>
              <span>ELO</span>
              <span>XP</span>
              <span>Maç</span>
              <span>İşlem</span>
            </div>
            {users.map(u => (
              <div key={u.id} className="grid px-4 py-3 items-center"
                style={{
                  gridTemplateColumns: '1fr 80px 80px 80px 80px 140px',
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  opacity: u.is_active ? 1 : 0.5,
                }}>
                <div>
                  <div className="font-bold text-sm">{u.username}</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>{u.email}</div>
                </div>
                <span className="text-xs" style={{ color: u.role === 'admin' ? '#E91E63' : '#B0BEC5' }}>
                  {u.role}
                </span>
                <span className="text-sm" style={{ color: '#4FC3F7' }}>{u.elo_rating}</span>
                <span className="text-sm" style={{ color: '#FFD700' }}>{u.xp}</span>
                <span className="text-sm">{u.total_matches}</span>
                <div className="flex gap-1 flex-wrap">
                  <button onClick={() => toggleUser(u.id)}
                    className="text-xs px-2 py-1 rounded"
                    style={{ background: u.is_active ? 'rgba(244,67,54,0.2)' : 'rgba(76,175,80,0.2)', color: u.is_active ? '#F44336' : '#4CAF50' }}>
                    {u.is_active ? 'Askıya Al' : 'Aktif Et'}
                  </button>
                  {u.role !== 'admin' && (
                    <button onClick={() => makeAdmin(u.id)}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: 'rgba(233,30,99,0.2)', color: '#E91E63' }}>
                      Admin
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-center mt-4">
            <button onClick={() => setUPage(p => Math.max(1, p-1))} disabled={uPage === 1}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', color: uPage === 1 ? '#555' : '#4FC3F7' }}>
              ← Önceki
            </button>
            <span className="px-4 py-2 text-sm" style={{ color: '#B0BEC5' }}>
              {uPage} / {Math.ceil(uTotal/15)}
            </span>
            <button onClick={() => setUPage(p => p+1)} disabled={uPage >= Math.ceil(uTotal/15)}
              className="px-4 py-2 rounded-xl text-sm"
              style={{ background: 'rgba(255,255,255,0.05)', color: uPage >= Math.ceil(uTotal/15) ? '#555' : '#4FC3F7' }}>
              Sonraki →
            </button>
          </div>
        </div>
      )}

      {/* KATEGORİLER */}
      {tab === 'kategoriler' && (
        <div className="animate-fade-in glass overflow-hidden">
          <div className="grid text-xs font-bold px-4 py-3"
            style={{ gridTemplateColumns: '40px 1fr 80px 100px 100px 80px', color: '#B0BEC5', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span>İkon</span>
            <span>Kategori</span>
            <span>Sorular</span>
            <span>Genel Maç</span>
            <span>Özel Maç</span>
            <span>Durum</span>
          </div>
          {categories.map(cat => (
            <div key={cat.id} className="grid px-4 py-3 items-center"
              style={{
                gridTemplateColumns: '40px 1fr 80px 100px 100px 80px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                opacity: cat.is_active ? 1 : 0.5,
              }}>
              <span className="text-xl">{cat.icon}</span>
              <span className="font-bold">{cat.name}</span>
              <span style={{ color: cat.question_count < 10 ? '#FF7043' : '#4CAF50' }}>
                {cat.question_count}
              </span>
              <button onClick={async () => {
                await api.patch(`/api/categories/${cat.id}`, { in_general_match: !cat.in_general_match })
                loadCategories()
              }}
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: cat.in_general_match ? 'rgba(76,175,80,0.2)' : 'rgba(255,255,255,0.05)',
                  color: cat.in_general_match ? '#4CAF50' : '#666'
                }}>
                {cat.in_general_match ? '✓ Dahil' : '✗ Hariç'}
              </button>
              <button onClick={async () => {
                await api.patch(`/api/categories/${cat.id}`, { has_category_match: !cat.has_category_match })
                loadCategories()
              }}
                className="text-xs px-2 py-1 rounded"
                style={{
                  background: cat.has_category_match ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
                  color: cat.has_category_match ? '#4FC3F7' : '#666'
                }}>
                {cat.has_category_match ? '✓ Var' : '✗ Yok'}
              </button>
              <button onClick={() => toggleCategory(cat.id)}
                className="text-xs px-3 py-1 rounded"
                style={{
                  background: cat.is_active ? 'rgba(244,67,54,0.2)' : 'rgba(76,175,80,0.2)',
                  color: cat.is_active ? '#F44336' : '#4CAF50'
                }}>
                {cat.is_active ? 'Pasif' : 'Aktif'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CSV IMPORT */}
      {tab === 'csv' && (
        <div className="animate-fade-in">
          <div className="glass p-6 mb-4">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>CSV ile Soru Yükle</h3>

            {/* CSV Format */}
            <div className="rounded-xl p-4 mb-4 text-xs font-mono"
              style={{ background: 'rgba(0,0,0,0.3)', color: '#4FC3F7' }}>
              <div style={{ color: '#B0BEC5', marginBottom: 8 }}>CSV sütun sırası:</div>
              kategori,zorluk,soru_tipi,soru_metni,sik_a,sik_b,sik_c,sik_d,dogru_cevap,aciklama<br />
              <br />
              <div style={{ color: '#B0BEC5' }}>Zorluk değerleri: kolay / orta / zor / cok_zor</div>
              <div style={{ color: '#B0BEC5' }}>Soru tipi: coktan_secmeli / dogru_yanlis</div>
              <div style={{ color: '#B0BEC5' }}>Doğru cevap: A / B / C / D</div>
            </div>

            <div className="flex gap-3 items-center">
              <input
                type="file"
                accept=".csv"
                onChange={e => setCsvFile(e.target.files?.[0] || null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  color: 'white',
                }}
              />
              <button
                onClick={uploadCsv}
                disabled={!csvFile || csvLoading}
                className="btn-gold"
                style={{ whiteSpace: 'nowrap' }}>
                {csvLoading ? 'Yükleniyor...' : '📥 Yükle'}
              </button>
            </div>
          </div>

          {/* Sonuç */}
          {csvResult && (
            <div className="glass p-5 animate-fade-in">
              {csvResult.error ? (
                <div style={{ color: '#F44336' }}>❌ {csvResult.error}</div>
              ) : (
                <>
                  <div className="font-bold mb-3" style={{ color: '#4CAF50' }}>
                    ✓ {csvResult.imported} soru başarıyla yüklendi
                  </div>
                  {csvResult.total_errors > 0 && (
                    <div>
                      <div className="font-bold mb-2" style={{ color: '#FF7043' }}>
                        ⚠️ {csvResult.total_errors} hata:
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {csvResult.errors.map((e: string, i: number) => (
                          <div key={i} className="text-xs" style={{ color: '#FF7043' }}>{e}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODERASYON */}
      {tab === 'moderasyon' && (
        <div className="animate-fade-in">
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FF9800' }}>🔍 Moderasyon Bekleyenler</h3>
            {pendingEvents.length === 0 ? (
              <div className="text-center py-8" style={{ color: '#4CAF50' }}>✓ Bekleyen test yok</div>
            ) : (
              <div className="space-y-3">
                {pendingEvents.map((e: any) => (
                  <div key={e.id} className="glass p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="font-bold">{e.title}</div>
                        {e.description && <div className="text-sm mt-1" style={{ color: '#B0BEC5' }}>{e.description}</div>}
                        <div className="text-xs mt-2 px-2 py-1 rounded inline-block" style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                          ⚠️ {e.reason}
                        </div>
                        <div className="text-xs mt-1" style={{ color: '#555' }}>{e.created_at}</div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <button onClick={() => approveEvent(e.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(76,175,80,0.2)', color: '#4CAF50' }}>
                          ✓ Onayla
                        </button>
                        <button onClick={() => rejectEvent(e.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                          ✗ Reddet
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SAYFALAR */}
      {tab === 'sayfalar' && (
        <div className="animate-fade-in space-y-4">
          {!editingPage ? (
            <div className="glass p-5">
              <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>📄 Statik Sayfalar</h3>
              <div className="space-y-2">
                {staticPages.map((p: any) => (
                  <div key={p.id} className="glass p-3 flex items-center justify-between">
                    <span className="font-bold">{p.title}</span>
                    <button onClick={async () => {
                      const r = await api.get(`/api/pages/${p.id}`)
                      setEditingPage(r.data)
                    }} className="text-xs px-3 py-1.5 rounded-lg font-bold"
                      style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>
                      ✏️ Düzenle
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass p-5">
              <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>✏️ {editingPage.title}</h3>
              <div className="mb-3">
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Başlık</label>
                <input className="input-field w-full" value={editingPage.title}
                  onChange={e => setEditingPage({...editingPage, title: e.target.value})} />
              </div>
              <div className="mb-4">
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>İçerik</label>
                <textarea className="input-field w-full" rows={15} value={editingPage.content}
                  onChange={e => setEditingPage({...editingPage, content: e.target.value})}
                  style={{ resize: 'vertical', fontFamily: 'monospace' }} />
              </div>
              <div className="flex gap-3">
                <button onClick={savePage} className="btn-gold">💾 Kaydet</button>
                <button onClick={() => setEditingPage(null)}
                  className="glass px-4 py-2 font-bold" style={{ color: '#B0BEC5' }}>
                  İptal
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BLOG */}
      {tab === 'blog' && (
        <div className="animate-fade-in space-y-4">
          {!editingPost ? (
            <div className="glass p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold" style={{ color: '#FFD700' }}>📝 Blog Yazıları</h3>
                <button onClick={() => { setEditingPost({ title: '', summary: '', content: '', cover_image: '', is_active: true }); setNewPost(true) }}
                  className="btn-gold text-sm px-4 py-2">+ Yeni Yazı</button>
              </div>
              {blogPosts.length === 0 ? (
                <div className="text-center py-8" style={{ color: '#555' }}>Henüz yazı yok.</div>
              ) : (
                <div className="space-y-2">
                  {blogPosts.map((p: any) => (
                    <div key={p.id} className="glass p-3 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-sm">{p.title}</div>
                        <div className="text-xs" style={{ color: '#555' }}>{p.created_at} · {p.view_count} görüntülenme</div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={async () => {
                          const r = await api.get(`/api/blog/${p.slug}`)
                          setEditingPost({ ...r.data })
                          setNewPost(false)
                        }} className="text-xs px-3 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>✏️</button>
                        <button onClick={() => deleteBlogPost(p.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass p-5">
              <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>
                {newPost ? '+ Yeni Yazı' : '✏️ Yazıyı Düzenle'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Başlık</label>
                  <input className="input-field w-full" value={editingPost.title}
                    onChange={e => setEditingPost({...editingPost, title: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Özet</label>
                  <input className="input-field w-full" value={editingPost.summary || ''}
                    onChange={e => setEditingPost({...editingPost, summary: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>İçerik</label>
                  <textarea className="input-field w-full" rows={12} value={editingPost.content}
                    onChange={e => setEditingPost({...editingPost, content: e.target.value})}
                    style={{ resize: 'vertical' }} />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={editingPost.is_active}
                    onChange={e => setEditingPost({...editingPost, is_active: e.target.checked})} />
                  <label className="text-sm" style={{ color: '#B0BEC5' }}>Yayında</label>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={saveBlogPost} className="btn-gold">💾 Kaydet</button>
                <button onClick={() => { setEditingPost(null); setNewPost(false) }}
                  className="glass px-4 py-2 font-bold" style={{ color: '#B0BEC5' }}>İptal</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DUYURULAR */}
      {tab === 'duyurular' && (
        <div className="animate-fade-in space-y-4">
          {!editingAnn ? (
            <div className="glass p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold" style={{ color: '#FF9800' }}>📢 Duyurular</h3>
                <button onClick={() => setEditingAnn({
                  title: '', content: '', link_url: '', link_label: '',
                  bg_color: '#FFD700', text_color: '#000000', is_active: true
                })} className="btn-gold text-sm px-4 py-2">+ Yeni Duyuru</button>
              </div>
              {announcements.length === 0 ? (
                <div className="text-center py-8" style={{ color: '#555' }}>Duyuru yok.</div>
              ) : (
                <div className="space-y-2">
                  {announcements.map((a: any) => (
                    <div key={a.id} className="glass p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-4 h-4 rounded-full" style={{ background: a.bg_color }}></div>
                        <div>
                          <div className="font-bold text-sm">{a.title}</div>
                          <div className="text-xs" style={{ color: a.is_active ? '#4CAF50' : '#555' }}>
                            {a.is_active ? '● Yayında' : '○ Pasif'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingAnn({...a})}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>✏️</button>
                        <button onClick={() => deleteAnnouncement(a.id)}
                          className="text-xs px-3 py-1.5 rounded-lg font-bold"
                          style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="glass p-5">
              <h3 className="font-bold mb-4" style={{ color: '#FF9800' }}>
                {editingAnn.id ? '✏️ Duyuruyu Düzenle' : '+ Yeni Duyuru'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Başlık *</label>
                  <input className="input-field w-full" value={editingAnn.title}
                    onChange={e => setEditingAnn({...editingAnn, title: e.target.value})} />
                </div>
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Açıklama</label>
                  <textarea className="input-field w-full" rows={3} value={editingAnn.content}
                    onChange={e => setEditingAnn({...editingAnn, content: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Link URL (blog veya sayfa)</label>
                    <input className="input-field w-full" value={editingAnn.link_url || ''}
                      placeholder="/blog/yazi-slug"
                      onChange={e => setEditingAnn({...editingAnn, link_url: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Link Etiketi</label>
                    <input className="input-field w-full" value={editingAnn.link_label || ''}
                      placeholder="Daha fazla →"
                      onChange={e => setEditingAnn({...editingAnn, link_label: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Arka Plan Rengi</label>
                    <div className="flex gap-2 flex-wrap">
                      {['#FFD700','#4FC3F7','#4CAF50','#F44336','#FF9800','#E91E63','#9C27B0'].map(c => (
                        <button key={c} onClick={() => setEditingAnn({...editingAnn, bg_color: c})}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: c,
                            border: editingAnn.bg_color === c ? '3px solid white' : '2px solid transparent' }} />
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Yazı Rengi</label>
                    <div className="flex gap-2">
                      {['#000000','#ffffff'].map(c => (
                        <button key={c} onClick={() => setEditingAnn({...editingAnn, text_color: c})}
                          style={{ width: 28, height: 28, borderRadius: '50%', background: c,
                            border: editingAnn.text_color === c ? '3px solid #FFD700' : '2px solid rgba(255,255,255,0.2)' }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Önizleme</label>
                  <div className="rounded-xl p-4" style={{ background: editingAnn.bg_color, color: editingAnn.text_color }}>
                    <div className="font-black">{editingAnn.title || 'Başlık'}</div>
                    {editingAnn.content && <div className="text-sm mt-1">{editingAnn.content}</div>}
                    {editingAnn.link_label && <div className="text-sm mt-1 underline">{editingAnn.link_label}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={editingAnn.is_active}
                    onChange={e => setEditingAnn({...editingAnn, is_active: e.target.checked})} />
                  <label className="text-sm" style={{ color: '#B0BEC5' }}>Yayında (tek duyuru aktif olabilir)</label>
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={saveAnnouncement} className="btn-gold">💾 Kaydet</button>
                <button onClick={() => setEditingAnn(null)}
                  className="glass px-4 py-2 font-bold" style={{ color: '#B0BEC5' }}>İptal</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* AVATARLAR */}
      {tab === 'avatarlar' && (
        <div className="animate-fade-in">
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#4FC3F7' }}>🖼 Avatar Onay Bekleyenler</h3>
            {avatarRequests.length === 0 ? (
              <div className="text-center py-8" style={{ color: '#4CAF50' }}>✓ Bekleyen avatar yok</div>
            ) : (
              <div className="space-y-4">
                {avatarRequests.map((r: any) => (
                  <div key={r.id} className="glass p-4 flex items-center gap-4">
                    <img src={`https://api.bilgimaratonu.com${r.avatar_url}?t=${Date.now()}`} alt="avatar"
                      className="w-16 h-16 rounded-full object-cover flex-shrink-0"
                      style={{ border: '2px solid rgba(255,255,255,0.1)' }} />
                    <div className="flex-1">
                      <div className="font-bold">{r.username}</div>
                      <div className="text-xs" style={{ color: '#555' }}>{r.created_at}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approveAvatar(r.id)}
                        className="text-xs px-3 py-1.5 rounded-lg font-bold"
                        style={{ background: 'rgba(76,175,80,0.2)', color: '#4CAF50' }}>
                        ✓ Onayla
                      </button>
                      <button onClick={() => rejectAvatar(r.id)}
                        className="text-xs px-3 py-1.5 rounded-lg font-bold"
                        style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                        ✗ Reddet
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* IMPORT */}
      {tab === 'import' && (
        <div className="animate-fade-in">
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#4FC3F7' }}>📥 URL'den Soru Import</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>URL</label>
                <input className="input-field w-full" value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="https://..." />
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Kategori</label>
                <select className="input-field w-full" value={importCategoryId}
                  onChange={e => setImportCategoryId(e.target.value)}>
                  <option value="">Kategori seç</option>
                  {importCategories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Zorluk</label>
                <select className="input-field w-full" value={importDifficulty}
                  onChange={e => setImportDifficulty(e.target.value)}>
                  <option value="random">🎲 Karıştır</option>
                  <option value="easy">Kolay</option>
                  <option value="medium">Orta</option>
                  <option value="hard">Zor</option>
                  <option value="very_hard">Çok Zor</option>
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={skipImages} onChange={e => setSkipImages(e.target.checked)} />
                <span className="text-sm" style={{ color: '#B0BEC5' }}>Resimli soruları atla (sadece yazılı sorular)</span>
              </label>
              <button onClick={runImport} disabled={importing || !importUrl || !importCategoryId}
                className="btn-gold w-full">
                {importing ? '⏳ Import ediliyor...' : '📥 Import Et'}
              </button>
              {importResult && (
                <div className="glass p-4 mt-3">
                  {importResult.error ? (
                    <p style={{ color: '#F44336' }}>❌ {importResult.error}</p>
                  ) : (
                    <>
                      <p style={{ color: '#4CAF50' }}>✓ Import tamamlandı</p>
                      <p style={{ color: '#B0BEC5' }}>• Eklendi: {importResult.imported}</p>
                      <p style={{ color: '#B0BEC5' }}>• Atlandı (duplicate): {importResult.skipped}</p>
                      <p style={{ color: '#B0BEC5' }}>• Hata: {importResult.errors}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GENERATOR */}
      {tab === 'generator' && (
        <div className="animate-fade-in space-y-4">
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#4FC3F7' }}>🤖 AI Soru Üretici</h3>
            
            {/* Dil ve Ülke */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>Dil</label>
                <select className="input-field w-full" value={genLanguage} onChange={e => setGenLanguage(e.target.value)}>
                  <option value="Türkçe">🇹🇷 Türkçe</option>
                  <option value="English">🇬🇧 İngilizce</option>
                  <option value="Almanca">🇩🇪 Almanca</option>
                  <option value="Fransızca">🇫🇷 Fransızca</option>
                  <option value="Arapça">🇸🇦 Arapça</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>Ülke Kültürü</label>
                <select className="input-field w-full" value={genCountry} onChange={e => setGenCountry(e.target.value)}>
                  <option value="Türkiye">🇹🇷 Türkiye</option>
                  <option value="Dünya geneli">🌍 Dünya geneli</option>
                  <option value="Amerika">🇺🇸 Amerika</option>
                  <option value="Avrupa">🇪🇺 Avrupa</option>
                  <option value="Ortadoğu">🕌 Ortadoğu</option>
                </select>
              </div>
            </div>

            {/* OpenAI API Key */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>OpenAI API Key</label>
              <input type="password" className="input-field w-full" value={genApiKey}
                onChange={e => { setGenApiKey(e.target.value); localStorage.setItem('openai_api_key', e.target.value) }}
                placeholder="sk-..." />
            </div>

            {/* Kategoriler */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: '#B0BEC5' }}>Kategoriler (birden fazla seçilebilir)</label>
              <div className="grid grid-cols-2 gap-2">
                {genCategList.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-2 cursor-pointer glass p-2 rounded-lg">
                    <input type="checkbox" checked={genCategories.includes(c.id)}
                      onChange={e => setGenCategories(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} />
                    <span className="text-sm">{c.icon} {c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Zorluklar */}
            <div className="mb-4">
              <label className="text-xs mb-2 block" style={{ color: '#B0BEC5' }}>Zorluk Seviyeleri</label>
              <div className="flex gap-3">
                {[['easy','Kolay'],['medium','Orta'],['hard','Zor'],['very_hard','Çok Zor']].map(([val, label]) => (
                  <label key={val} className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={genDifficulties.includes(val)}
                      onChange={e => setGenDifficulties(prev => e.target.checked ? [...prev, val] : prev.filter(d => d !== val))} />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Model ve Soru sayısı */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>AI Modeli</label>
                <select className="input-field w-full" value={genModel} onChange={e => setGenModel(e.target.value)}>
                  <option value="gpt-4o-mini">⚡ GPT-4o Mini (Hızlı & Ucuz)</option>
                  <option value="gpt-4o">🧠 GPT-4o (Yüksek Kalite)</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>Her kombinasyon için soru sayısı</label>
                <input type="number" className="input-field w-full" value={genCount} min={1} max={50}
                  onChange={e => setGenCount(parseInt(e.target.value))} />
              </div>
            </div>

            {/* İstekler arası bekleme */}
            <div className="mb-4">
              <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>
                İstekler arası bekleme süresi: <strong>{genDelay}sn</strong>
                <span className="ml-2 text-xs" style={{ color: '#555' }}>
                  (Çok soru üretirken artır — rate limit koruması)
                </span>
              </label>
              <input type="range" min={0} max={5} step={0.5} value={genDelay}
                onChange={e => setGenDelay(parseFloat(e.target.value))}
                className="w-full" />
              <div className="flex justify-between text-xs mt-1" style={{ color: '#555' }}>
                <span>0sn (Hızlı)</span><span>2.5sn</span><span>5sn (Güvenli)</span>
              </div>
            </div>

            <button onClick={runGenerate}
              disabled={generating || !genApiKey || genCategories.length === 0 || genDifficulties.length === 0}
              className="btn-gold w-full">
              {generating ? '⏳ Sorular üretiliyor...' : '🤖 Soru Üret'}
            </button>

            {genResult && (
              <div className="glass p-4 mt-3">
                {genResult.errors?.length > 0 && genResult.added === undefined ? (
                  <p style={{ color: '#F44336' }}>❌ {genResult.errors[0]}</p>
                ) : (
                  <>
                    <p style={{ color: '#4CAF50' }}>✓ Tamamlandı</p>
                    <p style={{ color: '#B0BEC5' }}>• Eklendi: {genResult.added}</p>
                    <p style={{ color: '#B0BEC5' }}>• Atlandı (duplicate): {genResult.skipped}</p>
                    {genResult.errors?.length > 0 && (
                      <div className="mt-2">
                        {genResult.errors.map((e: string, i: number) => (
                          <p key={i} className="text-xs" style={{ color: '#F44336' }}>⚠ {e}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MARKET */}
      {tab === 'market' && (
        <div className="animate-fade-in space-y-4">
          {/* Ekstra Joker */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>💡 Ekstra Joker</h3>
            {shopItems.filter(i => i.type === 'extra_joker').map((item: any) => (
              <div key={item.id} className="glass p-4 flex items-center gap-3">
                <div className="text-2xl">💡</div>
                <div className="flex-1">
                  <div className="font-bold">{item.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm" style={{ color: '#FFD700' }}>⭐</span>
                    <input type="number" value={item.price_xp} className="input-field w-20 text-sm py-1"
                      onChange={e => updateShopItem(item.id, { price_xp: parseInt(e.target.value) })} />
                    <span className="text-xs" style={{ color: '#B0BEC5' }}>XP</span>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={item.is_active}
                    onChange={e => updateShopItem(item.id, { is_active: e.target.checked })} />
                  <span className="text-sm">{item.is_active ? 'Aktif' : 'Pasif'}</span>
                </label>
              </div>
            ))}
          </div>

          {/* Profil Kart Renkleri */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#4FC3F7' }}>🎨 Profil Kart Renkleri</h3>
            <div className="space-y-3 mb-4">
              {shopItems.filter(i => i.type === 'card_color').map((item: any) => (
                <div key={item.id} className="glass p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ background: item.value }} />
                  <div className="flex-1">
                    <input type="text" value={item.name} className="input-field w-full text-sm py-1 mb-1"
                      onChange={e => updateShopItem(item.id, { name: e.target.value })} />
                    <div className="flex items-center gap-2">
                      <input type="color" value={item.value} className="w-8 h-6 cursor-pointer"
                        onChange={e => updateShopItem(item.id, { value: e.target.value })} />
                      <input type="number" value={item.price_xp} className="input-field w-20 text-sm py-1"
                        onChange={e => updateShopItem(item.id, { price_xp: parseInt(e.target.value) })} />
                      <span className="text-xs" style={{ color: '#B0BEC5' }}>XP</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input type="checkbox" checked={item.is_active}
                        onChange={e => updateShopItem(item.id, { is_active: e.target.checked })} />
                      <span className="text-xs">{item.is_active ? 'Aktif' : 'Pasif'}</span>
                    </label>
                    <button onClick={() => deleteShopItem(item.id)}
                      className="text-xs px-2 py-1 rounded" style={{ color: '#F44336' }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Yeni renk ekle */}
            <div className="glass p-4">
              <h4 className="text-sm font-bold mb-3" style={{ color: '#4FC3F7' }}>+ Yeni Renk Ekle</h4>
              <div className="flex items-center gap-3 flex-wrap">
                <input type="text" placeholder="Renk adı" value={newColorName}
                  onChange={e => setNewColorName(e.target.value)}
                  className="input-field flex-1 text-sm" />
                <input type="color" value={newColorValue}
                  onChange={e => setNewColorValue(e.target.value)}
                  className="w-10 h-9 cursor-pointer rounded" />
                <input type="number" value={newColorPrice}
                  onChange={e => setNewColorPrice(parseInt(e.target.value))}
                  className="input-field w-20 text-sm" placeholder="XP" />
                <button onClick={addColorItem} className="btn-gold text-sm px-4 py-2">
                  ➕ Ekle
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="w-6 h-6 rounded" style={{ background: newColorValue }} />
                <span className="text-xs" style={{ color: '#B0BEC5' }}>Önizleme</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SİSTEM */}
      {tab === 'sistem' && (
        <div className="animate-fade-in space-y-4">
          {/* Sıfırlama */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#F44336' }}>🗑 Veri Sıfırlama</h3>
            <div className="space-y-3">
              <div className="glass p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">Maç & İstatistik Sıfırlama</div>
                  <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Tüm maçlar, XP, ELO, rozetler, lig puanları sıfırlanır</div>
                </div>
                <button onClick={resetStats} disabled={sistemLoading === 'stats'}
                  className="text-sm px-4 py-2 rounded-lg font-bold flex-shrink-0"
                  style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                  {sistemLoading === 'stats' ? '...' : '🗑 Sıfırla'}
                </button>
              </div>
              <div className="glass p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">Kupa, Madalya & Rozet Sıfırlama</div>
                  <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Kazanılan tüm kupa, madalya ve rozetler silinir (maç/XP/ELO korunur)</div>
                </div>
                <button onClick={resetAchievements} disabled={sistemLoading === 'achievements'}
                  className="text-sm px-4 py-2 rounded-lg font-bold flex-shrink-0"
                  style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                  {sistemLoading === 'achievements' ? '...' : '🏆 Sıfırla'}
                </button>
              </div>
              <div className="glass p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">Soru Silme</div>
                  <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Tüm sorular kalıcı olarak silinir</div>
                </div>
                <button onClick={resetQuestions} disabled={sistemLoading === 'questions'}
                  className="text-sm px-4 py-2 rounded-lg font-bold flex-shrink-0"
                  style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                  {sistemLoading === 'questions' ? '...' : '🗑 Sil'}
                </button>
              </div>
              <div className="glass p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">Maraton Sıfırlama</div>
                  <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Aktif maratonları sıfırlar</div>
                </div>
                <button onClick={resetMarathon} disabled={sistemLoading === 'marathon'}
                  className="text-sm px-4 py-2 rounded-lg font-bold flex-shrink-0"
                  style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                  {sistemLoading === 'marathon' ? '...' : '🔄 Sıfırla'}
                </button>
              </div>
              <div className="glass p-4 flex items-center justify-between">
                <div>
                  <div className="font-bold">Test Silme</div>
                  <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Tüm testler kalıcı olarak silinir</div>
                </div>
                <button onClick={resetTests} disabled={sistemLoading === 'tests'}
                  className="text-sm px-4 py-2 rounded-lg font-bold flex-shrink-0"
                  style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                  {sistemLoading === 'tests' ? '...' : '🗑 Sil'}
                </button>
              </div>
            </div>
          </div>

          {/* Bot Yönetimi */}
          <div className="glass p-5">
            <h3 className="font-bold mb-1" style={{ color: '#4FC3F7' }}>🤖 Bot Yönetimi</h3>
            <p className="text-sm mb-4" style={{ color: '#B0BEC5' }}>
              Mevcut bot sayısı: <strong style={{ color: '#FFD700' }}>{botTotal ?? '...'}</strong>
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>Dil / Ülke</label>
                <select className="input-field w-full" value={botLanguage} onChange={e => setBotLanguage(e.target.value)}>
                  <option value="turkish">🇹🇷 Türkçe</option>
                  <option value="english">🇬🇧 İngilizce</option>
                  <option value="spanish">🇪🇸 İspanyolca</option>
                  <option value="french">🇫🇷 Fransızca</option>
                  <option value="german">🇩🇪 Almanca</option>
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>Bot Sayısı</label>
                <input type="number" className="input-field w-full" value={botCount} min={1} max={500}
                  onChange={e => setBotCount(parseInt(e.target.value))} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={createBots} disabled={sistemLoading === 'bots'}
                className="btn-gold flex-1">
                {sistemLoading === 'bots' ? '...' : '➕ Bot Oluştur'}
              </button>
              <button onClick={deleteAllBots} disabled={sistemLoading === 'delbots'}
                className="flex-1 text-sm px-4 py-2 rounded-lg font-bold"
                style={{ background: 'rgba(244,67,54,0.2)', color: '#F44336' }}>
                {sistemLoading === 'delbots' ? '...' : '🗑 Tüm Botları Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNVANLAR */}
      {tab === 'unvanlar' && (
        <div className="animate-fade-in">
          <div className="glass p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold" style={{ color: '#FFD700' }}>🏅 Unvan Sistemi</h3>
              <div className="flex gap-2">
                <button onClick={() => setTitles([...titles, { min_xp: 0, title: 'Yeni Unvan', color: '#4FC3F7', icon: '🎯' }])}
                  className="text-sm px-3 py-1.5 rounded-lg font-bold"
                  style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>
                  + Unvan Ekle
                </button>
                <button onClick={saveTitles} disabled={settingsSaving} className="btn-gold text-sm" style={{ padding: '6px 16px' }}>
                  {settingsSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
                </button>
              </div>
            </div>
            <p className="text-xs mb-4" style={{ color: '#B0BEC5' }}>
              ☰ Satırları sürükleyerek sıralayın. Sıralama min XP'ye göre otomatik düzenlenir.
            </p>

            <div className="space-y-2">
              {titles.map((t, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault()
                    const from = parseInt(e.dataTransfer.getData('text/plain'))
                    const to = i
                    if (from === to) return
                    const newTitles = [...titles]
                    const [moved] = newTitles.splice(from, 1)
                    newTitles.splice(to, 0, moved)
                    setTitles(newTitles)
                  }}
                  className="glass p-3 flex items-center gap-3"
                  style={{ cursor: 'grab', border: '1px solid rgba(255,255,255,0.1)' }}>

                  {/* Sürükle ikonu */}
                  <span style={{ color: '#555', fontSize: 18, cursor: 'grab' }}>☰</span>

                  {/* İkon */}
                  <input className="input-field text-center text-xl"
                    style={{ width: 52 }}
                    value={t.icon || ''}
                    onChange={e => {
                      const n = [...titles]; n[i] = { ...t, icon: e.target.value }; setTitles(n)
                    }}
                  />

                  {/* Unvan adı */}
                  <input className="input-field flex-1"
                    placeholder="Unvan adı"
                    value={t.title}
                    onChange={e => {
                      const n = [...titles]; n[i] = { ...t, title: e.target.value }; setTitles(n)
                    }}
                  />

                  {/* Renk */}
                  <div className="flex items-center gap-2">
                    <input type="color"
                      value={t.color}
                      onChange={e => {
                        const n = [...titles]; n[i] = { ...t, color: e.target.value }; setTitles(n)
                      }}
                      style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'none' }}
                    />
                    <input className="input-field"
                      style={{ width: 90 }}
                      value={t.color}
                      onChange={e => {
                        const n = [...titles]; n[i] = { ...t, color: e.target.value }; setTitles(n)
                      }}
                    />
                  </div>

                  {/* Min XP */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs" style={{ color: '#B0BEC5' }}>XP:</span>
                    <input type="number" className="input-field"
                      style={{ width: 80 }}
                      value={t.min_xp}
                      onChange={e => {
                        const n = [...titles]; n[i] = { ...t, min_xp: parseInt(e.target.value) || 0 }; setTitles(n)
                      }}
                    />
                  </div>

                  {/* Önizleme */}
                  <span className="text-xl">{t.icon}</span>
                  <span className="text-sm font-bold" style={{ color: t.color, minWidth: 80 }}>{t.title}</span>

                  {/* Sil */}
                  <button onClick={() => setTitles(titles.filter((_, j) => j !== i))}
                    style={{ color: '#F44336', fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AYARLAR */}
      {tab === 'ayarlar' && siteSettings && (
        <div className="animate-fade-in space-y-4">

          {/* Modüller */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>🔧 Modüller</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'match_1v1', label: '1v1 İnsan Maçı' },
                { key: 'match_bot', label: '1v1 Bot Maçı' },
                { key: 'marathon', label: 'Maraton' },
                { key: 'league_daily', label: 'Günlük Lig' },
                { key: 'league_weekly', label: 'Haftalık Lig' },
                { key: 'league_monthly', label: 'Aylık Lig' },
                { key: 'league_yearly', label: 'Yıllık Lig' },
              ].map(m => (
                <div key={m.key} className="flex items-center justify-between glass p-3">
                  <span className="text-sm font-bold">{m.label}</span>
                  <button
                    onClick={() => saveSettings('modules', { ...siteSettings.modules, [m.key]: !siteSettings.modules[m.key] })}
                    className="px-3 py-1 rounded-lg text-sm font-bold"
                    style={{
                      background: siteSettings.modules[m.key] ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)',
                      color: siteSettings.modules[m.key] ? '#4CAF50' : '#F44336',
                    }}>
                    {siteSettings.modules[m.key] ? '✓ Açık' : '✗ Kapalı'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Maç Ayarları */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#4FC3F7' }}>⚡ Maç Ayarları</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Toplam Soru Sayısı</label>
                <input type="number" className="input-field w-full"
                  value={siteSettings.match?.total_questions || 15}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, match: { ...prev.match, total_questions: parseInt(e.target.value) }
                  }))}
                />
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Bot Bekleme Süresi (sn)</label>
                <input type="number" className="input-field w-full"
                  value={siteSettings.match?.bot_wait_seconds || 10}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, match: { ...prev.match, bot_wait_seconds: parseInt(e.target.value) }
                  }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3 mt-3">
              {['easy', 'medium', 'hard', 'very_hard'].map((d, i) => (
                <div key={d}>
                  <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>
                    {['Kolay', 'Orta', 'Zor', 'Çok Zor'][i]} Soru
                  </label>
                  <input type="number" className="input-field w-full"
                    value={siteSettings.match?.distribution?.[d] || 0}
                    onChange={e => setSiteSettings((prev: any) => ({
                      ...prev, match: {
                        ...prev.match,
                        distribution: { ...prev.match?.distribution, [d]: parseInt(e.target.value) }
                      }
                    }))}
                  />
                </div>
              ))}
            </div>

            <button onClick={() => saveSettings('match', siteSettings.match)}
              disabled={settingsSaving}
              className="btn-gold mt-4">
              {settingsSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>

          {/* Zorluk Puan ve Süre Ayarları */}
          <div className="glass p-5">
            <h3 className="font-bold mb-1" style={{ color: '#FFD700' }}>🎯 Zorluk Puan ve Süre Ayarları</h3>
            <p className="text-xs mb-4" style={{ color: '#B0BEC5' }}>Tüm maç tiplerinde geçerlidir (1v1, kategori, maraton).</p>
            {[['easy','Kolay'],['medium','Orta'],['hard','Zor'],['very_hard','Çok Zor']].map(([d, label]) => (
              <div key={d} className="grid grid-cols-3 gap-3 mb-3 items-end">
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>{label} — Doğru Puan</label>
                  <input type="number" className="input-field w-full"
                    value={siteSettings.difficulty_config?.[d]?.correct ?? 10}
                    onChange={e => setSiteSettings((prev: any) => ({
                      ...prev, difficulty_config: {
                        ...prev.difficulty_config,
                        [d]: { ...prev.difficulty_config?.[d], correct: parseInt(e.target.value) }
                      }
                    }))}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>{label} — Yanlış Ceza</label>
                  <input type="number" className="input-field w-full"
                    value={siteSettings.difficulty_config?.[d]?.wrong ?? -3}
                    onChange={e => setSiteSettings((prev: any) => ({
                      ...prev, difficulty_config: {
                        ...prev.difficulty_config,
                        [d]: { ...prev.difficulty_config?.[d], wrong: parseInt(e.target.value) }
                      }
                    }))}
                  />
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: '#B0BEC5' }}>{label} — Süre (sn)</label>
                  <input type="number" className="input-field w-full"
                    value={siteSettings.difficulty_config?.[d]?.time_limit ?? 20}
                    onChange={e => setSiteSettings((prev: any) => ({
                      ...prev, difficulty_config: {
                        ...prev.difficulty_config,
                        [d]: { ...prev.difficulty_config?.[d], time_limit: parseInt(e.target.value) }
                      }
                    }))}
                  />
                </div>
              </div>
            ))}
            <button onClick={() => saveSettings('difficulty_config', siteSettings.difficulty_config)}
              disabled={settingsSaving}
              className="btn-gold mt-2">
              {settingsSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>

          {/* Maraton Ayarları */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>🏅 Maraton Ayarları</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Katılımcı Sayısı</label>
                <input type="number" className="input-field w-full"
                  value={siteSettings.marathon?.max_participants || 128}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, marathon: { ...prev.marathon, max_participants: parseInt(e.target.value) }
                  }))}
                />
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Lobi Süresi (sn)</label>
                <input type="number" className="input-field w-full"
                  value={siteSettings.marathon?.lobby_duration_seconds || 180}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, marathon: { ...prev.marathon, lobby_duration_seconds: parseInt(e.target.value) }
                  }))}
                />
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Aralık (dakika)</label>
                <input type="number" className="input-field w-full"
                  value={siteSettings.marathon?.interval_minutes || 15}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, marathon: { ...prev.marathon, interval_minutes: parseInt(e.target.value) }
                  }))}
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Saat Dilimi (UTC Offset)</label>
              <select className="input-field w-full" value={siteSettings.marathon?.utc_offset || 3}
                onChange={e => setSiteSettings((prev: any) => ({
                  ...prev, marathon: { ...prev.marathon, utc_offset: parseInt(e.target.value) }
                }))}>
                <option value={0}>UTC+0</option>
                <option value={1}>UTC+1</option>
                <option value={2}>UTC+2</option>
                <option value={3}>UTC+3 (Türkiye)</option>
                <option value={4}>UTC+4</option>
                <option value={5}>UTC+5</option>
              </select>
            </div>
            <div className="mt-3">
              <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Tur Başına Soru</label>
              <input type="number" className="input-field" style={{ width: 100 }}
                value={siteSettings.marathon?.questions_per_round || 3}
                onChange={e => setSiteSettings((prev: any) => ({
                  ...prev, marathon: { ...prev.marathon, questions_per_round: parseInt(e.target.value) }
                }))}
              />
            </div>
            <div className="mt-3">
              <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Soru Başına Süre (sn)</label>
              <input type="number" className="input-field" style={{ width: 100 }}
                value={siteSettings.marathon?.time_per_question || 15}
                onChange={e => setSiteSettings((prev: any) => ({
                  ...prev, marathon: { ...prev.marathon, time_per_question: parseInt(e.target.value) }
                }))}
              />
            </div>
            <button onClick={() => saveSettings('marathon', siteSettings.marathon)}
              disabled={settingsSaving}
              className="btn-gold mt-4">
              {settingsSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>

          {/* Bot Ayarları */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#81C784' }}>🤖 Bot Ayarları</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Bot Sayısı</label>
                <input type="number" className="input-field w-full"
                  value={siteSettings.bots?.total_count || 500}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, bots: { ...prev.bots, total_count: parseInt(e.target.value) }
                  }))}
                />
              </div>
              <div>
                <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>Hız Çarpanı (1.0 = normal)</label>
                <input type="number" step="0.1" className="input-field w-full"
                  value={siteSettings.bots?.speed_multiplier || 1.0}
                  onChange={e => setSiteSettings((prev: any) => ({
                    ...prev, bots: { ...prev.bots, speed_multiplier: parseFloat(e.target.value) }
                  }))}
                />
              </div>
            </div>
            <button onClick={() => saveSettings('bots', siteSettings.bots)}
              disabled={settingsSaving}
              className="btn-gold mt-4">
              {settingsSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>

          {/* API Ayarları */}
          <div className="glass p-5">
            <h3 className="font-bold mb-4" style={{ color: '#E91E63' }}>🔑 API Ayarları</h3>
            <div className="mb-3">
              <label className="text-sm mb-1 block" style={{ color: '#B0BEC5' }}>OpenAI API Key</label>
              <input
                type="password"
                className="input-field w-full"
                placeholder="sk-..."
                value={siteSettings.api_keys?.openai || ''}
                onChange={e => setSiteSettings((prev: any) => ({
                  ...prev,
                  api_keys: { ...prev.api_keys, openai: e.target.value }
                }))}
              />
              <p className="text-xs mt-1" style={{ color: '#555' }}>
                Test başlığı ve üye adı moderasyonu için kullanılır.
              </p>
            </div>
            <button onClick={() => saveSettings('api_keys', siteSettings.api_keys)}
              disabled={settingsSaving}
              className="btn-gold mt-2">
              {settingsSaving ? 'Kaydediliyor...' : '💾 Kaydet'}
            </button>
          </div>

        </div>
      )}
    </div>
  )
}
