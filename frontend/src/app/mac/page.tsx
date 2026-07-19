'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'

type GameState = 'connecting' | 'waiting' | 'countdown' | 'starting' | 'question' | 'result' | 'finished'

interface Question {
  id: string
  text: string
  difficulty: string
  category_name: string
  option_a: string
  option_b: string
  option_c: string | null
  option_d: string | null
  time_limit: number
  index: number
  total: number
}

interface MatchResult {
  player1_score: number
  player2_score: number
  winner_id: string | null
  player1_elo_change: number
  player2_elo_change: number
  xp_gained: number
  xp_breakdown: { reason: string; xp: number }[]
  title_changed: boolean
  new_title: { title: string; color: string } | null
  league_new_record: boolean
  new_badges: { code: string; name: string; icon: string; description: string }[]
}



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

export default function MacPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const wsRef = useRef<WebSocket | null>(null)

  const [gameState, setGameState] = useState<GameState>('connecting')
  const [opponent, setOpponent] = useState<{ username: string; elo: number; avatar_url?: string } | null>(null)
  const [playerNumber, setPlayerNumber] = useState<1 | 2>(1)
  const [question, setQuestion] = useState<Question | null>(null)
  const [myScore, setMyScore] = useState(0)
  const [oppScore, setOppScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(30)
  const [maxTime, setMaxTime] = useState(30)

  // Cevap durumları
  const [myAnswer, setMyAnswer] = useState<string | null>(null)
  const [opponentAnswer, setOpponentAnswer] = useState<string | null>(null)
  const [opponentWrongAnswer, setOpponentWrongAnswer] = useState<string | null>(null) // Rakibin yanlış şıkkı
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [eliminatedOptions, setEliminatedOptions] = useState<string[]>([])
  const [canAnswer, setCanAnswer] = useState(true)
  const [jokerActive, setJokerActive] = useState(false) // Joker kullanıldı, sadece joker kullanan cevap verebilir
  const [iAmJokerUser, setIAmJokerUser] = useState(false) // Ben mi joker kullandım

  const [jokers, setJokers] = useState(1)
  const [myCardColor, setMyCardColor] = useState<string | null>(null)
  const [oppCardColor, setOppCardColor] = useState<string | null>(null)
  const [oppHasExtraJoker, setOppHasExtraJoker] = useState(false)
  const [passes, setPasses] = useState(1)
  const [lastPoints, setLastPoints] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const playerNumberRef = useRef<1 | 2>(1)

  useEffect(() => {
    fetchMe().then(() => {
      const token = localStorage.getItem('access_token')
      if (!token) { router.push('/giris'); return }
      connectWS(token)
    })
    return () => {
      wsRef.current?.close()
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  useEffect(() => {
    playerNumberRef.current = playerNumber
  }, [playerNumber])

  const startTimer = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setMaxTime(seconds)
    setTimeLeft(seconds)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current!)
          return 0
          // NOT: Süre dolunca backend time_up mesajı gönderir
          // Frontend kendiliğinden soru geçişi YAPMAZ
        }
        return t - 1
      })
    }, 1000)
  }

  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current) }

  const connectWS = (token: string) => {
    const ws = new WebSocket(`wss://api.bilgimaratonu.com/ws/match?token=${token}`)
    wsRef.current = ws
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data))
    ws.onerror = () => setStatusMessage('Bağlantı hatası.')
  }

  const updateScores = (scores: { p1: number; p2: number }) => {
    if (!scores) return
    const pn = playerNumberRef.current
    setMyScore(pn === 1 ? scores.p1 : scores.p2)
    setOppScore(pn === 1 ? scores.p2 : scores.p1)
  }

  const handleMessage = (msg: any) => {
    switch (msg.type) {

      case 'connected':
        setGameState('waiting')
        break

      case 'match_start':
        setOpponent(msg.opponent)
        setPlayerNumber(msg.player_number)
        playerNumberRef.current = msg.player_number
        setGameState('starting')
        console.log('[MATCH] card_color:', msg.my_card_color, 'extra_jokers:', msg.extra_jokers)
        if (msg.my_card_color) setMyCardColor(msg.my_card_color)
        if (msg.opponent?.card_color) setOppCardColor(msg.opponent.card_color)
        if (msg.opponent?.extra_jokers > 0) setOppHasExtraJoker(true)
        setJokers(1 + Math.min(msg.extra_jokers || 0, 1))  // Max 2 joker (1 normal + 1 extra)
        // 2sn rakip kartı göster, sonra countdown gelecek
        break

      case 'countdown':
        setGameState('countdown')
        setCountdown(msg.count)
        break

      case 'match_go':
        setCountdown(null)
        break

      case 'question':
        stopTimer()
        setQuestion(msg.question)
        setMyAnswer(null)
        setOpponentAnswer(null)
        setOpponentWrongAnswer(null)
        setCorrectAnswer(null)
        setEliminatedOptions([])
        setCanAnswer(true)
        setJokerActive(false)
        setIAmJokerUser(false)
        setLastPoints(null)
        setStatusMessage('')
        updateScores(msg.scores)
        setGameState('question')
        startTimer(msg.question.time_limit)
        break

      case 'answer_result':
        updateScores(msg.scores)
        setLastPoints(msg.points)
        if (msg.is_correct) {
          stopTimer()
          setCorrectAnswer(msg.correct_answer)
          setStatusMessage('✓ Doğru cevap!')
        } else {
          // Timer devam etsin — yanlış yapan rakibin kaç saniyesi olduğunu görsün
          setCanAnswer(false)
          setJokerActive(false)
          setStatusMessage('✗ Yanlış cevap! Rakibin sırası...')
        }
        break

      case 'opponent_wrong':
        // Rakip yanlış şıkkını göster — joker durumu da biter
        setOpponentWrongAnswer(msg.wrong_answer || null)
        setMyAnswer(null)       // Oyuncu tekrar cevap verebilsin
        setJokerActive(false)
        setIAmJokerUser(false)
        updateScores(msg.scores)
        setStatusMessage('🎯 Rakip yanlış yaptı! Sıra sende')
        setCanAnswer(true)
        stopTimer()
        startTimer(msg.remaining_time || 10)
        break

      case 'opponent_correct':
        // Rakip doğru yaptı
        stopTimer()
        setOpponentAnswer(null)
        setCorrectAnswer(msg.correct_answer)
        updateScores(msg.scores)
        setStatusMessage('❌ Rakip doğru cevapladı!')
        setCanAnswer(false)
        break

      case 'both_wrong':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        updateScores(msg.scores)
        setStatusMessage('İkiniz de yanlış!')
        break

      case 'time_up':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        updateScores(msg.scores)
        setStatusMessage('⏱ Süre doldu!')
        break

      case 'joker_result':
        if (msg.eliminated?.length > 0) {
          // Orijinal harfleri sakla — getOptionStyle'da originalKey ile karşılaştırılacak
          setEliminatedOptions(msg.eliminated)
          setStatusMessage('💡 2 yanlış şık elendi — şimdi cevapla!')
          setJokerActive(true)
          setIAmJokerUser(true)
          setCanAnswer(true)
        } else {
          setStatusMessage(msg.error || 'Joker hakkın kalmadı')
        }
        break

      case 'opponent_joker':
        // Rakip joker kullandı — elenen şıkları göster, tıklamayı engelle
        if (msg.eliminated?.length > 0) {
          setEliminatedOptions(msg.eliminated)
        }
        setStatusMessage('Rakip joker kullandı, cevap bekliyor...')
        setCanAnswer(false)
        setJokerActive(true)
        setIAmJokerUser(false)
        break

      case 'pass_result':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        setStatusMessage('Pas geçtin')
        break

      case 'opponent_passed':
        setStatusMessage('Rakip pas geçti')
        break

      case 'match_end':
        stopTimer()
        setMatchResult(msg)
        setGameState('finished')
        // WS'yi kapat — otomatik yeniden maça girişi önle
        setTimeout(() => wsRef.current?.close(), 500)
        // Kullanıcı bilgilerini güncelle — 401 hatası olursa yönlendirme yapma
        setTimeout(() => {
          const token = localStorage.getItem('access_token')
          if (token) fetchMe().catch(() => {})
        }, 1000)
        break

      case 'opponent_disconnected':
        stopTimer()
        setStatusMessage('Rakip bağlantısı kesildi. 5sn sonra ana sayfaya dönülüyor...')
        let countdown = 5
        const dcInterval = setInterval(() => {
          countdown--
          if (countdown <= 0) {
            clearInterval(dcInterval)
            window.location.href = '/'
          } else {
            setStatusMessage(`Rakip bağlantısı kesildi. ${countdown}sn sonra ana sayfaya dönülüyor...`)
          }
        }, 1000)
        break
    }
  }

  const sendAnswer = (answer: string) => {
    if (!question || !wsRef.current || myAnswer || !canAnswer) return
    if (opponentWrongAnswer === answer) return
    if (jokerActive && !iAmJokerUser) return
    setMyAnswer(answer)
    wsRef.current.send(JSON.stringify({
      type: 'answer',
      question_id: question.id,
      answer,
      response_time_ms: (maxTime - timeLeft) * 1000,
    }))
  }

  const sendJoker = () => {
    // Cevap verilmişse veya rakip zaten bir şık işaretlediyse joker kullanılamaz
    if (!wsRef.current || jokers <= 0 || myAnswer || !canAnswer) return
    if (opponentWrongAnswer) return  // Rakip zaten bir şık işaretledi, 3 şık kaldı
    setJokers(j => j - 1)
    wsRef.current.send(JSON.stringify({ type: 'joker' }))
  }

  const sendPass = () => {
    if (!wsRef.current || passes <= 0 || myAnswer || !canAnswer) return
    setPasses(p => p - 1)
    wsRef.current.send(JSON.stringify({ type: 'pass' }))
  }

  // Şık rengi hesapla
  const getOptionStyle = (label: string) => {
    const isEliminated = eliminatedOptions.includes(label)
    const isMine = myAnswer === label
    const isOpponentWrong = opponentWrongAnswer === label
    const isCorrect = correctAnswer === label
    const isMyWrong = isMine && !isCorrect && !!correctAnswer  // Benim yanlış şıkkım

    let bg = 'rgba(255,255,255,0.08)'
    let border = '1px solid rgba(255,255,255,0.15)'
    let opacity = 1
    let transform = 'scale(1)'

    if (isEliminated) {
      bg = 'rgba(255,255,255,0.02)'
      opacity = 0.2
    } else if (isCorrect) {
      bg = 'rgba(76,175,80,0.45)'
      border = '2px solid #4CAF50'
      transform = 'scale(1.02)'
    } else if (isMyWrong) {
      // Benim yanlış şıkkım — kırmızı
      bg = 'rgba(244,67,54,0.35)'
      border = '2px solid #F44336'
    } else if (isOpponentWrong) {
      // Rakibin yanlış şıkkı — turuncu, tıklanamaz
      bg = 'rgba(255,152,0,0.25)'
      border = '1px solid rgba(255,152,0,0.5)'
      opacity = 0.6
    } else if (isMine && !correctAnswer) {
      bg = 'rgba(79,195,247,0.2)'
      border = '2px solid #4FC3F7'
      transform = 'scale(1.01)'
    }

    const isBlocked = isEliminated || isOpponentWrong
    const disabled = !canAnswer || !!myAnswer || isBlocked || (jokerActive && !iAmJokerUser)

    return {
      background: bg,
      border,
      opacity,
      transform,
      borderRadius: 12,
      padding: '16px 20px',
      color: 'white',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.3s ease',
      textAlign: 'left' as const,
      fontSize: 15,
      width: '100%',
    }
  }

  const options = question ? [
    { label: 'A', text: question.option_a },
    { label: 'B', text: question.option_b },
    ...(question.option_c ? [{ label: 'C', text: question.option_c }] : []),
    ...(question.option_d ? [{ label: 'D', text: question.option_d }] : []),
  ] : []

  // MAÇ BİTTİ
  if (gameState === 'finished' && matchResult) {
    const myFinal = playerNumber === 1 ? matchResult.player1_score : matchResult.player2_score
    const oppFinal = playerNumber === 1 ? matchResult.player2_score : matchResult.player1_score
    const myElo = playerNumber === 1 ? matchResult.player1_elo_change : matchResult.player2_elo_change
    const won = myFinal > oppFinal ? true : myFinal < oppFinal ? false : null
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-10 max-w-xl w-full text-center animate-fade-in">
          <div className="text-7xl mb-4">{won === true ? '🏆' : won === false ? '😔' : '🤝'}</div>
          <h2 className="text-3xl font-bold mb-6" style={{ color: won === true ? '#FFD700' : won === false ? '#F44336' : '#4FC3F7' }}>
            {won === true ? 'Kazandın!' : won === false ? 'Kaybettin' : 'Berabere!'}
          </h2>
          <div className="text-5xl font-bold mb-4">
            <span style={{ color: '#4FC3F7' }}>{myFinal > 0 ? '+' : ''}{Math.round(myFinal * 100) / 100}</span>
            <span className="mx-4" style={{ fontSize: 28 }}>⚽</span>
            <span style={{ color: '#FF7043' }}>{oppFinal > 0 ? '+' : ''}{Math.round(oppFinal * 100) / 100}</span>
          </div>
          <div className="text-lg mb-2" style={{ color: myElo >= 0 ? '#4CAF50' : '#F44336' }}>
            ELO: {myElo >= 0 ? '+' : ''}{myElo}
          </div>

          {/* XP kazanımı */}
          {matchResult.xp_gained > 0 && (
            <div className="glass p-4 mb-6 text-left">
              <div className="font-bold mb-2" style={{ color: '#FFD700' }}>
                ⭐ +{matchResult.xp_gained} XP kazandın!
              </div>
              {matchResult.xp_breakdown.map((b, i) => (
                <div key={i} className="flex justify-between text-sm" style={{ color: '#B0BEC5' }}>
                  <span>{b.reason}</span>
                  <span style={{ color: '#FFD700' }}>+{b.xp} XP</span>
                </div>
              ))}
              {matchResult.league_new_record && (
                <div className="mt-2 text-sm" style={{ color: '#4FC3F7' }}>
                  🎯 Bugünkü lig rekorunu kırdın!
                </div>
              )}
              {matchResult.new_badges?.length > 0 && (
                <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="font-bold text-sm mb-2" style={{ color: '#FFD700' }}>🏅 Yeni Rozetler!</div>
                  {matchResult.new_badges.map(b => (
                    <div key={b.code} className="flex items-center gap-2 mb-1">
                      <span className="text-xl">{b.icon}</span>
                      <div>
                        <span className="font-bold text-sm">{b.name}</span>
                        <span className="text-xs ml-2" style={{ color: '#B0BEC5' }}>{b.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {matchResult.title_changed && matchResult.new_title && (
                <div className="mt-2 text-sm font-bold" style={{ color: matchResult.new_title.color }}>
                  🎉 Yeni unvan: {matchResult.new_title.title}!
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button className="btn-gold" onClick={() => {
              wsRef.current?.close()
              window.location.href = '/mac'
            }}>🔄 Tekrar</button>
            <button className="btn-primary" onClick={() => router.push('/')}>🏠 Ana Sayfa</button>
          </div>
        </div>
      </div>
    )
  }

  // BEKLEME
  if (gameState === 'connecting' || gameState === 'waiting') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-10 max-w-xl w-full text-center animate-fade-in">
          <div className="text-5xl mb-6" style={{ animation: 'bounce 1s infinite' }}>⚡</div>
          <h2 className="text-2xl font-bold mb-6">Rakip Aranıyor...</h2>
          <div className="flex justify-center gap-2 mb-8">
            {[0,1,2].map(i => (
              <div key={i} className="w-3 h-3 rounded-full"
                style={{ background: '#4FC3F7', animation: `bounce 1s ${i*0.2}s infinite` }} />
            ))}
          </div>
          <button className="btn-primary" onClick={() => router.push('/')}>Vazgeç</button>
        </div>
      </div>
    )
  }

  // RAKİP BULUNDU / GERİ SAYIM
  if (gameState === 'starting' || gameState === 'countdown') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass p-10 max-w-lg w-full text-center animate-fade-in">
          {(gameState === 'starting' || gameState === 'countdown') && opponent && (
            <>
              <div className="text-sm font-bold mb-4 px-4 py-2 rounded-full inline-block"
                style={{ background: 'rgba(255,215,0,0.15)', color: '#FFD700' }}>
                ⚡ Rakip Bulundu!
              </div>
              <div className="flex items-center justify-center gap-6 mb-6 mt-4" style={{ width: "100%" }}>
                <div className="text-center glass p-5 rounded-2xl" style={{ flex: 1 }}>
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl font-black mx-auto mb-2"
                    style={{ background: 'linear-gradient(135deg, #4FC3F7, #1565C0)' }}>
                    {(user as any)?.avatar_url
                      ? <img src={`https://api.bilgimaratonu.com${(user as any).avatar_url}`} className="w-full h-full object-cover" />
                      : user?.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="font-bold">{user?.username}</div>
                  <div className="text-sm mt-1" style={{ color: '#4FC3F7' }}>
                    {Math.round(user?.elo_rating || 0)} ELO
                  </div>
                </div>
                <div className="text-4xl font-black" style={{ color: '#FFD700' }}>VS</div>
                <div className="text-center glass p-5 rounded-2xl" style={{ flex: 1 }}>
                  <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-2xl font-black mx-auto mb-2"
                    style={{ background: 'linear-gradient(135deg, #FF7043, #B71C1C)' }}>
                    {opponent.avatar_url
                      ? <img src={`https://api.bilgimaratonu.com${opponent.avatar_url}`} className="w-full h-full object-cover" />
                      : opponent.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="font-bold">{opponent.username}</div>
                  <div className="text-sm mt-1" style={{ color: '#FF7043' }}>
                    {Math.round(opponent.elo)} ELO
                  </div>
                </div>
              </div>
            </>
          )}
          {gameState === 'countdown' && countdown && (
            <div className="text-9xl font-black animate-fade-in" style={{ color: '#FFD700', lineHeight: 1 }}>
              {countdown}
            </div>
          )}
          {gameState === 'starting' && (
            <p className="text-sm" style={{ color: '#B0BEC5' }}>Hazır ol...</p>
          )}
        </div>
      </div>
    )
  }

  // OYUN EKRANI
  return (
    <div className="min-h-screen flex flex-col p-3" style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* Skor bar */}
      <div className="glass p-4 mb-3 flex items-center justify-between">
        <div className="text-center flex-1 rounded-xl py-2" style={{ background: myCardColor || 'rgba(79,195,247,0.08)' }}>
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
            <div className="text-xs font-bold animate-fade-in" style={{
              color: lastPoints >= 0 ? '#4CAF50' : '#F44336'
            }}>
              {lastPoints >= 0 ? '+' : ''}{lastPoints}
            </div>
          )}
        </div>
        <div className="text-center px-4">
          {/* Soru sayacı — büyük ve belirgin */}
          <div className="font-black mb-1" style={{ color: '#FFFFFF', fontSize: 22 }}>
            <span style={{ color: '#4FC3F7' }}>{(question?.index ?? 0) + 1}</span>
            <span style={{ color: '#B0BEC5', fontSize: 16 }}>/{question?.total ?? QUESTIONS_PER_MATCH}</span>
          </div>
          {/* Soru ilerleme çubuğu */}
          <div className="flex gap-1 justify-center mb-1">
            {Array.from({ length: question?.total ?? QUESTIONS_PER_MATCH }).map((_, i) => (
              <div key={i} style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: i < (question?.index ?? 0)
                  ? '#4CAF50'
                  : i === (question?.index ?? 0)
                  ? '#FFD700'
                  : 'rgba(255,255,255,0.2)',
                transition: 'all 0.3s',
              }} />
            ))}
          </div>
          {/* Süre */}
          <div className="text-3xl font-black" style={{
            color: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#FFD700'
          }}>{timeLeft}</div>
          {question && (
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-xs px-2 py-0.5 rounded-full" style={{
                background: DIFFICULTY_COLORS[question.difficulty] + '33',
                color: DIFFICULTY_COLORS[question.difficulty],
              }}>
                {DIFFICULTY_LABELS[question.difficulty]}
                {' '}(+{(question as any).points_correct ?? DIFFICULTY_POINTS[question.difficulty]?.correct}/{(question as any).points_wrong ?? DIFFICULTY_POINTS[question.difficulty]?.wrong})
              </span>
              <span className="text-xs" style={{ color: '#B0BEC5' }}>
                {question.category_name}
              </span>
            </div>
          )}
        </div>
        <div className="text-center flex-1 rounded-xl py-2" style={{ background: oppCardColor || 'rgba(255,112,67,0.08)' }}>
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

      {/* Rakip joker uyarısı */}
      {jokers > 1 && (
        <div className="text-center text-xs mb-2 font-bold" style={{ color: '#FFD700' }}>
          💡 Çift joker hakkınız var
        </div>
      )}

      {/* Durum mesajı */}
      <div className="glass px-4 py-3 mb-3 text-center font-bold animate-fade-in" style={{
        fontSize: 15,
        color: statusMessage.includes('✓') || statusMessage.includes('Rakip yanlış') ? '#4CAF50' :
               statusMessage.includes('✗') || statusMessage.includes('Yanlış') || statusMessage.includes('Süre') ? '#F44336' :
               statusMessage.includes('❌') ? '#F44336' :
               statusMessage.includes('🎯') ? '#FFD700' :
               statusMessage ? '#4FC3F7' : '#555',
      }}>
        {statusMessage || 'Cevap bekleniyor...'}
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

      {/* Şıklar — 2x2 grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {options.map(({ label, text }) => (
          <button
            key={label}
            onClick={() => sendAnswer(label)}
            disabled={!canAnswer || !!myAnswer || eliminatedOptions.includes(label)}
            style={getOptionStyle(label)}
          >
            <span className="font-bold mr-2" style={{ color: '#4FC3F7' }}>{label})</span>
            {text}
            {myAnswer === label && !correctAnswer && (
              <span className="ml-2 text-xs" style={{ color: '#4FC3F7' }}>◀ Sen</span>
            )}
            {opponentAnswer === label && (
              <span className="ml-2 text-xs" style={{ color: '#FF7043' }}>◀ Rakip ✓</span>
            )}
            {opponentWrongAnswer === label && (
              <span className="ml-2 text-xs" style={{ color: '#FF9800' }}>◀ Rakip ✗</span>
            )}
          </button>
        ))}
      </div>

      {/* Joker / Pas */}
      <div className="flex gap-3 justify-center">
        <button onClick={sendJoker}
          disabled={jokers <= 0 || !!myAnswer || !canAnswer || !!opponentWrongAnswer}
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,215,0,0.3)',
            borderRadius: 12,
            padding: '10px 20px',
            color: '#FFD700',
            fontWeight: 700,
            fontSize: 14,
            cursor: jokers <= 0 || myAnswer || !canAnswer || opponentWrongAnswer ? 'not-allowed' : 'pointer',
            opacity: jokers <= 0 || myAnswer || !canAnswer || opponentWrongAnswer ? 0.35 : 1,
            transition: 'all 0.2s',
          }}>
          💡 Joker ({jokers})
        </button>
        <button onClick={sendPass}
          disabled={passes <= 0 || !!myAnswer || !canAnswer || !opponentWrongAnswer}
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: 12,
            padding: '10px 20px',
            color: '#B0BEC5',
            fontWeight: 700,
            fontSize: 14,
            cursor: passes <= 0 || myAnswer || !canAnswer || !opponentWrongAnswer ? 'not-allowed' : 'pointer',
            opacity: passes <= 0 || myAnswer || !canAnswer || !opponentWrongAnswer ? 0.35 : 1,
            transition: 'all 0.2s',
          }}>
          ⏭ Pas ({passes})
        </button>
      </div>

      {/* Joker bilgileri */}
      <div className="flex justify-center gap-6 mt-2 text-xs">
        {jokers > 1 && (
          <span style={{ color: '#FFD700' }}>💡 Çift joker hakkınız var</span>
        )}
        {oppHasExtraJoker && (
          <span style={{ color: '#FF9800' }}>⚠️ Rakibinizin çift joker hakkı var</span>
        )}
      </div>

    </div>
  )
}

const QUESTIONS_PER_MATCH = 15
