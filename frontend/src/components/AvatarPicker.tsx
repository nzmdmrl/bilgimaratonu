'use client'
import { useState, useCallback } from 'react'
import { AVATAR_STYLES, dicebear } from '@/lib/avatar'

const COUNT = 18

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10)
}

function generateOptions(): string[] {
  return Array.from({ length: COUNT }, () => {
    const style = AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)]
    return dicebear(style, randomSeed())
  })
}

export default function AvatarPicker({
  currentUrl,
  onSelect,
  saving,
}: {
  currentUrl?: string
  onSelect: (url: string) => void
  saving?: boolean
}) {
  const [options, setOptions] = useState<string[]>(() => generateOptions())

  const regenerate = useCallback(() => setOptions(generateOptions()), [])

  return (
    <div>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
        {options.map((url, i) => {
          const selected = url === currentUrl
          return (
            <button key={i} onClick={() => onSelect(url)} disabled={saving}
              style={{
                aspectRatio: '1 / 1', borderRadius: 12, padding: 4,
                background: selected ? 'rgba(79,195,247,0.2)' : 'rgba(255,255,255,0.05)',
                border: selected ? '2px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
                cursor: saving ? 'wait' : 'pointer',
              }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" style={{ width: '100%', height: '100%', borderRadius: 8, objectFit: 'cover' }} />
            </button>
          )
        })}
      </div>
      <button onClick={regenerate} disabled={saving}
        className="w-full mt-3 text-sm py-2 rounded-lg font-bold"
        style={{ background: 'rgba(255,255,255,0.06)', color: '#B0BEC5' }}>
        🎲 Yeni Seçenekler Üret
      </button>
    </div>
  )
}
