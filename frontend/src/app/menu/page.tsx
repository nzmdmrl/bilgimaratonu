'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import { isMuted, toggleMuted } from '@/lib/sound'

type Tab = 'ayarlar' | 'oyun' | 'gizlilik' | 'hesap'

function LinkCard({ href, icon, label, color }: { href: string; icon: string; label: string; color: string }) {
  return (
    <Link href={href} className="glass p-5 relative flex flex-col justify-between" style={{ borderRadius: 16, minHeight: 96, textDecoration: 'none', border: `1px solid ${color}33` }}>
      <span className="absolute text-2xl" style={{ top: 12, right: 12 }}>{icon}</span>
      <span className="font-black text-sm mt-auto" style={{ color }}>{label}</span>
    </Link>
  )
}

export default function MenuPage() {
  const { user, fetchMe, logout } = useAuthStore()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('ayarlar')
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    setMuted(isMuted())
    fetchMe().then(() => { if (!useAuthStore.getState().user) router.push('/giris') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'ayarlar', label: 'Ayarlar', icon: '⚙️' },
    { key: 'oyun', label: 'Oyun', icon: '🎮' },
    { key: 'gizlilik', label: 'Gizlilik', icon: '🔒' },
    { key: 'hesap', label: 'Hesap', icon: '👤' },
  ]

  return (
    <div className="min-h-screen px-3 pt-4" style={{ paddingBottom: 96, maxWidth: 700, margin: '0 auto' }}>
      <div className="text-center mb-4">
        <h1 className="text-2xl font-black"><span style={{ color: '#FFD700' }}>Bilgi</span> <span style={{ color: '#4FC3F7' }}>Maratonu</span></h1>
        <div className="text-xs" style={{ color: '#607D8B' }}>Menü</div>
      </div>

      {/* Sekmeler */}
      <div className="flex gap-2 mb-4">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 py-2 rounded-xl text-xs font-bold"
            style={{
              background: tab === t.key ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
              border: tab === t.key ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
              color: tab === t.key ? '#4FC3F7' : '#B0BEC5',
            }}>
            {t.icon}<br />{t.label}
          </button>
        ))}
      </div>

      {tab === 'ayarlar' && (
        <div className="grid grid-cols-2 gap-3">
          {/* Ses toggle */}
          <button onClick={() => setMuted(toggleMuted())}
            className="glass p-5 relative flex flex-col justify-between text-left"
            style={{ borderRadius: 16, minHeight: 96, border: '1px solid #4FC3F733' }}>
            <span className="absolute text-2xl" style={{ top: 12, right: 12 }}>{muted ? '🔇' : '🔊'}</span>
            <span className="font-black text-sm mt-auto" style={{ color: '#4FC3F7' }}>Ses {muted ? '(Kapalı)' : '(Açık)'}</span>
          </button>
          <LinkCard href="/bildirimler" icon="🔔" label="Bildirimler" color="#E91E63" />
          <LinkCard href="/profil-duzenle" icon="✏️" label="Profili Düzenle" color="#81C784" />
        </div>
      )}

      {tab === 'oyun' && (
        <div className="grid grid-cols-2 gap-3">
          <LinkCard href="/lig" icon="🏆" label="Lig" color="#FFB300" />
          <LinkCard href="/market" icon="🛒" label="Market" color="#9C27B0" />
          <LinkCard href="/kazandiklarim" icon="🏅" label="Kazandıkların" color="#FFD700" />
          <LinkCard href="/gecmis" icon="🕐" label="Geçmiş" color="#81C784" />
          <LinkCard href="/mini-oyunlar" icon="🧩" label="Mini Oyunlar" color="#00BCD4" />
          <LinkCard href="/testler/olustur" icon="📝" label="Test Oluştur" color="#4FC3F7" />
        </div>
      )}

      {tab === 'gizlilik' && (
        <div className="grid grid-cols-2 gap-3">
          <LinkCard href="/sayfa/gizlilik-politikasi" icon="🔒" label="Gizlilik Politikası" color="#4CAF50" />
          <LinkCard href="/sayfa/kullanici-sozlesmesi" icon="📄" label="Kullanıcı Sözleşmesi" color="#E91E63" />
          <LinkCard href="/sayfa/cerez-politikasi" icon="🍪" label="Çerez Politikası" color="#FF9800" />
          <LinkCard href="/sayfa/hakkimizda" icon="ℹ️" label="Hakkımızda" color="#4FC3F7" />
          <LinkCard href="/sayfa/iletisim" icon="✉️" label="İletişim" color="#9C27B0" />
          <LinkCard href="/blog" icon="📝" label="Blog" color="#81C784" />
        </div>
      )}

      {tab === 'hesap' && (
        <div className="grid grid-cols-2 gap-3">
          {user && <LinkCard href={`/p/${user.username}`} icon="👤" label="Profilim" color="#4FC3F7" />}
          {user?.role === 'admin' && <LinkCard href="/admin" icon="🛠" label="Admin Panel" color="#FF7043" />}
          <button onClick={() => { logout(); router.push('/') }}
            className="glass p-5 relative flex flex-col justify-between text-left"
            style={{ borderRadius: 16, minHeight: 96, border: '1px solid #F4433633' }}>
            <span className="absolute text-2xl" style={{ top: 12, right: 12 }}>🚪</span>
            <span className="font-black text-sm mt-auto" style={{ color: '#F44336' }}>Çıkış Yap</span>
          </button>
        </div>
      )}
    </div>
  )
}
