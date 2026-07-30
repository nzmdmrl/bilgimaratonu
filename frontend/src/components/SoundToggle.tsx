'use client'
import { useEffect, useState } from 'react'
import { isMuted, toggleMuted } from '@/lib/sound'

export default function SoundToggle() {
  const [muted, setMutedState] = useState(false)

  useEffect(() => { setMutedState(isMuted()) }, [])

  return (
    <button
      onClick={() => setMutedState(toggleMuted())}
      aria-label={muted ? 'Sesi aç' : 'Sesi kapat'}
      title={muted ? 'Sesi aç' : 'Sesi kapat'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 34, height: 34, borderRadius: 8,
        background: 'rgba(255,255,255,0.05)',
        border: 'none', color: '#B0BEC5', fontSize: 16, lineHeight: 1,
        cursor: 'pointer',
      }}>
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
