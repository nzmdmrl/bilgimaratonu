'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'

type GameState = 'connecting' | 'waiting' | 'starting' | 'question' | 'finished'

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#4CAF50', medium: '#FFC107', hard: '#FF7043', very_hard: '#E91E63',
}
const DIFFICULTY_LABELS: Record<string, string> = {
  easy: 'Kolay', medium: 'Orta', hard: 'Zor', very_hard: 'Çok Zor',
}
const DIFFICULTY_POINTS: Record<string, { correct: number; wrong: number }> = {
  easy: { correct: 10, wrong: -3 },
  medium: { correct: 20, wrong: -5 },
  hard: { correct: 30, wrong: -8 },
  very_hard: { correct: 50, wrong: -10 },
}

export default function CategoryMatchPage() {
  const { slug } = useParams<{ slug: string }>()
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()

  const [gameState, setGameState] = useState<GameState>('connecting')
  const [category, setCategory] = useState<any>(null)
  const [opponent, setOpponent] = useState<any>(null)
  const [vsCountdown, setVsCountdown] = useState<number | null>(null)
  const [playerNumber, setPlayerNumber] = useState(1)
  const [matchId, setMatchId] = useState('')
  const [question, setQuestion] = useState<any>(null)
  const [myAnswer, setMyAnswer] = useState<string | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [opponentWrongAnswer, setOpponentWrongAnswer] = useState<string | null>(null)
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([])
  const [myScore, setMyScore] = useState(0)
  const [oppScore, setOppScore] = useState(0)
  const [lastPoints, setLastPoints] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(0)
  const [maxTime, setMaxTime] = useState(30)
  const [statusMessage, setStatusMessage] = useState('Rakip aranıyor...')
  const [matchResult, setMatchResult] = useState<any>(null)
  const [canAnswer, setCanAnswer] = useState(true)
  const [jokers, setJokers] = useState(1)
  const [jokerActive, setJokerActive] = useState(false)
  const [iAmJokerUser, setIAmJokerUser] = useState(false)
  const [passes, setPasses] = useState(1)

  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const lastPointsTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchMe()
    api.get('/api/categories').then(r => {
      const cat = r.data.find((c: any) => c.slug === slug)
      setCategory(cat)
    })
    connect()
    return () => {
      wsRef.current?.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const connect = () => {
    const token = localStorage.getItem('access_token')
    if (!token) { router.push('/giris'); return }
    const ws = new WebSocket(`wss://api.bilgimaratonu.com/api/category-match/${slug}/ws?token=${token}`)
    wsRef.current = ws
    ws.onmessage = e => { try { handleMsg(JSON.parse(e.data)) } catch {} }
    ws.onclose = () => setStatusMessage('Bağlantı kesildi')
  }

  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current) }

  const startTimer = (secs: number) => {
    stopTimer()
    setTimeLeft(secs)
    setMaxTime(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => { if (prev <= 1) { stopTimer(); return 0 } return prev - 1 })
    }, 1000)
  }

  const showPoints = (pts: number) => {
    setLastPoints(pts)
    if (lastPointsTimer.current) clearTimeout(lastPointsTimer.current)
    lastPointsTimer.current = setTimeout(() => setLastPoints(null), 2000)
  }

  const handleMsg = (msg: any) => {
    console.log('[CAT MSG]', msg.type, msg)
    switch (msg.type) {
      case 'connected':
        setGameState('waiting')
        setStatusMessage('Rakip aranıyor...')
        break
      case 'bot_match':
        break
      case 'match_start':
        setMatchId(msg.match_id)
        setPlayerNumber(msg.player_number)
        setOpponent(msg.opponent)
        setMyScore(0); setOppScore(0)
        setGameState('starting')
        setJokers(1 + Math.min(msg.extra_jokers || 0, 1))
        break
      case 'question':
        setGameState('question')
        setVsCountdown(null)
        setQuestion(msg.question)
        setMyAnswer(null); setCorrectAnswer(null)
        setOpponentWrongAnswer(null); setEliminatedOptions([])
        setCanAnswer(true); setJokerActive(false); setIAmJokerUser(false)
        setStatusMessage('')
        if (msg.scores) {
          if (playerNumber === 1) { setMyScore(msg.scores.p1 || 0); setOppScore(msg.scores.p2 || 0) }
          else { setMyScore(msg.scores.p2 || 0); setOppScore(msg.scores.p1 || 0) }
        }
        startTimer(msg.question.time_limit || 30)
        break
      case 'answer_result':
        stopTimer()
        setCorrectAnswer(msg.correct_answer || null)
        setCanAnswer(false)
        const myS = msg.player_number === playerNumber ? msg.scores?.p1 : msg.scores?.p2
        const oppS = msg.player_number === playerNumber ? msg.scores?.p2 : msg.scores?.p1
        if (playerNumber === 1) { setMyScore(msg.scores?.p1 || 0); setOppScore(msg.scores?.p2 || 0) }
        else { setMyScore(msg.scores?.p2 || 0); setOppScore(msg.scores?.p1 || 0) }
        if (msg.points !== undefined) showPoints(msg.points)
        setStatusMessage(msg.is_correct ? '✓ Doğru!' : '✗ Yanlış')
        break
      case 'countdown':
        setVsCountdown(msg.count)
        break
      case 'match_go':
        setStatusMessage('')
        break
      case 'opponent_correct':
        setCorrectAnswer(msg.correct_answer)
        setCanAnswer(false)
        stopTimer()
        setStatusMessage('Rakip doğru yaptı!')
        if (playerNumber === 1) { setMyScore(msg.scores?.p1 || 0); setOppScore(msg.scores?.p2 || 0) }
        else { setMyScore(msg.scores?.p2 || 0); setOppScore(msg.scores?.p1 || 0) }
        break
      case 'opponent_wrong':
        setOpponentWrongAnswer(msg.wrong_answer)
        setCanAnswer(true)
        setMyAnswer(null)
        setStatusMessage('🎯 Rakip yanlış yaptı! Sıra sende')
        if (msg.remaining_time) startTimer(msg.remaining_time)
        break
      case 'both_wrong':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        setCanAnswer(false)
        if (msg.opp_answer) setOpponentWrongAnswer(msg.opp_answer)
        if (playerNumber === 1) { setMyScore(msg.scores?.p1 || 0); setOppScore(msg.scores?.p2 || 0) }
        else { setMyScore(msg.scores?.p2 || 0); setOppScore(msg.scores?.p1 || 0) }
        setStatusMessage('İkisi de yanlış!')
        break
      case 'time_up':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        setCanAnswer(false)
        setStatusMessage('⏰ Süre doldu!')
        break
      case 'joker_result':
        setEliminatedOptions(msg.eliminated || [])
        setJokerActive(false)
        break
      case 'opponent_joker':
        setJokerActive(true); setIAmJokerUser(false)
        setStatusMessage('Rakip joker kullandı, cevap bekliyor...')
        break
      case 'match_end':
        stopTimer()
        setGameState('finished')
        setMatchResult(msg)
        break
    }
  }

  const sendAnswer = (answer: string) => {
    console.log('[SEND] answer:', answer, 'question_id:', question?.id, 'canAnswer:', canAnswer, 'myAnswer:', myAnswer)
    if (!wsRef.current || myAnswer || !canAnswer) return
    if (opponentWrongAnswer === answer) return
    if (eliminatedOptions.includes(answer)) return
    if (jokerActive && !iAmJokerUser) return
    setMyAnswer(answer)
    stopTimer()
    wsRef.current.send(JSON.stringify({
      type: 'answer', question_id: question?.id, answer,
      response_time_ms: (maxTime - timeLeft) * 1000,
    }))
  }

  const sendJoker = () => {
    if (!wsRef.current || jokers <= 0 || myAnswer || !canAnswer || opponentWrongAnswer) return
    setJokers(j => j - 1); setJokerActive(true); setIAmJokerUser(true)
    wsRef.current.send(JSON.stringify({ type: 'joker' }))
  }

  const sendPass = () => {
    if (!wsRef.current || passes <= 0 || myAnswer || !canAnswer || !opponentWrongAnswer) return
    setPasses(p => p - 1)
    wsRef.current.send(JSON.stringify({ type: 'pass' }))
  }

  const myFinalScore = playerNumber === 1 ? matchResult?.player1_score : matchResult?.player2_score
  const oppFinalScore = playerNumber === 1 ? matchResult?.player2_score : matchResult?.player1_score

  const options = question ? [
    { label: 'A', text: question.option_a },
    { label: 'B', text: question.option_b },
    ...(question.option_c ? [{ label: 'C', text: question.option_c }] : []),
    ...(question.option_d ? [{ label: 'D', text: question.option_d }] : []),
  ] : []

  const getOptionStyle = (label: string) => {
    const isEliminated = eliminatedOptions.includes(label)
    const isMine = myAnswer === label
    const isCorrect = correctAnswer === label
    const isOpponentWrong = opponentWrongAnswer === label
    const isBlocked = jokerActive && !iAmJokerUser && !eliminatedOptions.includes(label) && label !== myAnswer

    let bg = 'rgba(255,255,255,0.08)'
    let border = 'rgba(255,255,255,0.12)'
    let color = '#FFFFFF'
    let opacity = 1

    if (isEliminated) { bg = 'rgba(0,0,0,0.2)'; color = '#333'; opacity = 0.3 }
    else if (correctAnswer) {
      if (isCorrect) { bg = 'rgba(76,175,80,0.25)'; border = '#4CAF50' }
      else if (isMine) { bg = 'rgba(244,67,54,0.25)'; border = '#F44336' }
      else if (isOpponentWrong) { bg = 'rgba(255,152,0,0.15)'; border = '#FF9800' }
      else { opacity = 0.4 }
    } else if (isMine) { bg = 'rgba(79,195,247,0.25)'; border = '#4FC3F7' }
    else if (isOpponentWrong) { bg = 'rgba(255,152,0,0.15)'; border = '#FF9800' }
    else if (isBlocked) { opacity = 0.4 }

    return {
      background: bg, border: `2px solid ${border}`, borderRadius: 14,
      padding: '14px 12px', color, fontWeight: 600, textAlign: 'left' as const,
      cursor: (!canAnswer || myAnswer || isEliminated || isBlocked) ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s', fontSize: 15, opacity,
      display: 'flex', alignItems: 'center', gap: 8,
    }
  }

  // Maç bitti
  if (gameState === 'finished' && matchResult) {
    const won = myFinalScore > oppFinalScore ? true : myFinalScore < oppFinalScore ? false : null
    const eloChange = playerNumber === 1 ? matchResult.player1_elo_change : matchResult.player2_elo_change
    const xpGained = matchResult.xp_gained || 0
    const newBadges = matchResult.new_badges || []
    const xpBreakdown = matchResult.xp_breakdown || []

    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-10 max-w-xl w-full text-center animate-fade-in">
          <div className="text-7xl mb-4">{won === true ? '🏆' : won === false ? '😔' : '🤝'}</div>
          <h2 className="text-3xl font-black mb-2">{won === true ? 'Kazandın!' : won === false ? 'Kaybettin' : 'Berabere'}</h2>
          <div className="flex justify-center gap-8 mb-4">
            <div><div className="text-3xl font-black" style={{ color: '#4FC3F7' }}>{Math.round((myFinalScore || 0) * 100) / 100}</div><div className="text-sm" style={{ color: '#B0BEC5' }}>Sen</div></div>
            <div><div className="text-3xl font-black" style={{ color: '#FF7043' }}>{Math.round((oppFinalScore || 0) * 100) / 100}</div><div className="text-sm" style={{ color: '#B0BEC5' }}>{opponent?.username}</div></div>
          </div>

          {/* ELO */}
          {eloChange !== undefined && (
            <div className="mb-3 text-sm font-bold" style={{ color: eloChange >= 0 ? '#4CAF50' : '#F44336' }}>
              ELO: {eloChange >= 0 ? '+' : ''}{eloChange}
            </div>
          )}

          {/* XP */}
          {xpGained > 0 && (
            <div className="glass p-4 mb-3 rounded-xl">
              <div className="font-bold mb-2" style={{ color: '#FFD700' }}>⭐ +{xpGained} XP kazandın!</div>
              {xpBreakdown.map((b: any, i: number) => (
                <div key={i} className="text-xs flex justify-between" style={{ color: '#B0BEC5' }}>
                  <span>{b.reason}</span><span>+{b.xp} XP</span>
                </div>
              ))}
            </div>
          )}

          {/* Yeni Rozetler */}
          {newBadges.length > 0 && (
            <div className="glass p-4 mb-3 rounded-xl">
              <div className="font-bold mb-2" style={{ color: '#FFD700' }}>🏅 Yeni Rozetler!</div>
              {newBadges.map((b: any) => (
                <div key={b.code} className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{b.icon}</span>
                  <div><span className="font-bold text-sm">{b.name}</span>
                  <span className="text-xs ml-2" style={{ color: '#B0BEC5' }}>{b.description}</span></div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button className="btn-gold" onClick={() => { wsRef.current?.close(); window.location.reload() }}>🔄 Tekrar</button>
            <button className="btn-primary" onClick={() => router.push('/')}>🏠 Ana Sayfa</button>
          </div>
        </div>
      </div>
    )
  }

  // Bekleme
  if (gameState === 'starting' && opponent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="glass rounded-3xl p-8 flex flex-col items-center" style={{ width: '100%', maxWidth: 640 }}>
        <div className="text-sm font-bold mb-4 px-4 py-2 rounded-full inline-block"
          style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
          ⚡ Rakip Bulundu!
        </div>
        <div className="flex items-center justify-center gap-6 mb-6 mt-4" style={{ width: '100%', maxWidth: 520 }}>
          <div className="text-center glass p-5 rounded-2xl" style={{ flex: 1 }}>
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl font-black mx-auto mb-2"
              style={{ background: 'linear-gradient(135deg, #4FC3F7, #1565C0)' }}>
              {(user as any)?.avatar_url
                ? <img src={`https://api.bilgimaratonu.com${(user as any).avatar_url}`} className="w-full h-full object-cover" alt="" />
                : user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="font-bold">{user?.username}</div>
            <div className="text-sm mt-1" style={{ color: '#4FC3F7' }}>
              {Math.round((user as any)?.elo_rating || 0)} ELO
            </div>
          </div>
          <div className="text-4xl font-black" style={{ color: '#FFD700' }}>VS</div>
          <div className="text-center glass p-5 rounded-2xl" style={{ flex: 1 }}>
            <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl font-black mx-auto mb-2"
              style={{ background: 'linear-gradient(135deg, #FF7043, #B71C1C)' }}>
              {opponent.avatar_url
                ? <img src={`https://api.bilgimaratonu.com${opponent.avatar_url}`} className="w-full h-full object-cover" alt="" />
                : opponent.username?.[0]?.toUpperCase()}
            </div>
            <div className="font-bold">{opponent.username}</div>
            <div className="text-sm mt-1" style={{ color: '#FF7043' }}>
              {Math.round(opponent.elo || 0)} ELO
            </div>
          </div>
        </div>
        {vsCountdown !== null ? (
          <div className="text-9xl font-black" style={{ color: '#FFD700', lineHeight: 1 }}>{vsCountdown}</div>
        ) : (
          <p className="text-sm" style={{ color: '#B0BEC5' }}>Hazır ol...</p>
        )}
        </div>
      </div>
    )
  }

  if (gameState === 'connecting' || gameState === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-10 max-w-md w-full text-center animate-fade-in">
          <div className="text-5xl mb-4">{category?.icon || '🎯'}</div>
          <h2 className="text-2xl font-bold mb-2">{category?.name || slug} Maçı</h2>
          <p className="mb-6" style={{ color: '#B0BEC5' }}>{statusMessage}</p>
          <div className="flex justify-center gap-2 mb-6">
            {[0,1,2].map(i => (
              <div key={i} className="w-3 h-3 rounded-full animate-bounce"
                style={{ background: '#4FC3F7', animationDelay: `${i * 0.2}s` }} />
            ))}
          </div>
          <button onClick={() => router.back()} style={{ color: '#B0BEC5', fontSize: 14 }}>← Geri</button>
        </div>
      </div>
    )
  }

  // Oyun ekranı
  return (
    <div className="min-h-screen flex flex-col p-3" style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Skor bar */}
      <div className="glass p-4 mb-3 flex items-center justify-between">
        <div className="text-center flex-1 rounded-xl py-2" style={{ background: 'rgba(79,195,247,0.08)' }}>
          <div className="flex justify-center mb-1">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm font-black"
              style={{ background: 'linear-gradient(135deg, #4FC3F7, #1565C0)' }}>
              {(user as any)?.avatar_url
                ? <img src={`https://api.bilgimaratonu.com${(user as any).avatar_url}`} className="w-full h-full object-cover" />
                : user?.username?.[0]?.toUpperCase()}
            </div>
          </div>
          <div className="text-sm font-bold" style={{ color: '#4FC3F7' }}>{user?.username}</div>
          <div className="text-3xl font-black">{Math.round(myScore * 100) / 100}</div>
          {lastPoints !== null && (
            <div className="text-xs font-bold" style={{ color: lastPoints >= 0 ? '#4CAF50' : '#F44336' }}>
              {lastPoints >= 0 ? '+' : ''}{lastPoints}
            </div>
          )}
        </div>

        <div className="text-center px-4">
          <div className="font-black mb-1" style={{ color: '#FFFFFF', fontSize: 22 }}>
            <span style={{ color: '#4FC3F7' }}>{question?.index !== undefined ? question.index + 1 : '-'}</span>
            <span style={{ color: '#B0BEC5', fontSize: 16 }}>/{question?.total || '-'}</span>
          </div>
          <div className="text-3xl font-black" style={{
            color: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#FFD700'
          }}>{timeLeft}</div>
          {question?.difficulty && (
            <div className="flex flex-col items-center gap-0.5 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{
                background: DIFFICULTY_COLORS[question.difficulty] + '33',
                color: DIFFICULTY_COLORS[question.difficulty],
              }}>
                {DIFFICULTY_LABELS[question.difficulty]} (+{(question as any).points_correct ?? DIFFICULTY_POINTS[question.difficulty]?.correct}/{(question as any).points_wrong ?? DIFFICULTY_POINTS[question.difficulty]?.wrong})
              </span>
              {question.category_name && <span className="text-xs" style={{ color: '#B0BEC5' }}>{question.category_name}</span>}
            </div>
          )}
        </div>

        <div className="text-center flex-1 rounded-xl py-2" style={{ background: 'rgba(255,112,67,0.08)' }}>
          <div className="flex justify-center mb-1">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm font-black"
              style={{ background: 'linear-gradient(135deg, #FF7043, #B71C1C)' }}>
              {opponent?.avatar_url
                ? <img src={`https://api.bilgimaratonu.com${opponent.avatar_url}`} className="w-full h-full object-cover" />
                : opponent?.username?.[0]?.toUpperCase()}
            </div>
          </div>
          <div className="text-sm font-bold" style={{ color: '#FF7043' }}>{opponent?.username}</div>
          <div className="text-3xl font-black">{Math.round(oppScore * 100) / 100}</div>
        </div>
      </div>

      {/* Süre çubuğu */}
      <div className="h-2 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all duration-1000" style={{
          width: `${maxTime > 0 ? (timeLeft / maxTime) * 100 : 0}%`,
          background: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#4FC3F7',
        }} />
      </div>

      {/* Durum mesajı */}
      <div className="glass px-4 py-3 mb-3 text-center font-bold" style={{
        fontSize: 15,
        color: statusMessage.includes('✓') || statusMessage.includes('Rakip yanlış') ? '#4CAF50' :
               statusMessage.includes('✗') || statusMessage.includes('Yanlış') ? '#F44336' :
               statusMessage.includes('🎯') ? '#FFD700' : '#4FC3F7',
        minHeight: 48,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {statusMessage || <span style={{ color: '#555' }}>Cevap bekleniyor...</span>}
      </div>

      {/* Soru */}
      <div className="glass p-6 mb-3 flex flex-col items-center justify-center text-center" style={{ minHeight: 120 }}>
        {(question as any)?.question_image && (
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 20 }}>
            <img src={`https://api.bilgimaratonu.com${(question as any).question_image}`} alt=""
              style={{ maxHeight: 180, maxWidth: '100%', width: 'auto', objectFit: 'contain', borderRadius: 12 }} />
          </div>
        )}
        <p className="text-xl font-semibold leading-relaxed" style={{ textAlign: 'center', width: '100%' }}>{question?.text || '...'}</p>
      </div>

      {/* Şıklar 2x2 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {options.map(({ label, text }) => (
          <button key={label} onClick={() => sendAnswer(label)} style={getOptionStyle(label)}
            disabled={!canAnswer || !!myAnswer || eliminatedOptions.includes(label) || (jokerActive && !iAmJokerUser)}>
            <span style={{ color: '#4FC3F7', fontWeight: 700 }}>{label})</span>
            {text}
            {opponentWrongAnswer === label && !correctAnswer && <span style={{ color: '#FF9800', fontSize: 12 }}>◀ Rakip ✗</span>}
            {myAnswer === label && !correctAnswer && <span style={{ color: '#4FC3F7', fontSize: 12 }}>◀ Sen</span>}
          </button>
        ))}
      </div>

      {/* Joker / Pas */}
      <div className="flex gap-3 justify-center">
        <button onClick={sendJoker}
          disabled={jokers <= 0 || !!myAnswer || !canAnswer || !!opponentWrongAnswer}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,215,0,0.3)',
            borderRadius: 12, padding: '10px 20px', color: '#FFD700', fontWeight: 700, fontSize: 14,
            cursor: jokers <= 0 || myAnswer || !canAnswer || opponentWrongAnswer ? 'not-allowed' : 'pointer',
            opacity: jokers <= 0 || myAnswer || !canAnswer || opponentWrongAnswer ? 0.35 : 1,
          }}>
          💡 Joker ({jokers})
        </button>
        <button onClick={sendPass}
          disabled={passes <= 0 || !!myAnswer || !canAnswer || !opponentWrongAnswer}
          style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12, padding: '10px 20px', color: '#B0BEC5', fontWeight: 700, fontSize: 14,
            cursor: passes <= 0 || myAnswer || !canAnswer || !opponentWrongAnswer ? 'not-allowed' : 'pointer',
            opacity: passes <= 0 || myAnswer || !canAnswer || !opponentWrongAnswer ? 0.35 : 1,
          }}>
          ⏭ Pas ({passes})
        </button>
      </div>
    </div>
  )
}
