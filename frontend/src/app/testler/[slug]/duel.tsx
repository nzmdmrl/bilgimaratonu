'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

export default function DuelRoom({ slug, event }: { slug: string; event: any }) {
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [screen, setScreen] = useState<'lobby'|'quiz'|'result'>('lobby')
  const [participants, setParticipants] = useState<Record<string,string>>({})
  const [isHost, setIsHost] = useState(false)
  const [myUserId, setMyUserId] = useState('')
  const [status, setStatus] = useState('Bağlanılıyor...')
  const [question, setQuestion] = useState<any>(null)
  const [scores, setScores] = useState<Record<string,number>>({})
  const [myAnswer, setMyAnswer] = useState<string|null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string|null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [rankings, setRankings] = useState<any[]>([])
  const [connected, setConnected] = useState(false)
  const [showScoreboard, setShowScoreboard] = useState(false)
  const [scoreboard, setScoreboard] = useState<any[]>([])
  const [opponentWrong, setOpponentWrong] = useState<Record<string,string>>({})

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) { setStatus('Giriş yapmanız gerekiyor'); return }
    const ws = new WebSocket(`wss://api.bilgimaratonu.com/api/events/${slug}/duel/ws?token=${token}`)
    wsRef.current = ws
    ws.onopen = () => { setConnected(true); setStatus('Bağlandı') }
    ws.onmessage = e => onMsg(JSON.parse(e.data))
    ws.onerror = () => setStatus('Bağlantı hatası')
    ws.onclose = () => { setConnected(false); setStatus('Bağlantı kesildi') }
    return () => ws.close()
  }, [])

  const onMsg = (msg: any) => {
    switch (msg.type) {
      case 'joined':
        setMyUserId(msg.user_id)
        setIsHost(msg.is_host)
        setStatus(msg.is_host ? 'Oda sahibisiniz' : 'Bekleniyor...')
        break
      case 'room_update':
        setParticipants(msg.participant_names || {})
        setStatus(`${msg.count}/4 katılımcı`)
        break
      case 'duel_starting':
        setStatus('Düello başlıyor!')
        setTimeout(() => setScreen('quiz'), 3000)
        break
      case 'question':
        setScreen('quiz')
        setQuestion(msg.question)
        setScores(msg.scores || {})
        setMyAnswer(null)
        setCorrectAnswer(null)
        setOpponentWrong({})
        setStatus('Cevap bekleniyor...')
        startTimer(msg.question.time_limit || 30)
        break
      case 'correct_answer':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        setScores(msg.scores || {})
        setStatus(`✓ ${msg.username} doğru cevapladı!`)
        break
      case 'wrong_answer':
        setCorrectAnswer(msg.correct_answer)
        setStatus('✗ Yanlış cevap!')
        break
      case 'opponent_wrong':
        setOpponentWrong(prev => ({ ...prev, [msg.user_id]: msg.wrong_answer }))
        setStatus(`${msg.username} yanlış cevap verdi!`)
        break
      case 'all_wrong':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        setStatus('❌ Hepiniz yanlış cevap verdiniz!')
        break
      case 'question_end':
        stopTimer()
        setCorrectAnswer(msg.correct_answer)
        setScores(msg.scores || {})
        break
      case 'duel_end':
        stopTimer()
        setRankings(msg.rankings || [])
        setScreen('result')
        break
    }
  }

  const startTimer = (secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => { if (t <= 1) { clearInterval(timerRef.current!); return 0 } return t - 1 })
    }, 1000)
  }

  const stopTimer = () => { if (timerRef.current) clearInterval(timerRef.current) }

  const loadScoreboard = async () => {
    try {
      const r = await api.get(`/api/events/${slug}/scoreboard`)
      setScoreboard(r.data.scoreboard || [])
      setShowScoreboard(true)
    } catch {}
  }

  const startDuel = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({ type: 'start' }))
  }

  const sendAnswer = (answer: string) => {
    if (myAnswer || correctAnswer || !question) return
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    setMyAnswer(answer)
    wsRef.current.send(JSON.stringify({ type: 'answer', question_id: question.id, answer }))
  }

  const q = question
  const options = q ? [
    { label: 'A', text: q.option_a },
    { label: 'B', text: q.option_b },
    ...(q.option_c ? [{ label: 'C', text: q.option_c }] : []),
    ...(q.option_d ? [{ label: 'D', text: q.option_d }] : []),
  ] : []

  if (screen === 'lobby') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full">
        <h1 className="text-xl font-black mb-1" style={{ color: '#FFD700' }}>⚔️ {event.title}</h1>
        <p className="text-sm mb-4" style={{ color: '#B0BEC5' }}>Düello Odası</p>
        <div className="glass p-3 mb-4 text-center font-bold text-sm" style={{ color: connected ? '#4CAF50' : '#F44336' }}>
          {status}
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[0,1,2,3].map(i => {
            const entries = Object.entries(participants)
            const entry = entries[i]
            return (
              <div key={i} className="glass p-3 flex items-center gap-2" style={{
                border: entry && entry[0] === myUserId ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.08)'
              }}>
                {entry ? (
                  <>
                    <span>👤</span>
                    <span className="text-sm font-bold truncate" style={{ color: entry[0] === myUserId ? '#FFD700' : 'white' }}>
                      {entry[1]}
                    </span>
                  </>
                ) : <span className="text-sm" style={{ color: '#333' }}>Bekleniyor...</span>}
              </div>
            )
          })}
        </div>
        <button onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Link kopyalandı!') }}
          className="w-full glass p-3 text-sm font-bold mb-3" style={{ color: '#4FC3F7' }}>
          📋 Davet Linkini Kopyala
        </button>
        {isHost ? (
          <button onClick={startDuel} className="btn-gold w-full">⚔️ Düelloyu Başlat</button>
        ) : (
          <p className="text-center text-sm" style={{ color: '#B0BEC5' }}>Host'un başlatmasını bekleyin...</p>
        )}
        <Link href="/testler" className="block text-center mt-3 text-sm" style={{ color: '#555' }}>← Testler</Link>
      </div>
    </div>
  )

  if (screen === 'quiz') return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-5">
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: `repeat(${Math.max(Object.keys(participants).length,1)}, 1fr)` }}>
          {Object.entries(participants).map(([uid, name]) => (
            <div key={uid} className="glass p-2 text-center" style={{ border: uid===myUserId?'1px solid #FFD700':'1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-xs truncate" style={{ color: uid===myUserId?'#FFD700':'#B0BEC5' }}>{name}</div>
              <div className="text-xl font-black">{scores[uid]||0}</div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm" style={{ color: '#B0BEC5' }}>{q?`${q.index+1}/${q.total}`:''}</div>
          <div className="text-3xl font-black" style={{ color: timeLeft<=5?'#F44336':timeLeft<=10?'#FF7043':'#FFD700' }}>{timeLeft}</div>
          <div className="text-sm" style={{ color: '#B0BEC5' }}>{q?.category_name||''}</div>
        </div>
        <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          {q && <div className="h-full rounded-full" style={{ width:`${(q.index/q.total)*100}%`, background:'linear-gradient(90deg,#4FC3F7,#FFD700)' }}/>}
        </div>
        <div className="text-center text-sm font-bold mb-3" style={{ color: status.includes('✓')?'#4CAF50':status.includes('✗')?'#F44336':'#4FC3F7' }}>
          {status}
        </div>
        <div className="glass p-5 mb-4 text-center">
          <p className="text-base font-semibold">{q?.text||'...'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {options.map(({label,text}) => {
            const isMine=myAnswer===label, isCorrect=correctAnswer===label
            const isWrong=isMine&&!!correctAnswer&&label!==correctAnswer
            const isOppWrong=Object.values(opponentWrong).includes(label) && !isMine
            let bg='rgba(255,255,255,0.08)', border='1px solid rgba(255,255,255,0.12)'
            if(isCorrect){bg='rgba(76,175,80,0.4)';border='2px solid #4CAF50'}
            else if(isWrong){bg='rgba(244,67,54,0.35)';border='2px solid #F44336'}
            else if(isMine){bg='rgba(79,195,247,0.25)';border='2px solid #4FC3F7'}
            else if(isOppWrong){bg='rgba(255,152,0,0.15)';border='1px solid rgba(255,152,0,0.4)'}
            const isDisabled = !!(myAnswer || correctAnswer)
            return (
              <button key={label} onClick={()=>sendAnswer(label)} disabled={isDisabled}
                style={{background:bg,border,borderRadius:12,padding:'14px 16px',color:'white',
                  cursor:isDisabled?'not-allowed':'pointer',textAlign:'left',fontSize:14,transition:'all 0.2s'}}>
                <span className="font-bold mr-2" style={{color:isCorrect?'#4CAF50':isWrong?'#F44336':'#4FC3F7'}}>{label})</span>
                {text}
                {isOppWrong && <span className="ml-1 text-xs" style={{color:'#FF9800'}}> ✗</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (showScoreboard) return (
    <div className="min-h-screen p-4" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="glass p-6 animate-fade-in">
        <h2 className="text-xl font-black mb-4" style={{ color: '#FFD700' }}>🏆 Skor Tablosu</h2>
        {scoreboard.length === 0 ? (
          <p style={{ color: '#B0BEC5' }}>Henüz sonuç yok.</p>
        ) : event.type === 'duel' ? (
          <div className="space-y-2">
            {scoreboard.map((entry: any, i: number) => (
              <div key={i} className="glass p-3 flex items-center gap-3">
                <span className="text-2xl">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}</span>
                <div className="flex-1">
                  <div className="font-bold">{entry.name}</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>{entry.total} maç • {entry.wins} galibiyet</div>
                </div>
                <div className="text-right">
                  <div className="font-black" style={{ color: '#FFD700' }}>{entry.best_score}p</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>en iyi</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {scoreboard.map((entry: any, i: number) => (
              <div key={i} className="glass p-3 flex items-center gap-3">
                <span className="text-2xl">{i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}</span>
                <div className="flex-1"><div className="font-bold">{entry.name}</div></div>
                <div className="font-black" style={{ color: '#FFD700' }}>{entry.score}p</div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setShowScoreboard(false)} className="btn-gold w-full mt-4">← Geri</button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">🏆</div>
        <h2 className="text-2xl font-black mb-6" style={{ color: '#FFD700' }}>Düello Bitti!</h2>
        <div className="space-y-3 mb-6">
          {rankings.map(r => (
            <div key={r.user_id} className="glass p-3 flex items-center gap-3"
              style={{ border: r.user_id===myUserId?'1px solid #FFD700':'1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-2xl">{r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':`${r.rank}.`}</span>
              <div className="flex-1 text-left">
                <div className="font-bold" style={{ color: r.user_id===myUserId?'#FFD700':'white' }}>
                  {r.username}{r.user_id===myUserId?' (Sen)':''}
                </div>
                <div className="text-sm" style={{ color: '#4FC3F7' }}>{r.score} puan</div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => window.location.href = `/testler/${slug}#scoreboard`}
          className="w-full glass p-3 text-sm font-bold mb-3" style={{ color: '#4FC3F7' }}>
          📊 Skorları Gör
        </button>
        <button onClick={() => {
            setQuestion(null)
            setRankings([])
            setScores({})
            setMyAnswer(null)
            setCorrectAnswer(null)
            setOpponentWrong({})
            setScreen('lobby')
            // Host ise 2sn sonra otomatik başlat
            if (isHost) {
              setTimeout(() => {
                if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: 'start' }))
                }
              }, 2000)
            }
          }} className="btn-gold w-full mb-3">🔄 Tekrar Oyna</button>
        <Link href="/testler" className="block text-sm text-center mt-2" style={{ color: '#B0BEC5' }}>← Testler</Link>
      </div>
    </div>
  )
}
