'use client'
import Link from 'next/link'

export default function GecmisPage() {
  return (
    <div className="min-h-screen px-3 pt-4" style={{ paddingBottom: 96, maxWidth: 700, margin: '0 auto' }}>
      <h1 className="text-2xl font-black mb-1" style={{ color: '#81C784' }}>🕐 Geçmiş</h1>
      <p className="text-sm mb-6" style={{ color: '#B0BEC5' }}>Son cevapladığın sorular</p>
      <div className="glass p-8 text-center" style={{ borderRadius: 14 }}>
        <div className="text-5xl mb-3">🚧</div>
        <div className="font-bold mb-1" style={{ color: '#fff' }}>Yakında</div>
        <div className="text-sm" style={{ color: '#B0BEC5' }}>Cevapladığın soruların geçmişi burada listelenecek.</div>
        <Link href="/" className="btn-primary inline-block mt-5">← Ana Sayfa</Link>
      </div>
    </div>
  )
}
