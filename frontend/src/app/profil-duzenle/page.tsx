'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import Link from 'next/link'

export default function ProfileEdit() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()

  const [tab, setTab] = useState<'genel' | 'sifre' | 'email'>('genel')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [canChangeUsername, setCanChangeUsername] = useState(true)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [daysLeft, setDaysLeft] = useState(0)

  useEffect(() => {
    fetchMe().then(() => {
      const token = localStorage.getItem('access_token')
      if (!token) { router.push('/giris'); return }
    })
  }, [])

  useEffect(() => {
    if (!user) return
    setUsername(user.username)
    setEmail(user.email || '')
    setAvatarUrl((user as any).avatar_url || '')
    // Kullanıcı adı değişiklik kontrolü
    api.get('/api/profile/username-change-status').then(r => {
      setCanChangeUsername(r.data.can_change)
      setDaysLeft(r.data.days_left || 0)
    }).catch(() => {})
  }, [user])

  const showMsg = (text: string, ok: boolean) => {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 3000)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await api.post('/api/upload/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      if (r.data.pending) {
        showMsg('Fotoğrafınız incelemeye alındı. Onaylandıktan sonra profilinizde görünecek.', true)
      } else {
        setAvatarUrl(r.data.avatar_url)
        await fetchMe()
        showMsg('Profil fotoğrafı güncellendi!', true)
      }
    } catch (e: any) {
      showMsg(e.response?.data?.detail || 'Yükleme hatası', false)
    } finally { setUploadingAvatar(false) }
  }

  const saveUsername = async () => {
    if (!username.trim()) return
    setSaving(true)
    try {
      await api.put('/api/profile/username', { username })
      await fetchMe()
      showMsg('Kullanıcı adı güncellendi!', true)
    } catch (e: any) {
      showMsg(e.response?.data?.detail || 'Hata oluştu', false)
    } finally { setSaving(false) }
  }

  const savePassword = async () => {
    if (newPassword !== newPassword2) { showMsg('Şifreler eşleşmiyor', false); return }
    if (newPassword.length < 6) { showMsg('Şifre en az 6 karakter olmalı', false); return }
    setSaving(true)
    try {
      await api.put('/api/profile/password', { current_password: currentPassword, new_password: newPassword })
      setCurrentPassword(''); setNewPassword(''); setNewPassword2('')
      showMsg('Şifre güncellendi!', true)
    } catch (e: any) {
      showMsg(e.response?.data?.detail || 'Hata oluştu', false)
    } finally { setSaving(false) }
  }

  const saveEmail = async () => {
    if (!email.trim()) return
    setSaving(true)
    try {
      await api.put('/api/profile/email', { email })
      await fetchMe()
      showMsg('E-posta güncellendi!', true)
    } catch (e: any) {
      showMsg(e.response?.data?.detail || 'Hata oluştu', false)
    } finally { setSaving(false) }
  }

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`/p/${user.username}`} className="text-sm" style={{ color: '#4FC3F7' }}>← Profilime Dön</Link>
        <h1 className="text-2xl font-black" style={{ color: '#FFD700' }}>⚙️ Profil Düzenle</h1>
      </div>

      {msg && (
        <div className="glass p-3 mb-4 text-center font-bold animate-fade-in"
          style={{ color: msg.ok ? '#4CAF50' : '#F44336', border: `1px solid ${msg.ok ? '#4CAF50' : '#F44336'}` }}>
          {msg.ok ? '✓' : '✗'} {msg.text}
        </div>
      )}

      {/* Profil Fotoğrafı */}
      <div className="glass p-6 mb-4">
        <h3 className="font-bold mb-4" style={{ color: '#B0BEC5' }}>📸 Profil Fotoğrafı</h3>
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.15)' }}>
            {avatarUrl ? (
              <img src={`https://api.bilgimaratonu.com${avatarUrl}`} alt="avatar"
                className="w-full h-full rounded-full object-cover" />
            ) : (
              <span>👤</span>
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm mb-3" style={{ color: '#B0BEC5' }}>
              JPG, PNG veya WebP. Maksimum 2MB.
            </p>
            <label className="btn-gold cursor-pointer inline-block text-sm px-4 py-2">
              {uploadingAvatar ? 'Yükleniyor...' : '📸 Fotoğraf Seç'}
              <input type="file" accept="image/*" onChange={handleAvatarUpload}
                disabled={uploadingAvatar} className="hidden" />
            </label>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-4">
        {[
          { key: 'genel', label: '👤 Kullanıcı Adı' },
          { key: 'email', label: '📧 E-posta' },
          { key: 'sifre', label: '🔒 Şifre' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className="glass px-4 py-2 text-sm font-bold flex-1 transition-all"
            style={{
              border: tab === t.key ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.08)',
              color: tab === t.key ? '#FFD700' : '#B0BEC5'
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Kullanıcı Adı */}
      {tab === 'genel' && (
        <div className="glass p-6">
          <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>👤 Kullanıcı Adı</h3>
          <div className="mb-4">
            <input className="input-field w-full" value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={!canChangeUsername}
              placeholder="Kullanıcı adı" />
          </div>
          {canChangeUsername ? (
            <>
              <p className="text-xs mb-4" style={{ color: '#555' }}>
                ⚠️ Kullanıcı adını ayda 1 kez değiştirebilirsiniz.
              </p>
              <button onClick={saveUsername} disabled={saving || username === user.username}
                className="btn-gold w-full">
                {saving ? 'Kaydediliyor...' : '💾 Kaydet'}
              </button>
            </>
          ) : (
            <div className="glass p-3 text-center text-sm" style={{ color: '#FF9800' }}>
              ⏳ Kullanıcı adını değiştirmek için {daysLeft} gün beklemeniz gerekiyor.
            </div>
          )}
        </div>
      )}

      {/* E-posta */}
      {tab === 'email' && (
        <div className="glass p-6">
          <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>📧 E-posta</h3>
          <input className="input-field w-full mb-4" type="email" value={email}
            onChange={e => setEmail(e.target.value)} placeholder="E-posta adresi" />
          <button onClick={saveEmail} disabled={saving || email === user.email}
            className="btn-gold w-full">
            {saving ? 'Kaydediliyor...' : '💾 Kaydet'}
          </button>
        </div>
      )}

      {/* Şifre */}
      {tab === 'sifre' && (
        <div className="glass p-6">
          <h3 className="font-bold mb-4" style={{ color: '#FFD700' }}>🔒 Şifre Değiştir</h3>
          <input className="input-field w-full mb-3" type="password" value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)} placeholder="Mevcut şifre" />
          <input className="input-field w-full mb-3" type="password" value={newPassword}
            onChange={e => setNewPassword(e.target.value)} placeholder="Yeni şifre" />
          <input className="input-field w-full mb-4" type="password" value={newPassword2}
            onChange={e => setNewPassword2(e.target.value)} placeholder="Yeni şifre (tekrar)" />
          <button onClick={savePassword} disabled={saving}
            className="btn-gold w-full">
            {saving ? 'Kaydediliyor...' : '💾 Kaydet'}
          </button>
        </div>
      )}
    </div>
  )
}
