'use client'
import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import DuelRoom from './duel'

const DIFF_LABELS: Record<string, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', very_hard: 'Çok Zor' }
const SCOREBOARD_LABELS: Record<string, string> = { single: 'Tek Sonuç', series: 'Seri Maç', daily: 'Günlük', monthly: 'Aylık', yearly: 'Yıllık', all: 'Tüm Zamanlar' }

export default function TestPage() {
  const { user } = useAuthStore()
  const { slug } = useParams<{ slug: string }>()
  const searchParams = useSearchParams()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [screen, setScreen] = useState<'info' | 'guest' | 'password' | 'countdown' | 'quiz' | 'result' | 'scoreboard'>('info')
  const [event, setEvent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [guestName, setGuestName] = useState('')
  const [password, setPassword] = useState('')
  const [participantId, setParticipantId] = useState('')
  const [questions, setQuestions] = useState<any[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [myAnswer, setMyAnswer] = useState<string | null>(null)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [answers, setAnswers] = useState<any[]>([])
  const [startTime, setStartTime] = useState(0)
  const [qStartTime, setQStartTime] = useState(0)
  const [countdown, setCountdown] = useState(3)
  const [result, setResult] = useState<any>(null)
  const [scoreboard, setScoreboard] = useState<any[]>([])
  const [scoreboardPeriod, setScoreboardPeriod] = useState('all')

  // Misafir token
  const [guestToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    let t = localStorage.getItem('guest_token')
    if (!t) { t = Math.random().toString(36).slice(2); localStorage.setItem('guest_token', t) }
    return t
  })

  useEffect(() => { 
    loadEvent()
  }, [slug])

  useEffect(() => {
    if (searchParams.get('tab') === 'scoreboard') {
      loadScoreboard('all')
    }
  }, [searchParams])

  const loadEvent = async () => {
    try {
      const r = await api.get(`/api/events/${slug}`)
      console.log('[EVENT] type:', r.data.type, 'is_active:', r.data.is_active)
      setEvent(r.data)
    } catch {
      setError('Test bulunamadı.')
    } finally {
      setLoading(false)
    }
  }

  const handleJoin = async () => {
    // Üye girişi zorunlu
    const token = localStorage.getItem('access_token')
    if (!token) { window.location.href = '/giris'; return }
    if (event.needs_password && !password) { setScreen('password'); return }

    try {
      const r = await api.post(`/api/events/${slug}/join`, {
        guest_name: guestName || undefined,
        password: password || undefined,
        guest_token: !user ? guestToken : undefined,
      })
      setParticipantId(r.data.participant_id)
      setQuestions(r.data.questions)
      setAnswers([])
      setCurrentIdx(0)
      setScreen('countdown')
      setCountdown(3)
      let c = 3
      const interval = setInterval(() => {
        c--; setCountdown(c)
        if (c <= 0) {
          clearInterval(interval)
          setScreen('quiz')
          setStartTime(Date.now())
          setQStartTime(Date.now())
          startTimer(r.data.questions[0]?.time_limit || 30)
        }
      }, 1000)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Hata oluştu')
    }
  }

  const startTimer = (secs: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimeLeft(secs)
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current!); handleAnswer(null); return 0 }
        return t - 1
      })
    }, 1000)
  }

  const handleAnswer = (selected: string | null) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const timeTaken = Date.now() - qStartTime
    setMyAnswer(selected)
    const correct = questions[currentIdx]?.correct_answer
    setCorrectAnswer(correct)
    const newAnswers = [...answers, { question_id: questions[currentIdx].id, selected, time_ms: timeTaken }]
    setAnswers(newAnswers)
    setTimeout(() => {
      const nextIdx = currentIdx + 1
      setCorrectAnswer(null)
      if (nextIdx >= questions.length) {
        submitQuiz(newAnswers)
      } else {
        setCurrentIdx(nextIdx)
        setMyAnswer(null)
        setQStartTime(Date.now())
        startTimer(questions[nextIdx].time_limit || 30)
      }
    }, 1500)
  }

  const submitQuiz = async (finalAnswers: any[]) => {
    setScreen('result')
    try {
      const totalTime = Math.round((Date.now() - startTime) / 1000)
      const r = await api.post(`/api/events/${slug}/submit`, {
        participant_id: participantId,
        answers: finalAnswers,
        total_time_seconds: totalTime,
      })
      setResult(r.data)
    } catch {
      setResult({ error: 'Sonuç kaydedilemedi.' })
    }
  }

  const loadScoreboard = async (period: string = 'all') => {
    const r = await api.get(`/api/events/${slug}/scoreboard?period=${period}`)
    setScoreboard(r.data.scoreboard)
    setScoreboardPeriod(period)
    setScreen('scoreboard')
  }

  const q = questions[currentIdx]
  const options = q ? [
    { label: 'A', text: q.option_a },
    { label: 'B', text: q.option_b },
    ...(q.option_c ? [{ label: 'C', text: q.option_c }] : []),
    ...(q.option_d ? [{ label: 'D', text: q.option_d }] : []),
  ] : []

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ color: '#B0BEC5' }}>Yükleniyor...</div>
  if (error) return <div className="min-h-screen flex items-center justify-center"><div className="glass p-8 text-center"><p style={{ color: '#F44336' }}>{error}</p><Link href="/testler" className="btn-gold mt-4 inline-block">← Testler</Link></div></div>
  if (event?.type === 'duel') return <DuelRoom slug={slug} event={event} />
  if (event && !event.is_active) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">📦</div>
        <h2 className="text-xl font-black mb-2" style={{ color: '#B0BEC5' }}>Test Arşivlendi</h2>
        <p className="text-sm mb-4" style={{ color: '#555' }}>Bu test şu an aktif değil.</p>
        <Link href="/testler" className="btn-gold inline-block">← Testler</Link>
      </div>
    </div>
  )

  // ── BİLGİ EKRANI ─────────────────────────────────────────────────────────
  if (screen === 'info') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full animate-fade-in">
        <h1 className="text-2xl font-black mb-2" style={{ color: '#FFD700' }}>{event.title}</h1>
        {event.description && <p className="text-sm mb-4" style={{ color: '#B0BEC5' }}>{event.description}</p>}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="glass p-3 text-center">
            <div className="font-bold">{event.question_count}</div>
            <div className="text-xs" style={{ color: '#B0BEC5' }}>Soru</div>
          </div>
          <div className="glass p-3 text-center">
            <div className="font-bold">{event.participant_count}</div>
            <div className="text-xs" style={{ color: '#B0BEC5' }}>Çözüm</div>
          </div>
          <div className="glass p-3 text-center">
            <div className="font-bold text-sm">{SCOREBOARD_LABELS[event.scoreboard_type]}</div>
            <div className="text-xs" style={{ color: '#B0BEC5' }}>Skor Tablosu</div>
          </div>
          <div className="glass p-3 text-center">
            <div className="font-bold">{event.time_limit_per_question}sn</div>
            <div className="text-xs" style={{ color: '#B0BEC5' }}>Soru Süresi</div>
          </div>
        </div>
        <button onClick={handleJoin} className="btn-gold w-full mb-3">▶ Teste Başla</button>
        <button onClick={() => loadScoreboard()} className="w-full glass p-3 text-sm font-bold" style={{ color: '#4FC3F7' }}>
          🏆 Skor Tablosunu Gör
        </button>
        <Link href="/testler" className="block text-center mt-4 text-sm" style={{ color: '#B0BEC5' }}>← Testler</Link>
      </div>
    </div>
  )

  // ── MİSAFİR ADI ──────────────────────────────────────────────────────────
  if (screen === 'guest') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-sm w-full">
        <h2 className="text-xl font-black mb-4" style={{ color: '#FFD700' }}>👤 Adınız</h2>
        <input className="input-field w-full mb-4" placeholder="Adınız veya rumuzunuz"
          value={guestName} onChange={e => setGuestName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        <button onClick={handleJoin} disabled={!guestName.trim()} className="btn-gold w-full">Devam Et</button>
      </div>
    </div>
  )

  // ── ŞİFRE ────────────────────────────────────────────────────────────────
  if (screen === 'password') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-sm w-full">
        <h2 className="text-xl font-black mb-4" style={{ color: '#FFD700' }}>🔒 Şifre Gerekli</h2>
        <input type="password" className="input-field w-full mb-4" placeholder="Test şifresi"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        {error && <p className="text-sm mb-3" style={{ color: '#F44336' }}>{error}</p>}
        <button onClick={handleJoin} className="btn-gold w-full">Giriş</button>
      </div>
    </div>
  )

  // ── GERİ SAYIM ───────────────────────────────────────────────────────────
  if (screen === 'countdown') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-9xl font-black mb-4" style={{ color: '#FFD700' }}>{countdown || '▶'}</div>
        <p style={{ color: '#B0BEC5' }}>{questions.length} soru</p>
      </div>
    </div>
  )

  // ── QUIZ ─────────────────────────────────────────────────────────────────
  if (screen === 'quiz' && q) return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold" style={{ color: '#B0BEC5' }}>{q.index + 1} / {q.total}</div>
          <div className="text-3xl font-black" style={{
            color: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#FFD700'
          }}>{timeLeft}</div>
          <div className="text-sm" style={{ color: '#B0BEC5' }}>{q.category_name}</div>
        </div>
        <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full" style={{
            width: `${(q.index / q.total) * 100}%`,
            background: 'linear-gradient(90deg,#4FC3F7,#FFD700)',
          }} />
        </div>
        <div className="glass p-5 mb-4 text-center" style={{ minHeight: 80 }}>
          {(q as any)?.question_image && (
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 16 }}>
              <img src={`https://api.bilgimaratonu.com${(q as any).question_image}`} alt=""
                style={{ maxHeight: 160, maxWidth: '100%', width: 'auto', objectFit: 'contain', borderRadius: 12 }} />
            </div>
          )}
          <p className="text-base font-semibold leading-relaxed" style={{ textAlign: 'center' }}>{q.text}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {options.map(({ label, text }) => {
            const isMine = myAnswer === label
            const isCorrect = correctAnswer === label
            const isWrong = isMine && correctAnswer && label !== correctAnswer
            let bg = 'rgba(255,255,255,0.08)'
            let border = '1px solid rgba(255,255,255,0.12)'
            if (isCorrect) { bg = 'rgba(76,175,80,0.4)'; border = '2px solid #4CAF50' }
            else if (isWrong) { bg = 'rgba(244,67,54,0.35)'; border = '2px solid #F44336' }
            else if (isMine) { bg = 'rgba(79,195,247,0.25)'; border = '2px solid #4FC3F7' }
            return (
              <button key={label} onClick={() => !myAnswer && handleAnswer(label)}
                disabled={!!myAnswer}
                style={{ background: bg, border, borderRadius: 12, padding: '14px 16px',
                  color: 'white', cursor: myAnswer ? 'not-allowed' : 'pointer',
                  textAlign: 'left', fontSize: 14, transition: 'all 0.2s' }}>
                <span className="font-bold mr-2" style={{
                  color: isCorrect ? '#4CAF50' : isWrong ? '#F44336' : '#4FC3F7'
                }}>{label})</span>{text}
              </button>
            )
          })}
        </div>
        {!myAnswer && (
          <button onClick={() => handleAnswer(null)} className="w-full mt-3 text-sm py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#555' }}>⏭ Geç</button>
        )}
      </div>
    </div>
  )

  // ── SONUÇ ────────────────────────────────────────────────────────────────
  if (screen === 'result') return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass p-8 max-w-md w-full text-center animate-fade-in">
        {!result ? (
          <p style={{ color: '#B0BEC5' }}>Sonuç kaydediliyor...</p>
        ) : result.error ? (
          <p style={{ color: '#F44336' }}>{result.error}</p>
        ) : (
          <>
            <div className="text-5xl mb-4">{result.accuracy >= 80 ? '🎉' : result.accuracy >= 60 ? '👍' : '📚'}</div>
            <h2 className="text-2xl font-black mb-6" style={{ color: '#FFD700' }}>
              {result.accuracy >= 80 ? 'Harika!' : result.accuracy >= 60 ? 'İyi!' : 'Daha çalış!'}
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="glass p-4">
                <div className="text-3xl font-black" style={{ color: '#4CAF50' }}>{result.correct}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Doğru</div>
              </div>
              <div className="glass p-4">
                <div className="text-3xl font-black" style={{ color: '#F44336' }}>{result.total - result.correct}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Yanlış</div>
              </div>
              <div className="glass p-4">
                <div className="text-3xl font-black" style={{ color: '#4FC3F7' }}>%{result.accuracy}</div>
                <div className="text-xs" style={{ color: '#B0BEC5' }}>Başarı</div>
              </div>
            </div>
            <div className="glass p-3 mb-4">
              <div className="font-black text-2xl" style={{ color: '#FFD700' }}>{result.score} puan</div>
              <div className="text-xs" style={{ color: '#B0BEC5' }}>⏱ {result.total_time_seconds} saniye</div>
            </div>
            <button onClick={() => loadScoreboard()} className="btn-gold w-full mb-3">
              🏆 Skor Tablosunu Gör
            </button>
            <Link href="/testler" className="block text-sm" style={{ color: '#B0BEC5' }}>← Testler</Link>
          </>
        )}
      </div>
    </div>
  )

  // ── SKOR TABLOSU ─────────────────────────────────────────────────────────
  if (screen === 'scoreboard') return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-6 animate-fade-in">
        <h2 className="text-xl font-black mb-4" style={{ color: '#FFD700' }}>🏆 {event.title}</h2>

        {/* Dönem seçici */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {[
            { key: 'all', label: 'Tüm Zamanlar' },
            ...(['daily','monthly','yearly'].includes(event.scoreboard_type) ? [
              { key: 'daily', label: 'Günlük' },
              { key: 'monthly', label: 'Aylık' },
              { key: 'yearly', label: 'Yıllık' },
            ] : [])
          ].map(p => (
            <button key={p.key} onClick={() => loadScoreboard(p.key)}
              className="px-3 py-1.5 rounded-lg text-sm font-bold"
              style={{
                background: scoreboardPeriod === p.key ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)',
                border: scoreboardPeriod === p.key ? '1px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                color: scoreboardPeriod === p.key ? '#FFD700' : '#B0BEC5',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {scoreboard.length === 0 ? (
          <div className="text-center py-8" style={{ color: '#B0BEC5' }}>Henüz sonuç yok.</div>
        ) : event.type === 'duel' ? (
          // Düello istatistikleri
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 mb-3 text-xs font-bold px-3" style={{ color: '#B0BEC5' }}>
              <span>Oyuncu</span>
              <span className="text-center">Galibiyet</span>
              <span className="text-center">En İyi Skor</span>
            </div>
            {scoreboard.map((entry: any, i: number) => (
              <div key={i} className="glass p-3 flex items-center gap-3">
                <span className="text-2xl w-8 text-center">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`}
                </span>
                <div className="flex-1">
                  <div className="font-bold">{entry.name}</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>
                    {entry.total} maç oynadı
                  </div>
                </div>
                <div className="text-center">
                  <div className="font-black" style={{ color: '#4CAF50' }}>{entry.wins}</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>galibiyet</div>
                </div>
                <div className="text-center">
                  <div className="font-black" style={{ color: '#FFD700' }}>{entry.best_score}p</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>rekor</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {scoreboard.map((entry, i) => (
              <div key={i} className="glass p-3 flex items-center gap-3">
                <span className="text-2xl font-black w-8 text-center" style={{
                  color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#B0BEC5'
                }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </span>
                <div className="flex-1">
                  <div className="font-bold">{entry.name}</div>
                  <div className="text-xs" style={{ color: '#B0BEC5' }}>
                    {entry.correct}/{event.question_count} doğru • {entry.time_seconds}sn
                  </div>
                </div>
                <div className="font-black" style={{ color: '#FFD700' }}>{entry.score}p</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <button onClick={() => setScreen('info')} className="flex-1 glass p-3 text-sm font-bold" style={{ color: '#4FC3F7' }}>
            ← Teste Dön
          </button>
          <Link href="/testler" className="flex-1 glass p-3 text-sm font-bold text-center" style={{ color: '#B0BEC5' }}>
            Testler
          </Link>
        </div>
      </div>
    </div>
  )

  return null
}
