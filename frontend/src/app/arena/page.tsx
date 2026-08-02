'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { avatarSrc } from '@/lib/avatar'
import { initSounds, playSound, playCountdownTick, playCountdownBeep } from '@/lib/sound'

interface Player { user_id: string; username: string; avatar_url: string; is_bot: boolean }
type Screen = 'finding' | 'countdown' | 'question' | 'result' | 'end'
const LETTERS = ['A', 'B', 'C', 'D'] as const

export default function ArenaPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [me, setMe] = useState('')
  const meRef = useRef('')
  const [players, setPlayers] = useState<Player[]>([])
  const [target, setTarget] = useState(5)
  const [screen, setScreen] = useState<Screen>('finding')
  const [countdown, setCountdown] = useState(3)

  const [q, setQ] = useState<any>(null)
  const [qIndex, setQIndex] = useState(0)
  const [qTotal, setQTotal] = useState(7)
  const [timeLeft, setTimeLeft] = useState(10)
  const [maxTime, setMaxTime] = useState(10)
  const [answeredBy, setAnsweredBy] = useState<Record<string, string>>({}) // uid -> letter
  const [myAnswer, setMyAnswer] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null) // question_result
  const [scores, setScores] = useState<Record<string, number>>({})
  const [ranking, setRanking] = useState<any[]>([])

  const playerMap = useRef<Record<string, Player>>({})

  useEffect(() => {
    initSounds()
    fetchMe().then(() => {
      const token = localStorage.getItem('access_token')
      if (!token) { router.push('/giris'); return }
      connect(token)
    })
    return () => {
      wsRef.current?.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = (token: string) => {
    const ws = new WebSocket(`wss://api.bilgimaratonu.com/api/arena/ws?token=${token}`)
    wsRef.current = ws
    ws.onmessage = e => { try { handle(JSON.parse(e.data)) } catch {} }
    ws.onerror = () => {}
  }

  const setPlayersState = (ps: Player[]) => {
    setPlayers(ps)
    const m: Record<string, Player> = {}
    ps.forEach(p => { m[p.user_id] = p })
    playerMap.current = m
  }

  const startTimer = (secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setMaxTime(secs); setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); return 0 }
        playCountdownTick(t - 1)
        return t - 1
      })
    }, 1000)
  }

  const handle = (msg: any) => {
    switch (msg.type) {
      case 'connected':
        meRef.current = msg.me; setMe(msg.me); setTarget(msg.target || 5); setQTotal(msg.questions || 7)
        setPlayersState(msg.players || [])
        setScreen('finding')
        break
      case 'lobby':
        setTarget(msg.target || 5)
        setPlayersState(msg.players || [])
        break
      case 'starting': {
        setPlayersState(msg.players || [])
        setQTotal(msg.questions || 7)
        setScreen('countdown')
        let c = 3; setCountdown(3); playCountdownBeep(3)
        const iv = setInterval(() => {
          c--; setCountdown(c); playCountdownBeep(c)
          if (c <= 0) clearInterval(iv)
        }, 1000)
        break
      }
      case 'question':
        setQ(msg.question); setQIndex(msg.index); setQTotal(msg.total)
        setAnsweredBy({}); setMyAnswer(null); setResult(null)
        setScreen('question')
        startTimer(msg.time_limit || 10)
        playSound('new_question')
        break
      case 'player_answered':
        setAnsweredBy(prev => ({ ...prev, [msg.user_id]: msg.answer }))
        break
      case 'question_result':
        if (timerRef.current) clearInterval(timerRef.current)
        setResult(msg)
        setScores(msg.scores || {})
        setScreen('result')
        {
          const mine = msg.results?.[meRef.current]
          if (mine) playSound(mine.is_correct ? 'correct' : 'wrong')
        }
        break
      case 'arena_end':
        if (timerRef.current) clearInterval(timerRef.current)
        setRanking(msg.ranking || [])
        setScreen('end')
        {
          const mine = (msg.ranking || []).find((r: any) => r.user_id === meRef.current)
          if (mine && mine.rank === 1) playSound('win')
          else playSound('lose')
        }
        break
      case 'error':
        alert(msg.message || 'Arena hatası')
        router.push('/')
        break
    }
  }

  const answer = (letter: string) => {
    if (myAnswer || !wsRef.current || screen !== 'question') return
    setMyAnswer(letter)
    setAnsweredBy(prev => ({ ...prev, [me]: letter }))
    wsRef.current.send(JSON.stringify({ type: 'answer', question_index: qIndex, answer: letter }))
  }

  // ── FINDING / LOBBY ──
  if (screen === 'finding') {
    return (
      <div className="min-h-screen flex flex-col items-center px-4 pt-10" style={{ maxWidth: 500, margin: '0 auto' }}>
        <Link href="/" className="self-start" style={{ color: '#B0BEC5', fontSize: 22 }}>←</Link>
        <h1 className="text-3xl font-black mb-1" style={{ color: '#FF7043' }}>🎯 Arena</h1>
        <div className="text-sm mb-1" style={{ color: '#B0BEC5' }}>Rakip aranıyor... ({players.length}/{target})</div>
        <div className="text-xs mb-6" style={{ color: '#607D8B' }}>{qTotal} soru · herkes aynı anda cevaplar</div>
        <div className="w-full space-y-2">
          {players.map(p => (
            <div key={p.user_id} className="glass flex items-center gap-3 p-3" style={{ borderRadius: 12 }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              <span className="font-bold" style={{ color: p.user_id === me ? '#FFD700' : '#fff' }}>{p.username}{p.user_id === me ? ' (Sen)' : ''}</span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, target - players.length) }).map((_, i) => (
            <div key={`e${i}`} className="glass flex items-center gap-3 p-3" style={{ borderRadius: 12, opacity: 0.4 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
              <span style={{ color: '#607D8B' }}>Bekleniyor...</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── COUNTDOWN ──
  if (screen === 'countdown') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="text-sm font-bold mb-2" style={{ color: '#FF7043' }}>ARENA · {qTotal} SORU</div>
        <div className="text-9xl font-black" style={{ color: '#FFD700' }}>{countdown || 'Başla!'}</div>
        <div className="mt-6 text-sm" style={{ color: '#B0BEC5' }}>{players.length} oyuncu hazır</div>
      </div>
    )
  }

  // ── END ──
  if (screen === 'end') {
    return (
      <div className="min-h-screen px-4 pt-8" style={{ maxWidth: 500, margin: '0 auto' }} onClick={() => router.push('/')}>
        <h1 className="text-3xl font-black text-center mb-1" style={{ color: '#FFD700' }}>🏁 Sonuçlar</h1>
        <p className="text-center text-sm mb-5" style={{ color: '#B0BEC5' }}>Devam etmek için dokun</p>
        <div className="space-y-2">
          {ranking.map(r => (
            <div key={r.user_id} className="glass flex items-center gap-3 p-3"
              style={{ borderRadius: 12, border: r.user_id === me ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)' }}>
              <span className="font-black w-6 text-center" style={{ color: r.rank === 1 ? '#FFD700' : r.rank === 2 ? '#B0BEC5' : '#CD7F32' }}>
                {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : r.rank}
              </span>
              <img src={avatarSrc(r.avatar_url, r.username)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate" style={{ color: r.user_id === me ? '#FFD700' : '#fff' }}>{r.username}</div>
                <div className="text-xs" style={{ color: '#607D8B' }}>✓ {r.correct} doğru · ⚡ {r.flash}</div>
              </div>
              <div className="text-right">
                <div className="font-black" style={{ color: '#FFD700' }}>{r.total}</div>
                {r.bonus > 0 && <div className="text-xs" style={{ color: '#E91E63' }}>+{r.bonus} bonus</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── QUESTION / RESULT ──
  const correctLetter = result?.correct_answer
  return (
    <div className="min-h-screen flex flex-col" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* üst bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-bold" style={{ color: '#FF7043' }}>Arena {qIndex + 1}/{qTotal}</span>
          <span className="font-black text-2xl" style={{ color: timeLeft <= 3 ? '#F44336' : '#FFD700' }}>{screen === 'question' ? timeLeft : ''}</span>
          <span className="text-xs" style={{ color: '#B0BEC5' }}>{q?.category_name}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full" style={{ width: `${(timeLeft / maxTime) * 100}%`, background: 'linear-gradient(90deg,#FF7043,#FFD700)', transition: 'width 1s linear' }} />
        </div>
      </div>

      {/* soru */}
      <div className="px-4 mt-4">
        {q?.image && (
          <div className="flex justify-center mb-3">
            <img src={q.image.startsWith('http') ? q.image : `https://api.bilgimaratonu.com${q.image}`} alt=""
              style={{ maxHeight: 150, maxWidth: '100%', borderRadius: 12, objectFit: 'contain' }} />
          </div>
        )}
        <h2 className="text-xl font-black mb-4" style={{ color: '#fff' }}>{q?.text}</h2>
      </div>

      {/* şıklar */}
      <div className="px-4 space-y-3 flex-1">
        {LETTERS.map(letter => {
          const text = q?.[`option_${letter.toLowerCase()}`]
          if (!text) return null
          const answerers = players.filter(p => answeredBy[p.user_id] === letter)
          const isCorrect = result && correctLetter === letter
          const isMineWrong = result && myAnswer === letter && correctLetter !== letter
          let bg = 'rgba(255,255,255,0.06)'
          let border = '1px solid rgba(255,255,255,0.12)'
          if (isCorrect) { bg = 'rgba(76,175,80,0.35)'; border = '2px solid #4CAF50' }
          else if (isMineWrong) { bg = 'rgba(244,67,54,0.3)'; border = '2px solid #F44336' }
          else if (myAnswer === letter) { bg = 'rgba(255,112,67,0.25)'; border = '2px solid #FF7043' }
          return (
            <button key={letter} onClick={() => answer(letter)} disabled={!!myAnswer || screen !== 'question'}
              style={{
                position: 'relative', width: '100%', textAlign: 'left', padding: '16px 18px',
                borderRadius: 14, background: bg, border, color: '#fff', fontWeight: 700, fontSize: 16,
                cursor: myAnswer || screen !== 'question' ? 'default' : 'pointer',
              }}>
              {text}
              {/* cevaplayanların avatarları (şıkkın üzerinde) */}
              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                {answerers.map((p, i) => (
                  <img key={p.user_id} src={avatarSrc(p.avatar_url, p.username)} alt=""
                    className="arena-pop"
                    style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', border: '2px solid #0A0E27', marginLeft: i === 0 ? 0 : -10 }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* alt oyuncu şeridi */}
      <div className="flex items-center justify-around px-2 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {players.map(p => (
          <div key={p.user_id} className="flex flex-col items-center" style={{ minWidth: 0, flex: 1 }}>
            <div style={{ position: 'relative' }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', opacity: answeredBy[p.user_id] ? 1 : 0.5, border: p.user_id === me ? '2px solid #FFD700' : '2px solid transparent' }} />
              {answeredBy[p.user_id] && (
                <span style={{ position: 'absolute', bottom: -2, right: -2, background: '#4CAF50', borderRadius: '50%', width: 14, height: 14, fontSize: 9, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
              )}
            </div>
            <span style={{ fontSize: 9, color: '#B0BEC5', marginTop: 2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
