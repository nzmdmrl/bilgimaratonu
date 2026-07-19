'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

export default function KategorilerPage() {
  const [categories, setCategories] = useState<any[]>([])

  useEffect(() => {
    api.get('/api/categories').then(r => setCategories(r.data))
  }, [])

  const generalCats = categories.filter(c => c.in_general_match)
  const specialCats = categories.filter(c => c.has_category_match)

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 className="text-3xl font-black mb-2">🗂 Kategoriler</h1>
      <p className="mb-8" style={{ color: '#B0BEC5' }}>Tüm bilgi kategorileri ve özel maçlar</p>

      {specialCats.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#FFD700' }}>⚡ Özel Kategori Maçları</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {specialCats.map(cat => (
              <Link key={cat.id} href={`/kategori-mac/${cat.slug}`}
                className="glass p-4 rounded-2xl hover:scale-105 transition-transform text-center"
                style={{ textDecoration: 'none' }}>
                <div className="text-4xl mb-2">{cat.icon}</div>
                <div className="font-bold text-sm">{cat.name}</div>
                <div className="text-xs mt-1 px-2 py-0.5 rounded-full inline-block"
                  style={{ background: 'rgba(79,195,247,0.2)', color: '#4FC3F7' }}>
                  Maça Gir
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold mb-4" style={{ color: '#B0BEC5' }}>📚 Genel Maç Kategorileri</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {generalCats.map(cat => (
            <div key={cat.id} className="glass p-4 rounded-2xl text-center opacity-70">
              <div className="text-4xl mb-2">{cat.icon}</div>
              <div className="font-bold text-sm">{cat.name}</div>
              <div className="text-xs mt-1" style={{ color: '#666' }}>Genel Maçta</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
