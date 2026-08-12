'use client'
import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.bilgimaratonu.com'

// Soru resmi — admin'de belirlenen maks yüksekliğe (ui.question_image_max_height)
// göre orantılı ölçeklenir (genişlik otomatik). Mobilde yükseklik oturur.
let cachedMax: number | null = null

export default function QuestionImage({ src }: { src?: string | null }) {
  const [maxH, setMaxH] = useState<number>(cachedMax ?? 200)

  useEffect(() => {
    if (cachedMax != null) { setMaxH(cachedMax); return }
    fetch(`${API}/api/admin/settings/public`)
      .then(r => r.json())
      .then(d => {
        const v = d?.ui?.question_image_max_height
        if (typeof v === 'number' && v > 0) { cachedMax = v; setMaxH(v) }
      })
      .catch(() => {})
  }, [])

  if (!src) return null
  const url = src.startsWith('http') ? src : `${API}${src}`
  return (
    <div className="flex justify-center mb-3" style={{ width: '100%' }}>
      <img
        src={url}
        alt=""
        style={{
          maxHeight: maxH,
          maxWidth: '100%',
          width: 'auto',
          height: 'auto',
          objectFit: 'contain',
          borderRadius: 12,
        }}
      />
    </div>
  )
}
