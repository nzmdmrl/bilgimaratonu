'use client'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import api from '@/lib/api'
import Link from 'next/link'
import { initSounds, playSound, playCountdownTick, playCountdownBeep } from '@/lib/sound'

interface Question {
  id: string; text: string; difficulty: string; category_name: string
  option_a: string; option_b: string; option_c: string | null; option_d: string | null
  time_limit: number; index: number; total: number
  correct_answer: string
  question_image?: string
}
interface Result {
  question_id: string; question_text: string; selected: string | null
  correct_answer: string; is_correct: boolean; time_ms: number
  difficulty: string; category_name: string
  option_a: string; option_b: string; option_c: string; option_d: string
}
interface Progress {
  unlocked_level: number
  total_stars: number
  xp_per_star: number
  levels: Record<string, number>
}

const DIFF_LABELS: Record<string, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', very_hard: 'Çok Zor' }
const DIFF_COLORS: Record<string, string> = { easy: '#4CAF50', medium: '#FFC107', hard: '#FF7043', very_hard: '#E91E63' }

function Stars({ count, size = 16 }: { count: number; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{ fontSize: size, filter: i <= count ? 'none' : 'grayscale(1) opacity(0.35)' }}>⭐</span>
      ))}
    </span>
  )
}

export default function SoloPage() {
  const { user, fetchMe } = useAuthStore()
  const router = useRouter()
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const [screen, setScreen] = useState<'map' | 'countdown' | 'quiz' | 'result'>('map')
  const [progress, setProgress] = useState<Progress | null>(null)
  const [currentLevel, setCurrentLevel] = useState(1)
  const [replayLevel, setReplayLevel] = useState<number | null>(null)
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

  useEffect(() => {
    initSounds()
    fetchMe()
    loadProgress()
  }, [])

  const loadProgress = async () => {
    const token = localStorage.getItem('access_token')
    if (!token) { router.push('/giris'); return }
    try {
      const r = await api.get('/api/solo/progress')
      setProgress(r.data)
    } catch { /* ignore */ }
  }

  const onNodeClick = (level: number, locked: boolean, attempted: boolean) => {
    if (locked) return
    if (attempted) { setReplayLevel(level); return }  // tekrar oynama — uyar
    startLevel(level)
  }

  const startLevel = async (level: number) => {
    setReplayLevel(null)
    const token = localStorage.getItem('access_token')
    if (!token) { router.push('/giris'); return }
    setLoading(true)
    try {
      const r = await api.post('/api/solo/start', { level })
      setCurrentLevel(r.data.level || level)
      setSessionId(r.data.session_id)
      setQuestions(r.data.questions)
      setAnswers([])
      setCurrentIdx(0)
      setResult(null)
      setShowDetails(false)
      setScreen('countdown')
      setCountdown(3)
      playCountdownBeep(3)

      let c = 3
      const interval = setInterval(() => {
        c--
        setCountdown(c)
        playCountdownBeep(c)
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
        playCountdownTick(t - 1)
        return t - 1
      })
    }, 1000)
  }

  const handleAnswer = (selected: string | null) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const timeTaken = Date.now() - qStartTime
    setMyAnswer(selected)

    const correct = questions[currentIdx].correct_answer
    setCorrectAnswer(correct)
    playSound(selected && selected === correct ? 'correct' : 'wrong')

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
        playSound('new_question')
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
      const stars = r.data.stars ?? 0
      playSound(stars >= 1 ? 'win' : 'lose')
      if (stars >= 3) setTimeout(() => playSound('badge'), 900)
      fetchMe()        // header yıldızları güncelle
      loadProgress()   // harita güncelle
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

  // ─── LEVEL HARİTASI (zigzag + çöl arka planı) ───
  if (screen === 'map') {
    const unlocked = progress?.unlocked_level || 1
    const levels = progress?.levels || {}
    const nodeCount = unlocked + 1  // oynanabilir + bir kilitli önizleme

    const W = 340
    const GAP = 150
    const TOP_PAD = 60
    const BOTTOM_PAD = 90
    const H = (nodeCount - 1) * GAP + TOP_PAD + BOTTOM_PAD
    // Level L (1 en altta) -> ekran koordinatı
    const pos = (L: number) => {
      const k = L - 1
      const y = H - BOTTOM_PAD - k * GAP
      const x = k % 2 === 0 ? W * 0.30 : W * 0.70
      return { x, y }
    }
    const ptStr = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => { const p = pos(from + i); return `${p.x},${p.y}` }).join(' ')

    return (
      <div className="min-h-screen" style={{
        background: 'linear-gradient(180deg, #0A0E27 0%, #1A1B4B 100%)',
        position: 'relative', overflowX: 'hidden',
      }}>
        {/* Üst bar */}
        <div className="flex items-center justify-between px-4 py-3" style={{ position: 'sticky', top: 0, zIndex: 10, maxWidth: 500, margin: '0 auto' }}>
          <Link href="/" style={{ color: '#B0BEC5', fontSize: 22, fontWeight: 900, textDecoration: 'none' }}>←</Link>
          <div className="font-black" style={{ color: '#4FC3F7' }}>🎯 Solo Yolu</div>
          <div className="font-bold" style={{ color: '#FFD700' }}>🌟 {progress?.total_stars ?? 0}</div>
        </div>

        {/* Zigzag yol */}
        <div style={{ position: 'relative', width: W, height: H, margin: '0 auto', zIndex: 2 }}>
          <svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0, zIndex: 1, pointerEvents: 'none' }}>
            {unlocked >= 1 && (
              <polyline points={ptStr(1, unlocked)} fill="none" stroke="rgba(255,255,255,0.92)"
                strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
            )}
            {nodeCount > unlocked && (
              <polyline points={ptStr(unlocked, nodeCount)} fill="none" stroke="rgba(255,255,255,0.55)"
                strokeWidth={6} strokeDasharray="2 14" strokeLinecap="round" />
            )}
          </svg>

          {Array.from({ length: nodeCount }, (_, i) => i + 1).map(level => {
            const { x, y } = pos(level)
            const attempted = levels[String(level)] !== undefined
            const stars = levels[String(level)] ?? 0
            const locked = level > unlocked
            const isCurrent = level === unlocked && !locked
            const passed = attempted && stars >= 1

            let bg = 'linear-gradient(135deg,#B0B7BD,#78848C)'  // kilitli
            let ring = 'rgba(255,255,255,0.85)'
            let numColor = '#455A64'
            if (passed) { bg = 'radial-gradient(circle at 35% 30%,#64B5F6,#1565C0)'; ring = '#fff'; numColor = '#fff' }
            else if (!locked) { bg = 'radial-gradient(circle at 35% 30%,#4FC3F7,#0277BD)'; ring = '#fff'; numColor = '#fff' }

            return (
              <div key={level} style={{
                position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)',
                zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <button
                  onClick={() => onNodeClick(level, locked, attempted)}
                  disabled={locked || loading}
                  style={{
                    width: 74, height: 74, borderRadius: '50%',
                    background: bg,
                    border: `5px solid ${ring}`,
                    boxShadow: isCurrent ? '0 0 0 6px rgba(79,195,247,0.35), 0 6px 14px rgba(0,0,0,0.3)' : '0 5px 12px rgba(0,0,0,0.28)',
                    color: numColor, fontSize: 30, fontWeight: 900,
                    cursor: locked ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                  {level}
                  {locked && <span style={{ position: 'absolute', bottom: -7, fontSize: 17 }}>🔒</span>}
                </button>
                {passed && <div style={{ marginTop: 5 }}><Stars count={stars} size={19} /></div>}
                {isCurrent && !passed && (
                  <div style={{ marginTop: 5, fontSize: 11, color: '#fff', fontWeight: 800, background: 'rgba(2,119,189,0.85)', padding: '2px 8px', borderRadius: 999 }}>Buradan başla</div>
                )}
              </div>
            )
          })}
        </div>

        {/* Tekrar oynama uyarısı */}
        {replayLevel !== null && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }} onClick={() => setReplayLevel(null)}>
            <div className="glass" style={{ maxWidth: 360, padding: 24, borderRadius: 16, textAlign: 'center' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🔄</div>
              <h3 className="font-black text-lg mb-2">Level {replayLevel} — Tekrar Oyna</h3>
              <p className="text-sm mb-1" style={{ color: '#B0BEC5' }}>
                En iyi derecen: <Stars count={levels[String(replayLevel)] ?? 0} size={14} />
              </p>
              <p className="text-sm mb-4" style={{ color: '#FFD700' }}>
                ⚠️ Bu sefer <b>sorular değişecek</b>. Daha çok yıldız kazanabilirsin!
              </p>
              <div className="flex gap-2">
                <button onClick={() => setReplayLevel(null)}
                  className="flex-1 glass p-3 text-sm font-bold" style={{ color: '#B0BEC5' }}>Vazgeç</button>
                <button onClick={() => startLevel(replayLevel)} disabled={loading}
                  className="flex-1 btn-gold text-sm font-bold">{loading ? '...' : '▶ Başla'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (screen === 'countdown') return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center animate-fade-in">
        <div className="text-sm font-bold mb-2" style={{ color: '#4FC3F7' }}>LEVEL {currentLevel}</div>
        <div className="text-9xl font-black mb-4" style={{ color: '#FFD700' }}>{countdown || 'Başla!'}</div>
        <p style={{ color: '#B0BEC5' }}>{questions.length} soru hazır</p>
      </div>
    </div>
  )

  if (screen === 'quiz' && q) return (
    <div className="min-h-screen p-4" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="glass p-5 animate-fade-in">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs font-black px-2 py-0.5 rounded" style={{ background: 'rgba(79,195,247,0.15)', color: '#4FC3F7' }}>
            LEVEL {currentLevel}
          </div>
          <div className="text-sm font-bold" style={{ color: DIFF_COLORS[q.difficulty] }}>{DIFF_LABELS[q.difficulty] || q.difficulty}</div>
        </div>
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="text-sm font-bold min-w-0" style={{ color: '#B0BEC5' }}>
            {q.index + 1} / {q.total} <span style={{ color: '#4FC3F7' }}>· 📁 {q.category_name}</span>
          </div>
          <div className="text-3xl font-black flex-shrink-0" style={{
            color: timeLeft <= 5 ? '#F44336' : timeLeft <= 10 ? '#FF7043' : '#FFD700'
          }}>{timeLeft}</div>
        </div>

        <div className="h-1.5 rounded-full mb-4 overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div className="h-full rounded-full" style={{
            width: `${(q.index / q.total) * 100}%`,
            background: 'linear-gradient(90deg,#4FC3F7,#FFD700)',
          }} />
        </div>

        <div className="glass p-5 mb-4 text-center" style={{ minHeight: 80 }}>
          {q?.question_image && (
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginBottom: 16 }}>
              <img src={`https://api.bilgimaratonu.com${q.question_image}`} alt=""
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
            <div className="text-center mb-2 text-sm font-black" style={{ color: '#4FC3F7' }}>LEVEL {result.level}</div>
            <div className="text-center mb-3">
              <Stars count={result.stars} size={44} />
            </div>
            <h2 className="text-xl font-black mb-5 text-center" style={{ color: '#FFD700' }}>
              {result.stars >= 3 ? '🎉 Mükemmel!' : result.stars === 2 ? '👍 İyi iş!' : result.stars === 1 ? '🙂 Geçtin!' : '📚 Tekrar dene!'}
            </h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
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

            {/* XP / yıldız bilgisi */}
            {result.xp_gained > 0 ? (
              <div className="glass p-3 mb-4 text-center">
                <span style={{ color: '#FFD700' }}>
                  +{result.new_stars} yeni yıldız ⭐ × {result.xp_per_star} = <b>+{result.xp_gained} XP</b>
                </span>
              </div>
            ) : result.is_replay ? (
              <div className="glass p-3 mb-4 text-center text-sm" style={{ color: '#B0BEC5' }}>
                Yeni yıldız kazanmadın (en iyi derecen korunuyor). Daha fazlası için tekrar dene!
              </div>
            ) : null}

            <button onClick={() => setShowDetails(!showDetails)}
              className="w-full mb-3 text-sm py-2 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#B0BEC5' }}>
              {showDetails ? '▲ Detayları Gizle' : '▼ Soru Detaylarını Gör'}
            </button>
            {showDetails && (
              <div className="space-y-2 mb-4 max-h-72 overflow-y-auto">
                {result.results.map((r: Result, i: number) => {
                  const optMap: Record<string, string> = { A: r.option_a || 'A', B: r.option_b || 'B', C: r.option_c || 'C', D: r.option_d || 'D' }
                  return (
                    <div key={i} className="glass p-3 flex items-start gap-3">
                      <span className="text-xl flex-shrink-0">{r.is_correct ? '✅' : '❌'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{r.question_text}</div>
                        <div className="text-xs mt-1" style={{ color: '#B0BEC5' }}>
                          Cevabın: <span style={{ color: r.is_correct ? '#4CAF50' : '#F44336' }}>{r.selected ? optMap[r.selected] || r.selected : 'Boş'}</span>
                          {!r.is_correct && (<span> • Doğru: <span style={{ color: '#4CAF50' }}>{optMap[r.correct_answer] || r.correct_answer}</span></span>)}
                        </div>
                        <div className="text-xs" style={{ color: '#777' }}>{r.category_name} • {DIFF_LABELS[r.difficulty]}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex gap-2 mb-2">
              {result.unlocked_next ? (
                <button onClick={() => startLevel(result.next_level)} disabled={loading}
                  className="flex-1 btn-gold p-3 text-sm font-bold">➡ Sonraki Level</button>
              ) : (
                <button onClick={() => startLevel(result.level)} disabled={loading}
                  className="flex-1 btn-gold p-3 text-sm font-bold">🔄 Tekrar Dene</button>
              )}
              <button onClick={() => { setScreen('map'); setResult(null); setMyAnswer(null); loadProgress() }}
                className="flex-1 glass p-3 text-sm font-bold" style={{ color: '#4FC3F7' }}>🗺 Harita</button>
            </div>
            <Link href="/" className="block glass p-3 text-sm font-bold text-center" style={{ color: '#B0BEC5' }}>
              🏠 Ana Sayfa
            </Link>
          </>
        )}
      </div>
    </div>
  )

  return null
}
