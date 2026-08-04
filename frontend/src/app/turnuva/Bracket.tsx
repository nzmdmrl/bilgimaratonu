'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { avatarSrc } from '@/lib/avatar'

interface Player { username: string; avatar_url: string; is_bot: boolean; seed: number | null }
interface BMatch { round: number; index: number; p1: Player | null; p2: Player | null; winner_username: string | null; status: string }
export interface BracketData {
  size: number; rounds_total: number; status: string; current_round: number
  champion: string | null; matches: BMatch[]
}

const BOX_W = 140
const BOX_H = 46
const ROW_H = 60      // 1. tur maç dikey aralığı
const COL_W = 176
const PAD = 24

const ROUND_LABEL = (roundsFromEnd: number) => {
  // roundsFromEnd: 0=final,1=yarı,2=çeyrek...
  if (roundsFromEnd === 0) return 'Final'
  if (roundsFromEnd === 1) return 'Yarı Final'
  if (roundsFromEnd === 2) return 'Çeyrek Final'
  return `Son ${2 ** (roundsFromEnd + 1)}`
}

export default function Bracket({ data, me }: { data: BracketData; me?: string }) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const meNodeRef = useRef<HTMLDivElement | null>(null)
  const [z, setZ] = useState(1)
  const focusedKey = useRef<string>('')

  const N = Math.max(4, data.size)
  const R = data.rounds_total

  // bilinen maçlar (round,index) -> maç
  const known = useMemo(() => {
    const m: Record<string, BMatch> = {}
    for (const mm of data.matches) m[`${mm.round}_${mm.index}`] = mm
    return m
  }, [data])

  // pozisyon hesapları
  const { nodes, width, height, connectors } = useMemo(() => {
    const leftR1 = Math.max(1, N / 4)
    const H = leftR1 * ROW_H
    const memo: Record<string, number> = {}
    const posY = (r: number, li: number): number => {
      const k = `${r}_${li}`
      if (memo[k] != null) return memo[k]
      const y = r === 1 ? li * ROW_H + ROW_H / 2 : (posY(r - 1, 2 * li) + posY(r - 1, 2 * li + 1)) / 2
      memo[k] = y
      return y
    }
    const totalCols = 2 * R - 1
    const W = (totalCols - 1) * COL_W + BOX_W

    const nodeList: { key: string; x: number; y: number; round: number; index: number; m: BMatch | null }[] = []
    const posByKey: Record<string, { x: number; y: number }> = {}

    for (let r = 1; r <= R; r++) {
      const Mr = N / 2 ** r
      for (let k = 0; k < Mr; k++) {
        let x: number, y: number
        if (r === R) { x = (R - 1) * COL_W; y = H / 2 }
        else {
          const half = Mr / 2
          if (k < half) { x = (r - 1) * COL_W; y = posY(r, k) }
          else { x = (2 * R - 1 - r) * COL_W; y = posY(r, k - half) }
        }
        const key = `${r}_${k}`
        posByKey[key] = { x, y }
        nodeList.push({ key, x, y, round: r, index: k, m: known[key] || null })
      }
    }

    // konnektörler: (r,k) -> çocukları (r-1,2k),(r-1,2k+1)
    const conns: string[] = []
    for (let r = 2; r <= R; r++) {
      const Mr = N / 2 ** r
      for (let k = 0; k < Mr; k++) {
        const parent = posByKey[`${r}_${k}`]
        for (const ck of [2 * k, 2 * k + 1]) {
          const child = posByKey[`${r - 1}_${ck}`]
          if (!parent || !child) continue
          const childLeft = child.x < parent.x
          const cx = childLeft ? child.x + BOX_W : child.x
          const px = childLeft ? parent.x : parent.x + BOX_W
          const midX = (cx + px) / 2
          conns.push(`M ${cx} ${child.y} H ${midX} V ${parent.y} H ${px}`)
        }
      }
    }

    return { nodes: nodeList, width: W, height: H, connectors: conns }
  }, [N, R, known])

  // kullanıcının aktif maçına odaklan (maç değişince)
  useEffect(() => {
    if (!me) return
    const mine = data.matches.find(mm =>
      (mm.p1?.username === me || mm.p2?.username === me) && mm.status !== 'finished'
    ) || [...data.matches].reverse().find(mm => mm.p1?.username === me || mm.p2?.username === me)
    const key = mine ? `${mine.round}_${mine.index}` : ''
    if (key && key !== focusedKey.current) {
      focusedKey.current = key
      setTimeout(() => meNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }), 60)
    }
  }, [data, me])

  const myActiveKey = useMemo(() => {
    if (!me) return ''
    const mm = data.matches.find(x => (x.p1?.username === me || x.p2?.username === me) && x.status !== 'finished')
      || [...data.matches].reverse().find(x => x.p1?.username === me || x.p2?.username === me)
    return mm ? `${mm.round}_${mm.index}` : ''
  }, [data, me])

  return (
    <div style={{ position: 'relative' }}>
      {/* zoom kontrol */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 20, display: 'flex', gap: 6 }}>
        <button onClick={() => setZ(v => Math.min(1.6, +(v + 0.15).toFixed(2)))} style={zBtn}>＋</button>
        <button onClick={() => setZ(v => Math.max(0.35, +(v - 0.15).toFixed(2)))} style={zBtn}>－</button>
        <button onClick={() => { setZ(0.4) }} style={{ ...zBtn, width: 'auto', padding: '0 10px', fontSize: 12 }}>Tümü</button>
      </div>

      <div ref={scrollRef} style={{
        overflow: 'auto', maxHeight: '72vh', borderRadius: 12,
        background: 'rgba(10,14,39,0.5)', border: '1px solid var(--border)',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* @ts-ignore CSS zoom (WebKit/Blink) */}
        <div style={{ zoom: z, width: width + PAD * 2, height: height + PAD * 2, position: 'relative', padding: PAD }}>
          <div style={{ position: 'relative', width, height }}>
            {/* konnektörler */}
            <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
              {connectors.map((d, i) => (
                <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
              ))}
            </svg>

            {/* CHAMPION etiketi (merkez, final üstünde) */}
            <div style={{
              position: 'absolute', left: (R - 1) * COL_W, top: height / 2 - BOX_H - 34,
              width: BOX_W, textAlign: 'center', color: 'var(--gold)', fontWeight: 900, fontSize: 13, letterSpacing: 1,
            }}>🏆 Şampiyon{data.champion ? `` : ''}
              {data.champion && <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700 }}>{data.champion}</div>}
            </div>

            {/* maç kutuları */}
            {nodes.map(node => {
              const m = node.m
              const isMine = node.key === myActiveKey
              const rowsFromEnd = R - node.round
              const showLabelTop = node.index === 0 // her turun ilk maçının üstüne etiket
              return (
                <div key={node.key}
                  ref={isMine ? meNodeRef : undefined}
                  style={{
                    position: 'absolute', left: node.x, top: node.y - BOX_H / 2,
                    width: BOX_W, height: BOX_H,
                    borderRadius: 8, overflow: 'hidden',
                    border: isMine ? '2px solid #FFD700' : '1px solid var(--border)',
                    boxShadow: isMine ? '0 0 12px rgba(255,215,0,0.5)' : 'none',
                    background: 'rgba(20,26,54,0.95)',
                  }}>
                  {showLabelTop && (
                    <div style={{
                      position: 'absolute', top: -17, left: 0, width: BOX_W, textAlign: 'center',
                      fontSize: 10, color: 'var(--text-dimmer)', fontWeight: 700, whiteSpace: 'nowrap',
                    }}>{ROUND_LABEL(rowsFromEnd)}</div>
                  )}
                  <PlayerRow p={m?.p1 || null} winner={!!m?.winner_username && m?.winner_username === m?.p1?.username}
                    loser={!!m?.winner_username && m?.winner_username !== m?.p1?.username} me={me} />
                  <div style={{ height: 1, background: 'var(--surface-2)' }} />
                  <PlayerRow p={m?.p2 || null} winner={!!m?.winner_username && m?.winner_username === m?.p2?.username}
                    loser={!!m?.winner_username && m?.winner_username !== m?.p2?.username} me={me} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function PlayerRow({ p, winner, loser, me }: { p: Player | null; winner: boolean; loser: boolean; me?: string }) {
  const isMe = p && me && p.username === me
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, height: (BOX_H - 1) / 2, padding: '0 6px',
      opacity: loser ? 0.4 : 1,
      background: winner ? 'rgba(76,175,80,0.18)' : 'transparent',
    }}>
      {p ? (
        <>
          <img src={avatarSrc(p.avatar_url, p.username)} alt="" style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
          <span style={{
            fontSize: 11, fontWeight: winner || isMe ? 800 : 500,
            color: isMe ? '#FFD700' : winner ? '#A5D6A7' : '#E0E0E0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{p.username}</span>
          {winner && <span style={{ marginLeft: 'auto', fontSize: 10 }}>✓</span>}
        </>
      ) : (
        <span style={{ fontSize: 11, color: '#455A64' }}>—</span>
      )}
    </div>
  )
}

const zBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)',
  border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 900, cursor: 'pointer',
}
