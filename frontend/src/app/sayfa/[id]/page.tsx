'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'

export default function StaticPage() {
  const { id } = useParams<{ id: string }>()
  const [page, setPage] = useState<{ title: string; content: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/pages/slug/${id}`)
      .then(r => setPage(r.data))
      .catch(() => setPage(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ color: '#B0BEC5' }}>
      Yükleniyor...
    </div>
  )

  if (!page) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 text-center">
        <p style={{ color: '#F44336' }}>Sayfa bulunamadı.</p>
        <Link href="/" className="btn-gold mt-4 inline-block">← Ana Sayfa</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="glass p-8 animate-fade-in">
        <h1 className="text-3xl font-black mb-6" style={{ color: '#FFD700' }}>{page.title}</h1>
        <div style={{ color: '#B0BEC5', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
          <div dangerouslySetInnerHTML={{ __html: page.content }} className="prose prose-invert max-w-none" />
        </div>
        <Link href="/" className="btn-gold inline-block mt-8">← Ana Sayfa</Link>
      </div>
    </div>
  )
}
