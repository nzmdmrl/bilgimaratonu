'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get(`/api/blog/${slug}`).then(r => setPost(r.data)).catch(() => setPost(null)).finally(() => setLoading(false))
  }, [slug])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
  )

  if (!post) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass p-8 text-center">
        <p style={{ color: '#F44336' }}>Yazı bulunamadı.</p>
        <Link href="/blog" className="btn-gold mt-4 inline-block">← Blog</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen p-4" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div className="glass p-8 animate-fade-in">
        <Link href="/blog" className="text-sm mb-6 inline-block" style={{ color: '#4FC3F7' }}>← Blog'a Dön</Link>
        <h1 className="text-3xl font-black mb-3 mt-4" style={{ color: '#FFD700' }}>{post.title}</h1>
        <div className="flex gap-4 mb-6 text-xs" style={{ color: '#555' }}>
          <span>📅 {post.created_at}</span>
          <span>👁 {post.view_count} görüntülenme</span>
        </div>
        {post.summary && (
          <p className="text-base mb-6 p-4 rounded-xl" style={{ background: 'rgba(255,215,0,0.05)', color: '#B0BEC5', borderLeft: '3px solid #FFD700' }}>
            {post.summary}
          </p>
        )}
        <div style={{ color: '#B0BEC5', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
          {post.content}
        </div>
      </div>
    </div>
  )
}
