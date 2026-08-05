'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import { avatarSrc } from '@/lib/avatar'
import { initSounds, playSound, playCountdownTick, playCountdownBeep, startRadar, stopRadar, startCountRoll, stopCountRoll } from '@/lib/sound'

interface Player { user_id: string; username: string; avatar_url: string; is_bot: boolean }
type Screen = 'finding' | 'lobby_full' | 'countdown' | 'question' | 'result' | 'grid' | 'end'
interface CellRes { is_correct: boolean; flash: boolean; answered: boolean }
const LETTERS = ['A', 'B', 'C', 'D'] as const
const FRIEND_FILTERS = [
  { key: 'all', label: 'Tümü', icon: '👥' },
  { key: 'aile', label: 'Aile', icon: '👨‍👩‍👧' },
  { key: 'is', label: 'İş', icon: '💼' },
  { key: 'yakin', label: 'Yakın', icon: '💚' },
  { key: 'diger', label: 'Diğer', icon: '👤' },
]

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
  const [endProg, setEndProg] = useState(0)   // bitiş XP sayacı 0..1
  const [history, setHistory] = useState<Record<number, Record<string, CellRes>>>({}) // qIndex -> uid -> sonuç

  // Özel (davet) arena
  const [isPrivate, setIsPrivate] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [minStart, setMinStart] = useState(2)
  const [declineMsg, setDeclineMsg] = useState<string | null>(null)
  const eventRef = useRef<string | null>(null)
  // Lobide arkadaş davet
  const [inviteOpen, setInviteOpen] = useState(false)
  const [invFriends, setInvFriends] = useState<any[]>([])
  const [invSel, setInvSel] = useState<string[]>([])
  const [invFilter, setInvFilter] = useState('all')
  const [invSentMsg, setInvSentMsg] = useState<string | null>(null)

  const openInvite = async () => {
    setInviteOpen(true)
    try { const r = await api.get('/api/friends/list'); setInvFriends(r.data.friends || []) } catch {}
  }
  const sendInvite = async () => {
    if (!eventRef.current || !invSel.length) { setInviteOpen(false); return }
    try {
      const r = await api.post(`/api/events/${eventRef.current}/invite`, { friend_ids: invSel })
      setInvSentMsg(`${r.data.sent} kişiye davet gönderildi`)
      setTimeout(() => setInvSentMsg(null), 4000)
    } catch {}
    setInviteOpen(false); setInvSel([])
  }

  const playerMap = useRef<Record<string, Player>>({})

  useEffect(() => {
    initSounds()
    try { eventRef.current = new URLSearchParams(window.location.search).get('event') } catch {}
    fetchMe().then(() => {
      const token = localStorage.getItem('access_token')
      if (!token) { router.push('/giris'); return }
      connect(token)
    })
    return () => {
      wsRef.current?.close()
      if (timerRef.current) clearInterval(timerRef.current)
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current)
      stopRadar()
      stopCountRoll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bitiş ekranında XP'yi 0'dan yukarı say (sesli), bitince çlink
  useEffect(() => {
    if (screen !== 'end' || !ranking.length) return
    setEndProg(0)
    startCountRoll()
    const start = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 1300)
      setEndProg(p)
      if (p < 1) raf = requestAnimationFrame(step)
      else { stopCountRoll(); playSound('count_ding') }
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); stopCountRoll() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, ranking])

  const connect = (token: string) => {
    const ev = eventRef.current ? `&event=${encodeURIComponent(eventRef.current)}` : ''
    const ws = new WebSocket(`wss://api.bilgimaratonu.com/api/arena/ws?token=${token}${ev}`)
    wsRef.current = ws
    ws.onmessage = e => { try { handle(JSON.parse(e.data)) } catch {} }
    ws.onerror = () => {}
  }

  const startGame = () => {
    wsRef.current?.send(JSON.stringify({ type: 'start' }))
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
        setIsPrivate(!!msg.private); setIsHost(!!msg.is_host)
        if (msg.min_start) setMinStart(msg.min_start)
        setScreen('finding')
        startRadar()
        break
      case 'lobby':
        setTarget(msg.target || 5)
        setPlayersState(msg.players || [])
        break
      case 'invite_declined':
        setDeclineMsg(`${msg.username} arena davetini reddetti.`)
        setTimeout(() => setDeclineMsg(null), 5000)
        break
      case 'lobby_full':
        stopRadar()
        setPlayersState(msg.players || [])
        setScreen('lobby_full')
        playSound('match_found')
        break
      case 'starting': {
        stopRadar()
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
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8" style={{ maxWidth: 500, margin: '0 auto' }}>
        <h1 className="text-3xl font-black mb-1" style={{ color: '#FF7043' }}>🎯 Arena</h1>
        {full ? (
          <div className="text-lg font-black mb-1 arena-pulse" style={{ color: '#4CAF50' }}>Rakipler bulundu! Başlıyor…</div>
        ) : isPrivate ? (
          <div className="text-sm mb-1" style={{ color: 'var(--text-dim)' }}>Arena lobisi — arkadaşların katılması bekleniyor ({players.length}/{target})</div>
        ) : (
          <div className="text-sm mb-1" style={{ color: 'var(--text-dim)' }}>Rakip aranıyor… ({players.length}/{target})</div>
        )}
        <div className="text-xs mb-6" style={{ color: 'var(--text-dimmer)' }}>{qTotal} soru · herkes aynı anda cevaplar</div>

        {/* davet reddedildi popup (sadece ev sahibi) */}
        {declineMsg && (
          <div className="w-full mb-3 p-3 text-center font-bold arena-slidein" style={{ borderRadius: 12, background: 'rgba(244,67,54,0.15)', border: '1px solid rgba(244,67,54,0.4)', color: '#F44336' }}>
            ❌ {declineMsg}
          </div>
        )}

        <div className="w-full space-y-2">
          {players.map((p, i) => (
            <div key={p.user_id} className="glass flex items-center gap-3 p-3 arena-slidein"
              style={{ borderRadius: 12, animationDelay: `${i * 60}ms`, border: full ? '1px solid rgba(76,175,80,0.4)' : '1px solid var(--border)' }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
              <span className="font-bold" style={{ color: p.user_id === me ? '#FFD700' : '#fff' }}>{p.username}{p.user_id === me ? ' (Sen)' : ''}</span>
              {full && <span className="ml-auto" style={{ color: '#4CAF50' }}>✓</span>}
            </div>
          ))}
          {!full && Array.from({ length: Math.max(0, target - players.length) }).map((_, i) => (
            <div key={`e${i}`} className="glass flex items-center gap-3 p-3" style={{ borderRadius: 12, opacity: 0.4 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface-2)' }} />
              <span style={{ color: 'var(--text-dimmer)' }}>Bekleniyor…</span>
            </div>
          ))}
        </div>

        {/* özel arena: ev sahibi başlat butonu */}
        {isPrivate && !full && (
          <div className="w-full mt-5">
            {isHost && eventRef.current && (
              <>
                {invSentMsg && (
                  <div className="w-full mb-2 p-2 text-center text-sm font-bold" style={{ borderRadius: 10, background: 'rgba(76,175,80,0.15)', color: '#4CAF50' }}>✓ {invSentMsg}</div>
                )}
                {!inviteOpen ? (
                  <div className="flex gap-2 mb-3">
                    <button onClick={openInvite} className="flex-1 glass p-2 text-sm font-bold" style={{ color: '#81C784', borderRadius: 10 }}>
                      🤝 Arkadaş Davet Et
                    </button>
                    <button onClick={() => {
                      const link = `${window.location.origin}/arena?event=${eventRef.current}`
                      navigator.clipboard.writeText(link); alert('Katılım linki kopyalandı!')
                    }} className="flex-1 glass p-2 text-sm font-bold" style={{ color: 'var(--blue)', borderRadius: 10 }}>
                      📋 Linki Kopyala
                    </button>
                  </div>
                ) : (
                  <div className="glass p-3 mb-3" style={{ borderRadius: 12 }}>
                    <div className="flex gap-1 mb-2 flex-wrap">
                      {FRIEND_FILTERS.map(ff => (
                        <button key={ff.key} onClick={() => setInvFilter(ff.key)}
                          className="text-xs px-2 py-1 rounded-full font-bold"
                          style={{ background: invFilter === ff.key ? 'rgba(255,112,67,0.2)' : 'var(--surface-2)', border: invFilter === ff.key ? '1px solid #FF7043' : '1px solid var(--border)', color: invFilter === ff.key ? '#FF7043' : 'var(--text-dim)' }}>
                          {ff.icon} {ff.label}
                        </button>
                      ))}
                    </div>
                    {invFriends.length === 0 ? (
                      <div className="text-xs text-center py-3" style={{ color: 'var(--text-dim)' }}>Arkadaş yok.</div>
                    ) : (
                      <div className="space-y-1" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {invFriends.filter(f => invFilter === 'all' || (f.type || 'diger') === invFilter).map(f => {
                          const sel = invSel.includes(f.user_id)
                          return (
                            <button key={f.user_id} onClick={() => setInvSel(prev => sel ? prev.filter(x => x !== f.user_id) : [...prev, f.user_id])}
                              className="w-full flex items-center gap-2 p-2 rounded-lg" style={{ border: sel ? '2px solid #4CAF50' : '1px solid var(--border)' }}>
                              <img src={avatarSrc(f.avatar_url, f.username)} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                              <span className="text-sm font-bold flex-1 text-left">{f.username}</span>
                              {sel && <span style={{ color: '#4CAF50' }}>✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    <button onClick={sendInvite} className="btn-gold w-full mt-2" style={{ fontSize: 14, padding: '8px' }}>
                      {invSel.length ? `Davet Et (${invSel.length})` : 'Kapat'}
                    </button>
                  </div>
                )}
              </>
            )}
            {isHost ? (
              <>
                <button onClick={startGame} disabled={players.length < minStart}
                  className="w-full font-black py-3" style={{
                    borderRadius: 12,
                    background: players.length >= minStart ? 'linear-gradient(135deg,#FF7043,#FF5722)' : 'var(--surface-2)',
                    color: players.length >= minStart ? '#fff' : 'var(--text-dimmer)',
                    border: players.length >= minStart ? 'none' : '1px solid var(--border)',
                  }}>
                  {players.length >= minStart ? `🎯 Arenayı Başlat (${players.length} kişi)` : `Başlatmak için en az ${minStart} kişi`}
                </button>
                <div className="text-xs text-center mt-2" style={{ color: 'var(--text-dimmer)' }}>
                  Herkesi beklemeden {minStart}+ kişiyle başlatabilirsin.
                </div>
              </>
            ) : (
              <div className="text-center text-sm py-2" style={{ color: 'var(--text-dim)' }}>
                Ev sahibi başlatınca arena başlayacak…
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── COUNTDOWN ──
  if (screen === 'countdown') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="text-sm font-bold mb-2" style={{ color: '#FF7043' }}>ARENA · {qTotal} SORU</div>
        <div key={countdown} className="text-9xl font-black arena-pop" style={{ color: 'var(--gold)' }}>{countdown || 'Başla!'}</div>
        <div className="mt-6 text-sm" style={{ color: 'var(--text-dim)' }}>{players.length} oyuncu hazır</div>
      </div>
    )
  }

  // ── END (Sonuçlar + Podyum) ──
  if (screen === 'end') {
    const mine = ranking.find(r => r.user_id === me)
    const top3 = ranking.slice(0, 3)
    const podiumOrder = [top3[1], top3[0], top3[2]].filter(Boolean) // 2 - 1 - 3
    const podiumH: Record<number, number> = { 1: 64, 2: 48, 3: 38 }
    const medal = (rank: number) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank
    return (
      <div className="min-h-screen px-4 pt-3 pb-4" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 className="text-2xl font-black text-center" style={{ color: mine?.rank === 1 ? '#FFD700' : '#FF7043' }}>
          {mine?.rank === 1 ? '🏆 Kazandın!' : mine?.rank === 2 ? '🥈 2. oldun!' : mine?.rank === 3 ? '🥉 3. oldun!' : '🏁 Sonuçlar'}
        </h1>
        <p className="text-center text-xs mb-3" style={{ color: 'var(--text-dim)' }}>Doğru + hız + ⚡ bonusu</p>

        {/* Podyum */}
        <div className="flex items-end justify-center gap-2 mb-3">
          {podiumOrder.map(p => (
            <div key={p.user_id} className="flex flex-col items-center" style={{ width: 96 }}>
              <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                style={{ width: p.rank === 1 ? 52 : 40, height: p.rank === 1 ? 52 : 40, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${p.rank === 1 ? '#FFD700' : p.rank === 2 ? 'var(--text-dim)' : '#CD7F32'}` }} />
              <div className="text-xs font-bold mt-1 truncate" style={{ maxWidth: 90, color: p.user_id === me ? '#FFD700' : '#fff' }}>{p.username}</div>
              <div className="text-xs font-black" style={{ color: 'var(--gold)' }}>{p.total}</div>
              <div className="w-full flex items-center justify-center font-black text-xl"
                style={{ height: podiumH[p.rank] || 30, marginTop: 3, borderRadius: '10px 10px 0 0', background: p.rank === 1 ? 'rgba(255,215,0,0.25)' : p.rank === 2 ? 'rgba(176,190,197,0.2)' : 'rgba(205,127,50,0.2)' }}>
                {medal(p.rank)}
              </div>
            </div>
          ))}
        </div>

        {/* Kazanılan XP (sayaçlı) */}
        {mine && (
          <div className="text-center mb-3">
            <span className="font-black" style={{ fontSize: 20, color: 'var(--gold)' }}>⭐ +{Math.round((mine.xp || 0) * endProg)} XP kazandın!</span>
          </div>
        )}

        {/* Özetlersek — tam tablo */}
        <div className="glass overflow-hidden" style={{ borderRadius: 14 }}>
          <div className="grid px-3 py-2 text-xs font-bold" style={{ gridTemplateColumns: '26px 1fr 34px 34px 46px 50px', color: 'var(--text-dim)', borderBottom: '1px solid var(--border)' }}>
            <span>#</span><span>Oyuncu</span><span className="text-center">✓</span><span className="text-center">⚡</span><span className="text-right">Puan</span><span className="text-right">XP</span>
          </div>
          {ranking.map(r => (
            <div key={r.user_id} className="grid px-3 py-1.5 items-center"
              style={{ gridTemplateColumns: '26px 1fr 34px 34px 46px 50px', borderBottom: '1px solid var(--border)', background: r.user_id === me ? 'rgba(255,215,0,0.08)' : 'transparent' }}>
              <span className="font-black" style={{ color: r.rank === 1 ? '#FFD700' : r.rank === 2 ? 'var(--text-dim)' : r.rank === 3 ? '#CD7F32' : 'var(--text-dimmer)' }}>{medal(r.rank)}</span>
              <div className="flex items-center gap-2 min-w-0">
                <img src={avatarSrc(r.avatar_url, r.username)} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }} />
                <span className="font-bold truncate" style={{ color: r.user_id === me ? '#FFD700' : '#fff' }}>{r.username}</span>
              </div>
              <span className="text-center font-bold" style={{ color: '#4CAF50' }}>{r.correct}</span>
              <span className="text-center font-bold" style={{ color: '#FFD54F' }}>{r.flash}</span>
              <div className="text-right">
                <div className="font-black" style={{ color: 'var(--gold)' }}>{r.total}</div>
                {r.bonus > 0 && <div style={{ fontSize: 10, color: '#E91E63' }}>+{r.bonus}</div>}
              </div>
              <span className="text-right font-bold" style={{ color: '#81C784' }}>+{Math.round((r.xp || 0) * endProg)}</span>
            </div>
          ))}
        </div>

        {isPrivate ? (
          <>
            {isHost ? (
              <button onClick={() => wsRef.current?.send(JSON.stringify({ type: 'restart' }))}
                className="btn-gold w-full mt-3 py-2.5 font-black">🔁 Tekrarla</button>
            ) : (
              <div className="text-center text-sm mt-3 mb-1" style={{ color: 'var(--text-dim)' }}>Ev sahibi yeni tur başlatabilir…</div>
            )}
            <button onClick={() => router.push('/')} className="w-full mt-2 py-2.5 font-black" style={{ color: 'var(--text-dim)' }}>Ana sayfaya dön</button>
          </>
        ) : (
          <>
            <button onClick={() => router.push('/')} className="btn-gold w-full mt-3 py-2.5 font-black">Ana sayfaya dön</button>
            <button onClick={() => window.location.reload()} className="w-full mt-1 py-2 font-black" style={{ color: '#FF7043' }}>🎯 Yeni Arena</button>
          </>
        )}
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
        color: 'var(--text)', fontSize: 'min(6vw,3.4vh)', fontWeight: 900,
      }}>
        {r ? (r.is_correct ? '✓' : '✕') : ''}
        {r?.flash && (
          <span style={{ position: 'absolute', top: '-5%', left: '-5%', background: '#FFC107', borderRadius: '50%', width: 'min(4.4vw,2.4vh)', height: 'min(4.4vw,2.4vh)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'min(2.6vw,1.5vh)', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>⚡</span>
        )}
      </div>
    )
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'linear-gradient(180deg,#141a3a,var(--bg))', display: 'flex', flexDirection: 'column' }}>
        {/* banner */}
        <div className="flex items-center gap-3 px-4" style={{ background: myLast?.is_correct ? '#7CB342' : '#EF6C00', paddingTop: 'min(3vh,16px)', paddingBottom: 'min(3vh,16px)', flexShrink: 0 }}>
          <Link href="/" style={{ background: 'rgba(255,255,255,0.25)', borderRadius: '50%', width: 34, height: 34, minWidth: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text)', fontSize: 20, textDecoration: 'none' }}>←</Link>
          <div className="font-black arena-pop truncate" style={{ color: 'var(--text)', fontSize: 'clamp(18px,5vw,30px)' }}>{banner}</div>
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
              <div key={p.user_id} className="text-center font-black" style={{ color: 'var(--text-dim)', fontSize: 'min(3.4vw,1.9vh)' }}>
                {correctCounts[p.user_id]}/{qTotal}
              </div>
            ))}
          </div>
        </div>

        {/* alt oyuncu şeridi — ızgarayla aynı genişlikte ve ortalı */}
        <div className="flex justify-center px-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)', paddingTop: 'min(1.4vh,10px)', paddingBottom: 'min(1.4vh,10px)', flexShrink: 0 }}>
          <div className="flex items-start justify-around" style={{ width: '100%', maxWidth: `calc(${cols} * 68px + ${cols - 1} * 12px + 40px)` }}>
            {players.map(p => (
              <div key={p.user_id} className="flex flex-col items-center" style={{ minWidth: 0, flex: 1 }}>
                <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                  style={{ width: 'min(11vw,44px)', height: 'min(11vw,44px)', borderRadius: '50%', objectFit: 'cover', border: p.user_id === me ? '2px solid #FFD700' : '2px solid var(--border)' }} />
                <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 3, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
              </div>
            ))}
          </div>
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
          <span className="font-bold ml-10 md:ml-0" style={{ color: '#FF7043' }}>Arena {qIndex + 1}/{qTotal}</span>
          <span className="font-black text-2xl" style={{ color: timeLeft <= 3 ? '#F44336' : '#FFD700' }}>{screen === 'question' ? timeLeft : ''}</span>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>{q?.category_name}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}>
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
        <h2 className="text-xl font-black mb-4" style={{ color: 'var(--text)' }}>{q?.text}</h2>
      </div>

      {/* şıklar */}
      <div className="px-4 space-y-3 flex-1">
        {LETTERS.map(letter => {
          const text = q?.[`option_${letter.toLowerCase()}`]
          if (!text) return null
          const answerers = players.filter(p => answeredBy[p.user_id] === letter)
          const isCorrect = result && correctLetter === letter
          const isMineWrong = result && myAnswer === letter && correctLetter !== letter
          let bg = 'var(--surface-2)'
          let border = '1px solid var(--border)'
          if (isCorrect) { bg = 'rgba(76,175,80,0.35)'; border = '2px solid #4CAF50' }
          else if (isMineWrong) { bg = 'rgba(244,67,54,0.3)'; border = '2px solid #F44336' }
          else if (myAnswer === letter) { bg = 'rgba(55,60,72,0.95)'; border = '2px solid #6B7280' }
          return (
            <button key={letter} onClick={() => answer(letter)} disabled={!!myAnswer || screen !== 'question'}
              style={{
                position: 'relative', width: '100%', textAlign: 'left', padding: '16px 18px',
                borderRadius: 14, background: bg, border, color: 'var(--text)', fontWeight: 700, fontSize: 16,
                cursor: myAnswer || screen !== 'question' ? 'default' : 'pointer',
              }}>
              <span style={{ display: 'inline-block', width: 22, height: 22, lineHeight: '22px', textAlign: 'center', borderRadius: 6, background: 'var(--surface-2)', marginRight: 10, fontSize: 13 }}>{letter}</span>
              {text}
              {/* cevaplayanların avatarları — büyük gelip küçülür (avatar-fly) */}
              <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}>
                {answerers.map((p, i) => (
                  <span key={p.user_id} style={{ position: 'relative', marginLeft: i === 0 ? 0 : -10 }}>
                    <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                      className="arena-fly"
                      style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', border: p.user_id === me ? '2px solid #FFD700' : '2px solid var(--bg)' }} />
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
        <div className="flex items-center justify-around px-2 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          {players.map(p => (
            <div key={p.user_id} className="flex flex-col items-center" style={{ minWidth: 0, flex: 1 }}>
              <div style={{ position: 'relative' }}>
                <img src={avatarSrc(p.avatar_url, p.username)} alt=""
                  style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', opacity: answeredBy[p.user_id] ? 1 : 0.5, border: p.user_id === me ? '2px solid #FFD700' : '2px solid transparent' }} />
                {answeredBy[p.user_id] && (
                  <span style={{ position: 'absolute', bottom: -2, right: -2, background: '#4CAF50', borderRadius: '50%', width: 14, height: 14, fontSize: 9, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</span>
                )}
              </div>
              <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.username}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
