'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import { avatarSrc } from '@/lib/avatar'
import { initSounds, playSound, playCountdownTick, playCountdownBeep } from '@/lib/sound'

interface Player { user_id: string; username: string; avatar_url: string; is_bot: boolean }
type Screen = 'finding' | 'lobby_full' | 'countdown' | 'question' | 'result' | 'grid' | 'end'
interface CellRes { is_correct: boolean; flash: boolean; answered: boolean }
const LETTERS = ['A', 'B', 'C', 'D'] as const

export default function ArenaPage() {
  const { fetchMe } = useAuthStore()
  const router = useRouter()
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const resultTimerRef = useRef<NodeJS.Timeout | null>(null)

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
  const [history, setHistory] = useState<Record<number, Record<string, CellRes>>>({}) // qIndex -> uid -> sonuç

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
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
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
      case 'lobby_full':
        setPlayersState(msg.players || [])
        setScreen('lobby_full')
        playSound('match_found')
        break
      case 'starting': {
        setPlayersState(msg.players || [])
        setQTotal(msg.questions || 7)
        setHistory({})
        setScreen('countdown')
        let c = 3; setCountdown(3); playCountdownBeep(3)
        const iv = setInterval(() => {
          c--; setCountdown(c); playCountdownBeep(c)
          if (c <= 0) clearInterval(iv)
        }, 1000)
        break
      }
      case 'question':
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
        setQ(msg.question); setQIndex(msg.index); setQTotal(msg.total)
        setAnsweredBy({}); setMyAnswer(null); setResult(null)
        setScreen('question')
        startTimer(msg.time_limit || 10)
        playSound('new_question')
        break
      case 'player_answered':
        setAnsweredBy(prev => ({ ...prev, [msg.user_id]: msg.answer }))
        break
      case 'question_result': {
        if (timerRef.current) clearInterval(timerRef.current)
        setResult(msg)
        setScores(msg.scores || {})
        const qi = msg.index
        const row: Record<string, CellRes> = {}
        Object.entries(msg.results || {}).forEach(([uid, r]: any) => {
          row[uid] = { is_correct: !!r.is_correct, flash: !!r.flash, answered: r.answer != null }
        })
        setHistory(prev => ({ ...prev, [qi]: row }))
        setScreen('result')
        {
          const mine = msg.results?.[meRef.current]
          if (mine) playSound(mine.is_correct ? 'correct' : 'wrong')
        }
        // kısa doğru-cevap gösterimi, sonra ızgara sahnesi
        if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
        resultTimerRef.current = setTimeout(() => setScreen('grid'), 1700)
        break
      }
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
    setAnsweredBy(prev => ({ ...prev, [meRef.current]: letter }))
    wsRef.current.send(JSON.stringify({ type: 'answer', question_index: qIndex, answer: letter }))
  }

  // ── FINDING / LOBBY ──
  if (screen === 'finding' || screen === 'lobby_full') {
    const full = screen === 'lobby_full'
    return (
      <div className="min-h-screen flex flex-col items-center px-4 pt-10" style={{ maxWidth: 500, margin: '0 auto' }}>
        <Link href="/" className="self-start" style={{ color: '#B0BEC5', fontSize: 22 }}>←</Link>
        <h1 className="text-3xl font-black mb-1" style={{ color: '#FF7043' }}>🎯 Arena</h1>
        {full ? (
          <div className="text-lg font-black mb-1 arena-pulse" style={{ color: '#4CAF50' }}>Rakipler bulundu! Başlıyor…</div>
        ) : (
          <div className="text-sm mb-1" style={{ color: '#B0BEC5' }}>Rakip aranıyor… ({players.length}/{target})</div>
        )}
        <div className="text-xs mb-6" style={{ color: '#607D8B' }}>{qTotal} soru · herkes aynı anda cevaplar</div>
        <div className="w-full space-y-2">
          {players.map((p, i) => (
            <div key={p.user_id} className="glass flex items-center gap-3 p-3 arena-slidein"
              style={{ borderRadius: 12, animationDelay: `${i * 60}ms`, border: full ? '1px solid rgba(76,175,80,0.4)' : '1px solid rgba(255,255,255,0.1)' }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              <span className="font-bold" style={{ color: p.user_id === me ? '#FFD700' : '#fff' }}>{p.username}{p.user_id === me ? ' (Sen)' : ''}</span>
              {full && <span className="ml-auto" style={{ color: '#4CAF50' }}>✓</span>}
            </div>
          ))}
          {!full && Array.from({ length: Math.max(0, target - players.length) }).map((_, i) => (
            <div key={`e${i}`} className="glass flex items-center gap-3 p-3" style={{ borderRadius: 12, opacity: 0.4 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
              <span style={{ color: '#607D8B' }}>Bekleniyor…</span>
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
        <div key={countdown} className="text-9xl font-black arena-pop" style={{ color: '#FFD700' }}>{countdown || 'Başla!'}</div>
        <div className="mt-6 text-sm" style={{ color: '#B0BEC5' }}>{players.length} oyuncu hazır</div>
      </div>
    )
  }

  // ── END (Sonuçlar + Podyum) ──
  if (screen === 'end') {
    const mine = ranking.find(r => r.user_id === me)
    const top3 = ranking.slice(0, 3)
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) // 2 - 1 - 3
    const podiumH: Record<number, number> = { 1: 96, 2: 72, 3: 56 }
    const medal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank
    return (
      <div className="min-h-screen px-4 pt-8 pb-10" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 className="text-3xl font-black text-center" style={{ color: mine?.rank === 1 ? '#FFD700' : '#FF7043' }}>
          {mine?.rank === 1 ? '🏆 Kazandın!' : mine?.rank === 2 ? '🥈 2. oldun!' : mine?.rank === 3 ? '🥉 3. oldun!' : '🏁 Sonuçlar'}
        </h1>
        <p className="text-center text-xs mb-6" style={{ color: '#B0BEC5' }}>Doğru + hız + ⚡ bonusu</p>

        {/* Podyum */}
        <div className="flex items-end justify-center gap-2 mb-6">
          {podiumOrder.map(p => (
            <div key={p.user_id} className="flex flex-col items-center" style={{ width: 96 }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                style={{ width: p.rank === 1 ? 60 : 46, height: p.rank === 1 ? 60 : 46, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${p.rank === 1 ? '#FFD700' : p.rank === 2 ? '#B0BEC5' : '#CD7F32'}` }} />
              <div className="text-xs font-bold mt-1 truncate" style={{ maxWidth: 90, color: p.user_id === me ? '#FFD700' : '#fff' }}>{p.username}</div>
              <div className="text-xs font-black" style={{ color: '#FFD700' }}>{p.total}</div>
              <div className="w-full flex items-center justify-center font-black text-2xl"
                style={{ height: podiumH[p.rank] || 40, marginTop: 4, borderRadius: '10px 10px 0 0', background: p.rank === 1 ? 'rgba(255,215,0,0.25)' : p.rank === 2 ? 'rgba(176,190,197,0.2)' : 'rgba(205,127,50,0.2)' }}>
                {medal(p.rank)}
              </div>
            </div>
          ))}
        </div>

        {/* Özetlersek — tam tablo */}
        <div className="glass overflow-hidden" style={{ borderRadius: 14 }}>
          <div className="grid px-3 py-2 text-xs font-bold" style={{ gridTemplateColumns: '30px 1fr 44px 44px 60px', color: '#B0BEC5', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <span>#</span><span>Oyuncu</span><span className="text-center">✓</span><span className="text-center">⚡</span><span className="text-right">Puan</span>
          </div>
          {ranking.map(r => (
            <div key={r.user_id} className="grid px-3 py-2 items-center"
              style={{ gridTemplateColumns: '30px 1fr 44px 44px 60px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: r.user_id === me ? 'rgba(255,215,0,0.08)' : 'transparent' }}>
              <span className="font-black" style={{ color: r.rank === 1 ? '#FFD700' : r.rank === 2 ? '#B0BEC5' : r.rank === 3 ? '#CD7F32' : '#607D8B' }}>{medal(r.rank)}</span>
              <div className="flex items-center gap-2 min-w-0">
                <img src={avatarSrc(r.avatar_url, r.username)} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                <span className="font-bold truncate" style={{ color: r.user_id === me ? '#FFD700' : '#fff' }}>{r.username}</span>
              </div>
              <span className="text-center font-bold" style={{ color: '#4CAF50' }}>{r.correct}</span>
              <span className="text-center font-bold" style={{ color: '#FFD54F' }}>{r.flash}</span>
              <div className="text-right">
                <div className="font-black" style={{ color: '#FFD700' }}>{r.total}</div>
                {r.bonus > 0 && <div style={{ fontSize: 10, color: '#E91E63' }}>+{r.bonus}</div>}
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => router.push('/')} className="btn-gold w-full mt-6 py-3 font-black">Ana sayfaya dön</button>
        <button onClick={() => window.location.reload()} className="w-full mt-2 py-3 font-black" style={{ color: '#FF7043' }}>🎯 Yeni Arena</button>
      </div>
    )
  }

  // ── IZGARA SAHNESİ (her sorudan sonra) ──
  if (screen === 'grid') {
    const answeredCount = qIndex + 1
    const remaining = Math.max(0, qTotal - answeredCount)
    const rowsQ: number[] = []
    for (let i = qIndex; i >= 0; i--) rowsQ.push(i)  // yeni soru en üstte
    const correctCounts: Record<string, number> = {}
    players.forEach(p => {
      let c = 0
      for (let i = 0; i <= qIndex; i++) if (history[i]?.[p.user_id]?.is_correct) c++
      correctCounts[p.user_id] = c
    })
    const myLast = history[qIndex]?.[me]
    const banners = myLast?.is_correct
      ? ['Aynen böyle devam!', 'Harika gidiyorsun!', 'Süpersin!', 'Çok iyi!']
      : ['Bir sonrakini kap!', 'Vazgeçme!', 'Toparlanırsın!', 'Bu sefer olmadı!']
    const banner = banners[qIndex % banners.length]
    const cols = players.length || 5
    // Hücreyi hem genişliğe hem yüksekliğe sığdır — böylece her cihazda kaydırmasız
    const CELL = `min(calc(88vw / ${cols}), 7.4vh, 68px)`
    const gap = 'min(1.6vw, 0.8vh)'
    const gridCols = `repeat(${cols}, ${CELL})`
    const Cell = ({ r }: { r?: CellRes }) => (
      <div style={{
        position: 'relative', width: CELL, height: CELL, borderRadius: 'min(2vw,10px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: r ? (r.is_correct ? '#6d7d54' : '#b07f88') : 'transparent',
        border: r ? 'none' : '2px solid rgba(79,195,247,0.55)',
        color: '#fff', fontSize: 'min(6vw,3.4vh)', fontWeight: 900,
      }}>
        {r ? (r.is_correct ? '✓' : '✕') : ''}
        {r?.flash && (
          <span style={{ position: 'absolute', top: '-5%', left: '-5%', background: '#FFC107', borderRadius: '50%', width: 'min(4.4vw,2.4vh)', height: 'min(4.4vw,2.4vh)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'min(2.6vw,1.5vh)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>⚡</span>
        )}
      </div>
    )
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'linear-gradient(180deg,#141a3a,#0A0E27)', display: 'flex', flexDirection: 'column' }}>
        {/* banner */}
        <div className="flex items-center gap-3 px-4" style={{ background: myLast?.is_correct ? '#7CB342' : '#EF6C00', paddingTop: 'min(3vh,16px)', paddingBottom: 'min(3vh,16px)', flexShrink: 0 }}>
          <Link href="/" style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: 34, height: 34, minWidth: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 20, textDecoration: 'none' }}>←</Link>
          <div className="font-black arena-pop truncate" style={{ color: '#fff', fontSize: 'clamp(18px,5vw,30px)' }}>{banner}</div>
        </div>

        {/* ızgara */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap }}>
          {Array.from({ length: remaining }).map((_, ri) => (
            <div key={`e${ri}`} style={{ display: 'grid', gridTemplateColumns: gridCols, gap }}>
              {players.map(p => <Cell key={p.user_id} />)}
            </div>
          ))}
          {rowsQ.map(qq => (
            <div key={qq} className="arena-slideup" style={{ display: 'grid', gridTemplateColumns: gridCols, gap }}>
              {players.map(p => <Cell key={p.user_id} r={history[qq]?.[p.user_id] || { is_correct: false, flash: false, answered: false }} />)}
            </div>
          ))}
          {/* doğru/toplam */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap, marginTop: 'min(1vh,6px)' }}>
            {players.map(p => (
              <div key={p.user_id} className="text-center font-black" style={{ color: '#B0BEC5', fontSize: 'min(3.4vw,1.9vh)' }}>
                {correctCounts[p.user_id]}/{qTotal}
              </div>
            ))}
          </div>
        </div>

        {/* alt oyuncu şeridi */}
        <div className="flex items-center justify-around px-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', paddingTop: 'min(1.4vh,10px)', paddingBottom: 'min(1.4vh,10px)', flexShrink: 0 }}>
          {players.map(p => (
            <div key={p.user_id} className="flex flex-col items-center" style={{ minWidth: 0, flex: 1 }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                style={{ width: 'min(11vw,44px)', height: 'min(11vw,44px)', borderRadius: '50%', objectFit: 'cover', border: p.user_id === me ? '2px solid #FFD700' : '2px solid rgba(255,255,255,0.15)' }} />
              <span style={{ fontSize: 10, color: '#B0BEC5', marginTop: 3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
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
              <span style={{ display: 'inline-block', width: 22, height: 22, lineHeight: '22px', textAlign: 'center', borderRadius: 6, background: 'rgba(255,255,255,0.12)', marginRight: 10, fontSize: 13 }}>{letter}</span>
              {text}
              {/* cevaplayanların avatarları — büyük gelip küçülür (avatar-fly) */}
              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                {answerers.map((p, i) => (
                  <span key={p.user_id} style={{ position: 'relative', marginLeft: i === 0 ? 0 : -10 }}>
                    <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                      className="arena-fly"
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: p.user_id === me ? '2px solid #FFD700' : '2px solid #0A0E27' }} />
                    {result?.results?.[p.user_id]?.flash && (
                      <span style={{ position: 'absolute', top: -6, right: -6, fontSize: 12 }}>⚡</span>
                    )}
                  </span>
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* alt oyuncu şeridi (soru sırasında) */}
      {screen === 'question' && (
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
      )}
    </div>
  )
}
