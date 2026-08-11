'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

// Google Analytics (GA4). Ölçüm Kimliği admin panelden (analytics.ga_id) alınır.
// Boşsa hiçbir script yüklenmez.
export default function GoogleAnalytics() {
  const [gaId, setGaId] = useState('')
  const pathname = usePathname()

  useEffect(() => {
    fetch(`${API}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => {
        const id = d?.analytics?.ga_id
        if (id && /^G-[A-Z0-9]+$/i.test(id)) setGaId(id)
      })
      .catch(() => {})
  }, [])

  // gtag script'ini bir kez yükle
  useEffect(() => {
    if (!gaId) return
    const w = window as any
    if (w.__gaLoaded) return
    w.__gaLoaded = true
    const s = document.createElement('script')
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`
    document.head.appendChild(s)
    w.dataLayer = w.dataLayer || []
    w.gtag = function () { w.dataLayer.push(arguments) }
    w.gtag('js', new Date())
    w.gtag('config', gaId)
  }, [gaId])

  // SPA rota değişiminde sayfa görüntüleme gönder
  useEffect(() => {
    const w = window as any
    if (!gaId || !w.gtag) return
    w.gtag('config', gaId, { page_path: pathname })
  }, [pathname, gaId])

  return null
}
