'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

export default function BlogPage() {
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/api/blog').then(r => setPosts(r.data.posts || [])).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="mb-8">
        <h1 className="text-3xl font-black" style={{ color: '#FFD700' }}>📝 Blog</h1>
        <p className="text-sm mt-1" style={{ color: '#B0BEC5' }}>Bilgi Maratonu'ndan haberler ve yazılar</p>
      </div>
      {posts.length === 0 ? (
        <div className="glass p-8 text-center" style={{ color: '#555' }}>Henüz yazı yok.</div>
      ) : (
        <div className="space-y-4">
          {posts.map(p => (
            <Link key={p.id} href={`/blog/${p.slug}`} className="glass p-6 block hover:scale-[1.01] transition-transform">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-xl font-black mb-2" style={{ color: '#FFD700' }}>{p.title}</h2>
                  {p.summary && <p className="text-sm" style={{ color: '#B0BEC5' }}>{p.summary}</p>}
                  <div className="flex gap-4 mt-3 text-xs" style={{ color: '#555' }}>
                    <span>📅 {p.created_at}</span>
                    <span>👁 {p.view_count} görüntülenme</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
