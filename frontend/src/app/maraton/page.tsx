'use client'
import { useEffect, useState, useRef } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/lib/store'
import Link from 'next/link'

interface Marathon {
  id: string
  status: string
  max_participants: number
  current_participants: number
  current_round: number
}

interface Participant {
  username: string
  status: string
  is_bot: boolean
  current_round: number
  total_score: number
}

interface Question {
  id: string
  text: string
  options: string[]
}

export default function MaratonPage() {
  const { user, fetchMe } = useAuthStore()
  const [marathon, setMarathon] = useState<Marathon | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [joined, setJoined] = useState(false)
  const [nextTime, setNextTime] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [statusMsg, setStatusMsg] = useState('')
  const [showMatch, setShowMatch] = useState(false)
  const [matchId, setMatchId] = useState('')
  const [opponent, setOpponent] = useState('')
  const [roundLabel, setRoundLabel] = useState('')
  const [myElo, setMyElo] = useState<number | null>(null)
  const [myAvatar, setMyAvatar] = useState('')
  const [oppAvatar, setOppAvatar] = useState('')
  const [oppElo, setOppElo] = useState<number | null>(null)
  const [question, setQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [myScore, setMyScore] = useState(0)
  const [oppScore, setOppScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)
  const [eliminated, setEliminated] = useState(false)
  const [champion, setChampion] = useState('')
  const [lobbyCountdown, setLobbyCountdown] = useState(0)
  const [isP1, setIsP1] = useState(true)
  const [opponentWrongAnswer, setOpponentWrongAnswer] = useState<string | null>(null)
  const [opponentCorrectAnswer, setOpponentCorrectAnswer] = useState<string | null>(null)
  const [matchStatus, setMatchStatus] = useState('')
  const [matchPopup, setMatchPopup] = useState<any>(null)
  const [champions, setChampions] = useState<any[]>([])
  const [marathonStats, setMarathonStats] = useState<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const matchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchMe()
    init()
    getChampions()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
      if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const getChampions = async () => {
    try {
      const r = await api.get('/api/marathon/champions')
      setChampions(r.data.champions || [])
      setMarathonStats(r.data.stats || null)
    } catch {}
  }

  const init = async () => {
    // Önceki zamanlayıcıları temizle (polling çığını önle)
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    try {
      const pubSettings = await api.get('/api/admin/settings/public')
      if (!pubSettings.data.modules?.marathon) {
        setStatusMsg('⛔ Maraton şu an kapalı.')
        return
      }
      const r = await api.get('/api/marathon/active')
      if (r.data.marathon) {
        const m = r.data.marathon
        setMarathon(m)
        const pRes = await api.get(`/api/marathon/${m.id}/participants`)
        setParticipants(pRes.data.participants)
        const me = pRes.data.participants.find(
          (p: Participant) => p.username === useAuthStore.getState().user?.username
        )
        if (me) {
          setJoined(true)
          if (m.status === 'in_progress') {
            connectWS(m.id)
            setStatusMsg('🏃 Maraton devam ediyor...')
          } else {
            connectWS(m.id)
          }
          startPolling(m.id)
        } else {
          // Katılımcı değilsem — in_progress ise katılamaz
          if (m.status === 'in_progress') {
            setStatusMsg('Maraton devam ediyor — sonraki maratona katılabilirsiniz.')
            setJoined(false)
            // Sonraki maratonu göster
            const nr = await api.get('/api/marathon/next')
            const target = new Date(nr.data.next_marathon_at + 'Z')
            setNextTime(target.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))
            startCountdown(target)
          } else {
            startPolling(m.id)
          }
        }
      } else {
        const nr = await api.get('/api/marathon/next')
        const target = new Date(nr.data.next_marathon_at + 'Z')
        setNextTime(target.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }))
        startCountdown(target)
        pollRef.current = setTimeout(init, 30000) as any
      }
    } catch (e) {
      console.error('Init hatası:', e)
    }
  }

  const startPolling = (marathonId: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    const fetch = async () => {
      try {
        const r = await api.get(`/api/marathon/${marathonId}/participants`)
        setParticipants(r.data.participants)
        setMarathon(prev => prev ? { ...prev, current_participants: r.data.participants.length } : prev)
      } catch {}
    }
    fetch()
    pollRef.current = setInterval(fetch, 15000)
  }

  const startCountdown = (target: Date) => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    let fired = false
    const tick = () => {
      const diff = Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000))
      setCountdown(diff)
      if (diff <= 0 && !fired) {
        fired = true
        if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
        setTimeout(init, 3000)
      }
    }
    tick()
    countdownRef.current = setInterval(tick, 1000)
  }

  const connectWS = (marathonId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return
    if (wsRef.current) wsRef.current.close()
    const token = localStorage.getItem('access_token')
    if (!token) { setStatusMsg('Token bulunamadı'); return }
    const ws = new WebSocket(`wss://api.bilgimaratonu.com/api/marathon/${marathonId}/ws?token=${token}`)
    wsRef.current = ws
    ws.onopen = () => setStatusMsg('✓ Bağlandı')
    ws.onmessage = e => { try { handleMsg(JSON.parse(e.data)) } catch {} }
    ws.onclose = (e) => {
      if (e.code !== 4001) {
        setStatusMsg('Bağlantı kesildi')
        // Polling ile durumu takip et
        if (marathon) startPolling(marathon.id)
      }
    }
    ws.onerror = () => setStatusMsg('Bağlantı hatası')
  }

  const handleMsg = (msg: any) => {
    console.log('[WS MSG]', msg.type, msg)
    switch (msg.type) {
      case 'connected':
        setStatusMsg('✓ Bağlandı')
        break
      case 'countdown':
        setLobbyCountdown(msg.seconds)
        setStatusMsg(`🏁 Maraton ${msg.seconds} saniye içinde başlıyor!`)
        break
      case 'round_start':
        setMatchStatus('Sorular hazırlanıyor, bekleyiniz...')
        setCorrectAnswer(null)
        setSelectedAnswer(null)
        setOpponentWrongAnswer(null)
        setOpponentCorrectAnswer(null)
        setRoundLabel(msg.round_label)
        setStatusMsg(`🏆 ${msg.round_label} — ${msg.active_count} kişi yarışıyor`)
        setShowMatch(false)
        setQuestion(null)
        setSelectedAnswer(null)
        setCorrectAnswer(null)
        break
      case 'match_start':
        setMatchStatus('Sorular hazırlanıyor, bekleyiniz...')
        setRoundLabel(msg.round_label || '')
        setMyElo(msg.my_elo ?? null)
        setMyAvatar(msg.my_avatar || '')
        setOppAvatar(msg.opponent_avatar || '')
        setOppElo(msg.opponent_elo ?? null)
        setMatchId(msg.match_id)
        setOpponent(msg.opponent)
        setRoundLabel(msg.round_label)
        setMyScore(0)
        setOppScore(0)
        setSelectedAnswer(null)
        setCorrectAnswer(null)
        setQuestion(null)
        setEliminated(false)
        setIsP1(msg.is_p1 !== false)
        if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current)
        matchTimeoutRef.current = setTimeout(() => setShowMatch(true), 2000)
        setStatusMsg(`🎯 Rakip: ${msg.opponent}`)
        if (pollRef.current) clearInterval(pollRef.current)
        break
      case 'bye':
        setStatusMsg(`✅ ${msg.message}`)
        break
      case 'question':
        const opts = msg.question.options || [
          msg.question.option_a,
          msg.question.option_b,
          msg.question.option_c,
          msg.question.option_d,
        ].filter(Boolean)
        setQuestion({
          id: msg.question.id,
          text: msg.question.text,
          question_image: msg.question.question_image || '',
          options: opts,
          question_index: msg.question_index,
          total_questions: msg.total_questions,
          difficulty: msg.question.difficulty,
          category_name: msg.question.category_name,
        } as any)
        setOpponentWrongAnswer(null)
        setOpponentCorrectAnswer(null)
        setSelectedAnswer(null)
        setCorrectAnswer(null)
        setMatchStatus('')
        setTimeLeft(msg.time_limit)
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = setInterval(() => {
          setTimeLeft(prev => {
            if (prev <= 1) { if (timerRef.current) clearInterval(timerRef.current); return 0 }
            return prev - 1
          })
        }, 1000)
        break
      case 'opponent_correct':
        setCorrectAnswer(msg.correct_answer)
        setMyScore(msg.my_score ?? myScore)
        setOppScore(msg.opp_score ?? oppScore)
        if (timerRef.current) clearInterval(timerRef.current)
        break
      case 'both_wrong':
        setCorrectAnswer(msg.correct_answer)
        if (timerRef.current) clearInterval(timerRef.current)
        break
      case 'opponent_wrong':
        setOpponentWrongAnswer(msg.wrong_answer)
        setMatchStatus('🎯 Rakip yanlış yaptı! Sıra sende')
        break
      case 'question_result':
        setCorrectAnswer(msg.correct_answer)
        setMyScore(msg.my_score ?? (isP1 ? msg.p1_score : msg.p2_score))
        setOppScore(msg.opp_score ?? (isP1 ? msg.p2_score : msg.p1_score))
        if (msg.opp_answer) {
          if (msg.opp_answer === msg.correct_answer) {
            setOpponentCorrectAnswer(msg.opp_answer)
            setOpponentWrongAnswer(null)
          } else {
            setOpponentWrongAnswer(msg.opp_answer)
          }
        }
        if (msg.opponent_correct) {
          setOpponentCorrectAnswer(msg.correct_answer)
        }
        // Bildirim metni
        if (msg.won_q && msg.correct) setMatchStatus('✓ Doğru cevap!')
        else if (msg.opponent_correct) setMatchStatus('Rakip doğru cevap verdi')
        else if (msg.both_wrong) setMatchStatus('İkiniz de yanlış yaptınız')
        else if (msg.my_answer && msg.my_answer !== msg.correct_answer) setMatchStatus('✗ Yanlış cevap, sıra rakipte')
        if (timerRef.current) clearInterval(timerRef.current)
        break
      case 'match_end': {
        const wasFinal = roundLabel === 'Final'
        if (msg.won) {
          setMatchPopup({
            icon: wasFinal ? '🏆' : '🎉',
            title: wasFinal ? 'Maraton Şampiyonu!' : 'Kazandınız!',
            text: wasFinal ? 'Maraton Kupası profilinize eklendi.' : 'Sonraki tura geçtiniz.',
            color: '#FFD700',
          })
        } else {
          setMatchPopup({
            icon: wasFinal ? '🥈' : '❌',
            title: wasFinal ? 'İkinci Oldunuz!' : 'Elendiniz',
            text: wasFinal ? 'Madalyanız profilinize eklendi.' : 'Maraton sizin için burada bitti.',
            color: wasFinal ? '#B0BEC5' : '#F44336',
          })
        }
        setTimeout(() => setMatchPopup(null), 4000)
      }
        if (matchTimeoutRef.current) clearTimeout(matchTimeoutRef.current)
        if (!msg.won) {
          setEliminated(true)
          setStatusMsg('❌ Elendi. Diğer maçları lobiden izleyebilirsiniz.')
        } else {
          setStatusMsg('✅ Kazandın! Sonraki tur bekleniyor...')
        }
        matchTimeoutRef.current = setTimeout(() => { setShowMatch(false); setQuestion(null) }, 4000)
        if (marathon) startPolling(marathon.id)
        break
      case 'marathon_end':
        setChampion(msg.champion)
        setStatusMsg(`🏅 Maraton bitti! Şampiyon: ${msg.champion}`)
        setShowMatch(false)
        // 5 saniye sonra yeni maratonu bekle
        setTimeout(() => {
          setChampion('')
          setMarathon(null)
          setParticipants([])
          setJoined(false)
          setEliminated(false)
          setStatusMsg('')
          init()
        }, 8000)
        break
      case 'participants':
        if (msg.participants) setParticipants(msg.participants)
        break
    }
  }

  const joinMarathon = async () => {
    if (!marathon) return
    try {
      await api.post(`/api/marathon/${marathon.id}/join`)
      setJoined(true)
      connectWS(marathon.id)
      startPolling(marathon.id)
    } catch (e: any) {
      setStatusMsg(e.response?.data?.detail || 'Katılım hatası')
    }
  }

  const sendAnswer = (answer: string) => {
    if (!wsRef.current || selectedAnswer || !question) return
    console.log('[SEND] answer:', answer, 'match_id:', matchId, 'ws state:', wsRef.current?.readyState)
    setSelectedAnswer(answer)
    if (timerRef.current) clearInterval(timerRef.current)
    wsRef.current.send(JSON.stringify({ type: 'answer', match_id: matchId, answer }))
  }

  const active = participants.filter(p => p.status === 'active')
  const eliminated_list = participants.filter(p => p.status === 'eliminated')
  const humanCount = active.filter(p => !p.is_bot).length
  const botCount = active.filter(p => p.is_bot).length

  if (matchPopup) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-7xl mb-4">{matchPopup.icon}</div>
        <h2 className="text-3xl font-black mb-2" style={{ color: matchPopup.color }}>{matchPopup.title}</h2>
        <p className="text-base" style={{ color: '#B0BEC5' }}>{matchPopup.text}</p>
      </div>
    )
  }

  if (champion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">🏆</div>
        <h1 className="text-3xl font-bold mb-2">Şampiyon!</h1>
        <p className="text-2xl text-yellow-400 font-bold">{champion}</p>
        <Link href="/" className="mt-8 text-blue-400 underline">Ana Sayfaya Dön</Link>
      </div>
    )
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

  if (showMatch) {
    const opts = question ? [
      { label: 'A', text: question.options[0] },
      { label: 'B', text: question.options[1] },
      { label: 'C', text: question.options[2] },
      { label: 'D', text: question.options[3] },
    ].filter(o => o.text) : []
    const qDiff = (question as any)?.difficulty || 'easy'
    const qCat = (question as any)?.category_name || ''
    const qIdx = (question as any)?.question_index ?? 0
    const qTotal = (question as any)?.total_questions ?? 3

    return (
      <div className="min-h-screen flex flex-col p-3" style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Skor bar */}
        <div className="glass p-4 mb-3 flex items-center justify-between rounded-2xl"
          style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)' }}>
          <div className="text-center flex-1 rounded-xl py-2">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm font-black mx-auto mb-1"
              style={{ background: 'linear-gradient(135deg, #4FC3F7, #1565C0)' }}>
              {myAvatar
                ? <img src={`https://api.bilgimaratonu.com${myAvatar}`} className="w-full h-full object-cover" alt="" />
                : user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="text-sm font-bold" style={{ color: '#4FC3F7' }}>{user?.username}</div>
            {myElo !== null && <div className="text-xs" style={{ color: '#B0BEC5' }}>{myElo} ELO</div>}
            <div className="text-3xl font-black">{Math.round(myScore * 100) / 100}</div>
          </div>
          <div className="text-center px-4">
            {qCat && <div className="text-xs mb-1 truncate" style={{ color: '#B0BEC5', maxWidth: 120 }}>📚 {qCat}</div>}
            <div className="font-black mb-1" style={{ color: '#FFFFFF', fontSize: 22 }}>
              <span style={{ color: '#4FC3F7' }}>{(question as any)?.question_index !== undefined ? (question as any).question_index + 1 : 1}</span>
              <span style={{ color: '#B0BEC5', fontSize: 16 }}>/{(question as any)?.total_questions || 3}</span>
            </div>
            <div className="text-3xl font-black" style={{
              color: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#FFD700'
            }}>{timeLeft}</div>
            <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>{roundLabel}</div>
            {(question as any)?.difficulty && (
              <div className="text-xs mt-1 px-2 py-0.5 rounded-full" style={{
                background: (question as any).difficulty === 'easy' ? 'rgba(76,175,80,0.2)' :
                           (question as any).difficulty === 'medium' ? 'rgba(255,193,7,0.2)' :
                           'rgba(244,67,54,0.2)',
                color: (question as any).difficulty === 'easy' ? '#4CAF50' :
                       (question as any).difficulty === 'medium' ? '#FFC107' : '#F44336',
              }}>
                {DIFFICULTY_LABELS[(question as any)?.difficulty] || (question as any)?.difficulty}
                {(question as any)?.points_correct != null && ` (+${(question as any).points_correct}/${(question as any).points_wrong})`}
              </div>
            )}
          </div>
          <div className="text-center flex-1 rounded-xl py-2">
            <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center text-sm font-black mx-auto mb-1"
              style={{ background: 'linear-gradient(135deg, #FF7043, #B71C1C)' }}>
              {oppAvatar
                ? <img src={`https://api.bilgimaratonu.com${oppAvatar}`} className="w-full h-full object-cover" alt="" />
                : opponent?.[0]?.toUpperCase()}
            </div>
            <div className="text-sm font-bold" style={{ color: '#FF7043' }}>{opponent}</div>
            {oppElo !== null && <div className="text-xs" style={{ color: '#B0BEC5' }}>{oppElo} ELO</div>}
            <div className="text-3xl font-black">{Math.round(oppScore * 100) / 100}</div>
          </div>
        </div>

        {/* Bildirim şeridi */}
        <div className="px-4 py-3 mb-3 text-center font-bold rounded-2xl" style={{
          background: 'rgba(255,255,255,0.05)',
          fontSize: 15,
          color: matchStatus.includes('✓') || matchStatus.includes('Rakip yanlış') ? '#4CAF50' :
                 matchStatus.includes('✗') || matchStatus.includes('yanlış yaptınız') ? '#F44336' :
                 matchStatus.includes('🎯') ? '#FFD700' : '#4FC3F7',
          minHeight: 48,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {matchStatus || <span style={{ color: '#555' }}>Cevap bekleniyor...</span>}
        </div>

        {/* Süre çubuğu */}
        <div className="h-2 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full transition-all duration-1000" style={{
            width: `${timeLeft > 0 ? (timeLeft / 20) * 100 : 0}%`,
            background: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#4FC3F7',
          }} />
        </div>

        {/* Soru */}
        <div className="p-6 mb-3 flex flex-col items-center justify-center text-center rounded-2xl"
          style={{ minHeight: 120, background: 'rgba(255,255,255,0.05)' }}>
        {(question as any)?.question_image && (
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 20 }}>
            <img src={`https://api.bilgimaratonu.com${(question as any).question_image}`} alt=""
              style={{ maxHeight: 180, maxWidth: '100%', width: 'auto', objectFit: 'contain', borderRadius: 12 }} />
          </div>
        )}
          <p className="text-xl font-semibold leading-relaxed text-center">{question?.text || 'Soru yükleniyor...'}</p>
        </div>

        {/* Şıklar 2x2 */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {opts.map(({ label, text }) => {
            let bg = 'rgba(255,255,255,0.05)'
            let border = 'rgba(255,255,255,0.1)'
            let color = '#FFFFFF'
            const isOppWrong = opponentWrongAnswer === label
            const isOppCorrect = opponentCorrectAnswer === label
            if (correctAnswer) {
              if (label === correctAnswer) { bg = 'rgba(76,175,80,0.2)'; border = '#4CAF50' }
              else if (label === selectedAnswer) { bg = 'rgba(244,67,54,0.2)'; border = '#F44336' }
              else if (isOppWrong) { bg = 'rgba(255,152,0,0.15)'; border = '#FF9800' }
              else { bg = 'rgba(255,255,255,0.02)'; color = '#555' }
            } else if (label === selectedAnswer) {
              bg = 'rgba(79,195,247,0.2)'; border = '#4FC3F7'
            } else if (isOppWrong) {
              bg = 'rgba(255,152,0,0.15)'; border = '#FF9800'
            }
            return (
              <button key={label}
                onClick={() => sendAnswer(label)}
                disabled={!!selectedAnswer || !!correctAnswer}
                style={{
                  background: bg, border: `2px solid ${border}`,
                  borderRadius: 14, padding: '14px 12px',
                  color, fontWeight: 600, textAlign: 'left',
                  cursor: selectedAnswer || correctAnswer ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s', fontSize: 15,
                }}>
                <span style={{ color: '#4FC3F7', fontWeight: 700, marginRight: 8 }}>{label})</span>
                {text}
                {isOppWrong && !correctAnswer && <span style={{ color: '#FF9800', fontSize: 12, marginLeft: 6 }}>◀ Rakip ✗</span>}
                {isOppCorrect && <span style={{ color: '#4CAF50', fontSize: 12, marginLeft: 6 }}>◀ Rakip ✓</span>}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 max-w-2xl mx-auto">
      <div className="bg-gray-800 rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">🏅 Bilgi Maratonu</h1>
            {!marathon && (
              <p className="text-sm mt-1" style={{ color: '#B0BEC5' }}>
                Geri sayım bittiğinde lobide <span style={{ color: '#4FC3F7', fontWeight: 600 }}>Katıl</span> butonuna tıklayınız.
              </p>
            )}

          </div>
          {marathon && (
            <div className="text-right">
              <span className="text-2xl font-bold text-blue-400">
                {active.length}/{marathon.max_participants}
              </span>
              <p className="text-xs text-gray-400 mt-1">👤 {humanCount} · 🤖 {botCount}</p>
            </div>
          )}
        </div>
        {marathon && (
          <div className="mt-3">
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${(active.length / marathon.max_participants) * 100}%` }} />
            </div>
            <div className="text-xs mt-1 text-right" style={{ color: '#B0BEC5' }}>
              %{Math.round((active.length / marathon.max_participants) * 100)} dolu
            </div>
          </div>
        )}
        <div className="mt-3 flex justify-between items-center">
          <span className={`text-sm ${joined ? 'text-green-400' : 'text-gray-400'}`}>
            {joined ? '✓ Bağlandı' : marathon ? '• Lobide' : ''}
          </span>
          {statusMsg && <span className="text-sm text-gray-300">{statusMsg}</span>}
        </div>
        {lobbyCountdown > 0 && marathon?.status === 'waiting' && (
          <div className="mt-2 text-center">
            <span className="text-yellow-400 font-bold text-lg">🏁 {lobbyCountdown} saniye içinde başlıyor!</span>
          </div>
        )}
        {marathon?.status === 'in_progress' && roundLabel && (
          <div className="mt-3 text-center rounded-xl py-2" style={{
            background: 'rgba(255,215,0,0.1)', border: '1px solid rgba(255,215,0,0.3)',
          }}>
            <div className="font-black text-xl" style={{ color: '#FFD700' }}>⚔️ {roundLabel}</div>
            <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>{active.length} kişi yarışıyor</div>
          </div>
        )}
      </div>

      {!marathon && (
        <div className="space-y-4 mb-4">
          {/* Buyuk geri sayim */}
          <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.12), rgba(79,195,247,0.12))', border: '1px solid rgba(255,215,0,0.25)' }}>
            <div className="text-sm mb-2" style={{ color: '#B0BEC5' }}>Sonraki Maraton</div>
            <div className="text-6xl font-black mb-2" style={{ color: '#FFD700', fontFamily: 'monospace' }}>
              {countdown > 0 ? `${String(Math.floor(countdown/60)).padStart(2,'0')}:${String(countdown%60).padStart(2,'0')}` : '--:--'}
            </div>
            <div className="text-sm" style={{ color: '#4FC3F7' }}>{nextTime && `Saat ${nextTime}'de başlıyor`}</div>
          </div>

          {/* Nasil calisir */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <h3 className="font-bold mb-3" style={{ color: '#FFD700' }}>🏁 Nasıl Çalışır?</h3>
            <div className="space-y-2 text-sm" style={{ color: '#B0BEC5' }}>
              <div className="flex items-center gap-3"><span className="text-lg">👥</span><span>Lobi dolunca maraton başlar, herkes eleme usulü yarışır</span></div>
              <div className="flex items-center gap-3"><span className="text-lg">⚔️</span><span>Her tur 1v1 eşleşme — kaybeden elenir</span></div>
              <div className="flex items-center gap-3"><span className="text-lg">🎯</span><span>Çeyrek final, yarı final, final ile daralır</span></div>
              <div className="flex items-center gap-3"><span className="text-lg">🏆</span><span>Son ayakta kalan Maraton Kupası'nı kazanır</span></div>
            </div>
          </div>

          {/* Istatistik */}
          {marathonStats && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(79,195,247,0.08)', border: '1px solid rgba(79,195,247,0.2)' }}>
                <div className="text-2xl font-black" style={{ color: '#4FC3F7' }}>{marathonStats.total_marathons}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Toplam Maraton</div>
              </div>
              <div className="rounded-2xl p-4 text-center" style={{ background: 'rgba(129,199,132,0.08)', border: '1px solid rgba(129,199,132,0.2)' }}>
                <div className="text-2xl font-black" style={{ color: '#81C784' }}>{marathonStats.avg_participants}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Ort. Katılımcı</div>
              </div>
            </div>
          )}

          {/* Son sampiyonlar */}
          {champions.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h3 className="font-bold mb-3" style={{ color: '#FFD700' }}>👑 Son Şampiyonlar</h3>
              <div className="space-y-2">
                {champions.map((c, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div className="flex items-center gap-2">
                      <span>{i === 0 ? '🏆' : '🎖️'}</span>
                      <span className="font-bold text-sm">{c.username}</span>
                    </div>
                    <span className="text-xs" style={{ color: '#B0BEC5' }}>{c.date} · {c.participants} kişi</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {marathon && !joined && marathon.status === 'waiting' && (
        <p className="text-center text-sm mb-2" style={{ color: '#B0BEC5' }}>
          Lobi süresi içinde maratona katılabilirsiniz.
        </p>
      )}

      {marathon && !joined && marathon.status === 'waiting' && (
        <button onClick={joinMarathon}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl mb-4 transition-all">
          Maratona Katıl
        </button>
      )}

      {eliminated && joined && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 mb-4 text-center">
          <span className="text-red-400">❌ Elendi — Diğer maçları izleyebilirsiniz</span>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: '#4CAF50' }}>✅ Aktif — {active.length} kişi</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {active.map((p: any, i: number) => {
              const isMe = p.username === user?.username
              const initial = (p.username || '?').charAt(0).toUpperCase()
              const colors = ['#4FC3F7', '#FF7043', '#81C784', '#BA68C8', '#FFD54F', '#4DB6AC']
              const bgColor = colors[i % colors.length]
              return (
                <div key={i} className="rounded-xl px-3 py-2 flex items-center gap-2" style={{
                  background: isMe ? 'rgba(79,195,247,0.15)' : 'rgba(255,255,255,0.04)',
                  border: isMe ? '1px solid #4FC3F7' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="rounded-full flex-shrink-0"
                      style={{ width: 32, height: 32, objectFit: 'cover' }} />
                  ) : (
                    <div className="rounded-full flex items-center justify-center flex-shrink-0 font-black"
                      style={{ width: 32, height: 32, background: p.is_bot ? '#37474F' : bgColor, fontSize: 14, color: '#fff' }}>
                      {p.is_bot ? '🤖' : initial}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate" style={{ color: isMe ? '#4FC3F7' : '#fff' }}>
                      {p.username}
                    </div>
                    <div className="text-xs" style={{ color: '#B0BEC5' }}>{p.elo_rating || 1200} ELO</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {eliminated_list.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2" style={{ color: '#F44336' }}>❌ Elendi — {eliminated_list.length} kişi</h3>
          <div className="grid grid-cols-3 gap-1 md:grid-cols-4">
            {eliminated_list.map((p: any, i: number) => (
              <span key={i} className="text-xs truncate px-2 py-1 rounded"
                style={{ color: '#666', textDecoration: 'line-through', background: 'rgba(255,255,255,0.02)' }}>
                {p.is_bot ? '🤖 ' : ''}{p.username}
              </span>
            ))}
          </div>
        </div>
      )}

      <Link href="/" className="text-sm text-gray-500 hover:text-gray-300">← Ana Sayfa</Link>
    </div>
  )
}
