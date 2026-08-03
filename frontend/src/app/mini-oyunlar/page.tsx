'use client'
import Link from 'next/link'

const SLOTS = [
  { icon: '🧠', name: 'Bellek Oyunu', desc: 'Kartları eşleştir', color: '#00BCD4' },
  { icon: '⚡', name: 'Hızlı 10', desc: '10 soru, süreye karşı', color: '#FFB300' },
  { icon: '🔤', name: 'Anagram', desc: 'Harfleri diz, kelimeyi bul', color: '#81C784' },
  { icon: '🔢', name: 'Sayı Dizisi', desc: 'Örüntüyü hatırla', color: '#E91E63' },
]

export default function MiniOyunlarPage() {
  return (
    <div className="min-h-screen px-3 pt-4" style={{ paddingBottom: 96, maxWidth: 700, margin: '0 auto' }}>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#00BCD4' }}>🧩 Mini Oyunlar</h1>
      <p className="text-sm mb-5" style={{ color: 'var(--text-dim)' }}>Farklı bellek ve zeka oyunları — çok yakında!</p>

      <div className="grid grid-cols-2 gap-3">
        {SLOTS.map(s => (
          <div key={s.name} className="glass p-4 relative" style={{ borderRadius: 16, opacity: 0.85, border: `1px solid ${s.color}33` }}>
            <div className="text-4xl mb-2">{s.icon}</div>
            <div className="font-black text-sm" style={{ color: s.color }}>{s.name}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>{s.desc}</div>
            <span className="absolute" style={{ top: 8, right: 8, fontSize: 10, fontWeight: 800, color: '#78909C', background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 999 }}>Yakında</span>
          </div>
        ))}
      </div>

      <Link href="/" className="btn-primary inline-block mt-6">← Ana Sayfa</Link>
    </div>
  )
}
