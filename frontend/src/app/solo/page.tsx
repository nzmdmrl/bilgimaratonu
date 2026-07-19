'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import Link from 'next/link'

interface Category { id: string; name: string; icon: string }
interface Question {
  id: string; text: string; difficulty: string; category_name: string
  option_a: string; option_b: string; option_c: string | null; option_d: string | null
  time_limit: number; index: number; total: number
  correct_answer: string

}
interface Result {
  question_id: string; question_text: string; selected: string | null
  correct_answer: string; is_correct: boolean; time_ms: number
  difficulty: string; category_name: string
  option_a: string; option_b: string; option_c: string; option_d: string
}

function seededRandom(seed: string, idx: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  h = (h + idx * 2654435761) | 0
  return Math.abs(h) / 2147483648
}


const DIFF_LABELS: Record<string, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', very_hard: 'Çok Zor' }
const DIFF_COLORS: Record<string, string> = { easy: '#4CAF50', medium: '#FFC107', hard: '#FF7043', very_hard: '#E91E63' }

export default function SoloPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [screen, setScreen] = useState<'settings' | 'countdown' | 'quiz' | 'result'>('settings')
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCats, setSelectedCats] = useState<string[]>([])
  const [difficulty, setDifficulty] = useState('ascending')
  const [questionCount, setQuestionCount] = useState(7)
  const [countdown, setCountdown] = useState(3)

  const [sessionId, setSessionId] = useState('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [myAnswer, setMyAnswer] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(30)
  const [answers, setAnswers] = useState<any[]>([])
  const [startTime, setStartTime] = useState(0)
  const [qStartTime, setQStartTime] = useState(0)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [correctAnswer, setCorrectAnswer] = useState<string | null>(null)

  useEffect(() => { fetchMe(); loadCategories() }, [])

  const loadCategories = async () => {
    const r = await api.get('/api/solo/categories')
    setCategories(r.data.categories)
  }

  const toggleCat = (id: string) => {
    setSelectedCats(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id])
  }

  const startQuiz = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) { router.push('/giris'); return }
    setLoading(true)
    try {
      const r = await api.post('/api/solo/start', {
        category_ids: selectedCats,
        difficulty,
        question_count: questionCount,
      })
      setSessionId(r.data.session_id)
      setQuestions(r.data.questions)
      setAnswers([])
      setCurrentIdx(0)
      setScreen('countdown')
      setCountdown(3)

      let c = 3
      const interval = setInterval(() => {
        c--
        setCountdown(c)
        if (c <= 0) {
          clearInterval(interval)
          setScreen('quiz')
          setStartTime(Date.now())
          setQStartTime(Date.now())
          startTimer(r.data.questions[0]?.time_limit || 30)
        }
      }, 1000)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Hata')
    } finally {
      setLoading(false)
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

    // Doğru cevabı göster
    const correct = questions[currentIdx].correct_answer
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
      const r = await api.post('/api/solo/submit', {
        session_id: sessionId,
        answers: finalAnswers,
        total_time_seconds: totalTime,
      })
      setResult(r.data)
    } catch {
      setResult({ error: 'Sonuç kaydedilemedi.' })
    }
  }

  const { q, options } = useMemo(() => {
    if (!questions[currentIdx]) return { q: null, options: [] }
    const _q = questions[currentIdx]
    const _opts = [
      { label: 'A', text: _q.option_a },
      { label: 'B', text: _q.option_b },
      ...(_q.option_c ? [{ label: 'C', text: _q.option_c }] : []),
      ...(_q.option_d ? [{ label: 'D', text: _q.option_d }] : []),
    ]
    return { q: _q, options: _opts }
  }, [currentIdx, questions])

  if (screen === 'settings') return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-6 animate-fade-in">
        <h1 className="text-2xl font-black mb-1" style={{ color: '#4FC3F7' }}>⚡ Solo Pratik</h1>
        <p className="text-sm mb-4" style={{ color: '#B0BEC5' }}>Tek başına pratik yap — XP kazan, lig kaydı yok.</p>

        <button onClick={startQuiz} disabled={loading} className="btn-gold w-full text-lg mb-6">
          {loading ? 'Hazırlanıyor...' : '▶ Başla'}
        </button>

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="font-bold text-sm">Kategoriler</label>
            <button onClick={() => setSelectedCats([])} className="text-xs" style={{ color: '#B0BEC5' }}>
              Seçim yok = Tümü
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {categories.map(c => (
              <button key={c.id} onClick={() => toggleCat(c.id)}
                className="glass p-2 flex items-center gap-2 text-sm transition-all"
                style={{
                  border: selectedCats.includes(c.id) ? '2px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
                  background: selectedCats.includes(c.id) ? 'rgba(79,195,247,0.15)' : '',
                }}>
                <span>{c.icon}</span><span>{c.name}</span>
                {selectedCats.includes(c.id) && <span className="ml-auto" style={{ color: '#4FC3F7' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-5">
          <label className="font-bold text-sm block mb-2">Zorluk</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'mixed', label: '🎲 Karma' },
              { key: 'ascending', label: '📈 Yükselen' },
              { key: 'easy', label: '🟢 Kolay' },
              { key: 'medium', label: '🟡 Orta' },
              { key: 'hard', label: '🔴 Zor' },
              { key: 'very_hard', label: '💀 Çok Zor' },
            ].map(d => (
              <button key={d.key} onClick={() => setDifficulty(d.key)}
                className="glass p-2 text-sm font-bold transition-all"
                style={{
                  border: difficulty === d.key ? '2px solid #FFD700' : '1px solid rgba(255,255,255,0.1)',
                  color: difficulty === d.key ? '#FFD700' : '#B0BEC5',
                }}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <label className="font-bold text-sm block mb-2">Soru Sayısı</label>
          <div className="flex gap-2">
            {[7, 15, 30, 50].map(n => (
              <button key={n} onClick={() => setQuestionCount(n)}
                className="glass px-4 py-2 font-black text-lg flex-1 transition-all"
                style={{
                  border: questionCount === n ? '2px solid #4FC3F7' : '1px solid rgba(255,255,255,0.1)',
                  color: questionCount === n ? '#4FC3F7' : '#B0BEC5',
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <button onClick={startQuiz} disabled={loading} className="btn-gold w-full text-lg">
          {loading ? 'Hazırlanıyor...' : '▶ Başla'}
        </button>
        <Link href="/" className="block text-center mt-4 text-sm" style={{ color: '#B0BEC5' }}>← Ana Sayfa</Link>
      </div>
    </div>
  )

  if (screen === 'countdown') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="text-9xl font-black mb-4" style={{ color: '#FFD700' }}>{countdown || 'Başla!'}</div>
        <p style={{ color: '#B0BEC5' }}>{questions.length} soru hazır</p>
      </div>
    </div>
  )

  if (screen === 'quiz' && q) return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-bold" style={{ color: '#B0BEC5' }}>{q.index + 1} / {q.total}</div>
          <div className="text-3xl font-black" style={{
            color: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#FFD700'
          }}>{timeLeft}</div>
          <div className="text-sm" style={{ color: DIFF_COLORS[q.difficulty] }}>{DIFF_LABELS[q.difficulty]}</div>
        </div>

        <div className="h-1.5 rounded-full mb-3 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full" style={{
            width: `${(q.index / q.total) * 100}%`,
            background: 'linear-gradient(90deg,#4FC3F7,#FFD700)',
          }} />
        </div>

        <div className="text-xs mb-3 text-center" style={{ color: '#B0BEC5' }}>{q.category_name}</div>

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
                style={{
                  background: bg, border,
                  borderRadius: 12, padding: '14px 16px', color: 'white',
                  cursor: myAnswer ? 'not-allowed' : 'pointer',
                  textAlign: 'left', fontSize: 14, transition: 'all 0.2s',
                }}>
                <span className="font-bold mr-2" style={{
                  color: isCorrect ? '#4CAF50' : isWrong ? '#F44336' : '#4FC3F7'
                }}>{label})</span>{text}
                {isCorrect && <span className="ml-2">✓</span>}
                {isWrong && <span className="ml-2">✗</span>}
              </button>
            )
          })}
        </div>

        {!myAnswer && (
          <button onClick={() => handleAnswer(null)}
            className="w-full mt-3 text-sm py-2 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.05)', color: '#555' }}>
            ⏭ Geç
          </button>
        )}
      </div>
    </div>
  )

  if (screen === 'result') return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-6 animate-fade-in">
        {!result ? (
          <div className="text-center py-8" style={{ color: '#B0BEC5' }}>Sonuç kaydediliyor...</div>
        ) : result.error ? (
          <div style={{ color: '#F44336' }}>{result.error}</div>
        ) : (
          <>
            <h2 className="text-2xl font-black mb-6 text-center" style={{ color: '#FFD700' }}>
              {result.accuracy >= 80 ? '🎉 Harika!' : result.accuracy >= 60 ? '👍 İyi!' : '📚 Daha çalış!'}
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="glass p-4 text-center">
                <div className="text-3xl font-black" style={{ color: '#4CAF50' }}>{result.correct}</div>
                <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Doğru</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-3xl font-black" style={{ color: '#F44336' }}>{result.total - result.correct}</div>
                <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Yanlış</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-3xl font-black" style={{ color: '#4FC3F7' }}>%{result.accuracy}</div>
                <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>Başarı</div>
              </div>
            </div>
            {result.xp_gained > 0 && (
              <div className="glass p-3 mb-4 text-center">
                <span style={{ color: '#FFD700' }}>+{result.xp_gained} XP kazandın! ⭐</span>
              </div>
            )}
            <button onClick={() => setShowDetails(!showDetails)}
              className="w-full mb-3 text-sm py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#B0BEC5' }}>
              {showDetails ? '▲ Detayları Gizle' : '▼ Soru Detaylarını Gör'}
            </button>
            {showDetails && (
              <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
                {result.results.map((r: Result, i: number) => (
                  <div key={i} className="glass p-3 flex items-start gap-3">
                    <span className="text-xl flex-shrink-0">{r.is_correct ? '✅' : '❌'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{r.question_text}</div>
                      <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>
                        {(() => {
                          const optMap: Record<string, string> = { 
                            A: r.option_a || 'A', 
                            B: r.option_b || 'B', 
                            C: r.option_c || 'C', 
                            D: r.option_d || 'D' 
                          }
                          console.log('optMap:', optMap, 'selected:', r.selected, 'correct:', r.correct_answer)
                          return (
                            <>
                              Cevabın: <span style={{ color: r.is_correct ? '#4CAF50' : '#F44336' }}>
                                {r.selected ? optMap[r.selected] || r.selected : 'Boş'}
                              </span>
                              {!r.is_correct && (
                                <span> • Doğru: <span style={{ color: '#4CAF50' }}>
                                  {optMap[r.correct_answer] || r.correct_answer}
                                </span></span>
                              )}
                            </>
                          )
                        })()}
                      </div>
                      <div className="text-xs" style={{ color: '#777' }}>{r.category_name} • {DIFF_LABELS[r.difficulty]}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setScreen('settings'); setResult(null); setMyAnswer(null) }}
                className="flex-1 glass p-3 text-sm font-bold" style={{ color: '#4FC3F7' }}>
                🔄 Tekrar Oyna
              </button>
              <Link href="/" className="flex-1 glass p-3 text-sm font-bold text-center" style={{ color: '#B0BEC5' }}>
                🏠 Ana Sayfa
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return null
}
