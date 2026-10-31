import { useEffect, useMemo, useRef, useState } from 'react'
import { syllableMap } from './content.ts'
import { LETTERS, LOOKALIKE, VOWELS, cvAudio, letterAudio, letterWylie, partsOf, rootReason, shuffle, wordMap, words, type KC, } from './course.ts'
import { GAMES, planToday, saveCheckin, streakInfo, sylOf, type GameKind, type TodayPlan } from './daily.ts'
import { db } from './db.ts'
import { recordAnswer } from './progress.ts'
import { play } from './audio.ts'
import { say } from './sound.ts'
import './games.css'

type Item = { kc: KC; tib: string; wylie: string; audio?: string; gloss?: string }

const pick = <T,>(a: T[], k: number) => shuffle(a).slice(0, k)

/** 把知识点变成可以显示的一项：藏文、转写、音频。 */
function itemOf(kc: KC): Item {
  const v = kc.slice(2)
  switch (kc[0]) {
    case 'L':
      return { kc, tib: v, wylie: letterWylie.get(v)!, audio: letterAudio(v) }
    case 'V': {
      const [mark, vw] = VOWELS.find((x) => x[0] === v)!
      const [base, bw] = pick(LETTERS.filter((l) => !['འ', 'ཨ'].includes(l[0])), 1)[0]
      return { kc, tib: base + mark, wylie: bw.slice(0, -1) + vw, audio: cvAudio(base, mark) }
    }
    case 'W': {
      const w = wordMap.get(v)!
      return { kc, tib: w.tibetan, wylie: w.wylie, audio: w.audio, gloss: w.gloss }
    }
    default: {
      const s = syllableMap.get(v)!
      return { kc, tib: s.tibetan, wylie: s.wylie, audio: s.audio }
    }
  }
}

type Result = { score: number; total: number; note: string; missed: Item[] }

export default function Game({ kind, daily, onExit }: { kind?: GameKind; daily: boolean; onExit: () => void }) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [checkin, setCheckin] = useState<{ first: boolean; streak: number; total: number } | null>(null)

  useEffect(() => {
    planToday(new Date(), kind).then(setPlan)
  }, [kind])
  const items = useMemo(() => plan?.items.map(itemOf) ?? [], [plan])
  const preview = useMemo(() => (plan?.preview ? itemOf(plan.preview) : undefined), [plan])

  const finish = async (r: Result) => {
    setResult(r)
    if (daily && plan) {
      const first = await saveCheckin(plan.game, r.score, r.total)
      const s = await streakInfo()
      setCheckin({ first, streak: s.streak, total: s.total })
    }
  }

  if (!plan) return <section className="lesson">载入中…</section>
  const g = GAMES[plan.game]

  if (result)
    return (
      <section className="lesson summary">
        {checkin?.first && <div className="stamp">今日已签到</div>}
        <h1>{g.name}</h1>
        <div className="big-number">
          {result.score}
          <span className="small muted"> / {result.total}</span>
        </div>
        <p className="muted">{result.note}</p>
        {checkin && (
          <p>
            已连续 <b>{checkin.streak}</b> 天 · 累计 {checkin.total} 天
          </p>
        )}
        {result.missed.length > 0 && (
          <>
            <p>再看一眼：</p>
            <div className="missed">
              {result.missed.map((m, i) => (
                <button key={i} onClick={() => m.audio && play(m.audio)}>
                  <span className="tib">{m.tib}</span>
                  <span className="small muted">{m.gloss ?? m.wylie}</span>
                </button>
              ))}
            </div>
          </>
        )}
        <button className="primary" onClick={onExit}>
          返回
        </button>
      </section>
    )

  return (
    <section className="lesson game">
      <div className="lesson-top">
        <button className="link" onClick={onExit}>
          ✕
        </button>
        <div className="game-title">
          {g.name}
          {plan.tasting && <span className="small muted"> · 尝鲜</span>}
        </div>
      </div>
      {plan.tasting && <p className="small muted center">还没开始学也没关系，先认识几个字母。</p>}
      {plan.game === 'flip' && <Flip items={items} preview={preview} onDone={finish} />}
      {plan.game === 'quiz' && <Quiz items={items} onDone={finish} />}
      {plan.game === 'build' && <Build items={items} onDone={finish} />}
      {plan.game === 'words' && <Words items={items} onDone={finish} />}
      {plan.game === 'root' && <Root items={items} onDone={finish} />}
      {plan.game === 'whack' && <Whack items={items} onDone={finish} />}
      {plan.game === 'mix' && <Mix items={items} onDone={finish} />}
    </section>
  )
}

/** 翻牌配对：记忆游戏，不记入掌握度。 */
function Flip({ items, preview, onDone }: { items: Item[]; preview?: Item; onDone: (r: Result) => void }) {
  const pairs = preview ? [...items.slice(0, 5), preview] : items
  const [cards] = useState(() =>
    shuffle(pairs.flatMap((it, i) => [{ pair: i, face: it.tib, tib: true }, { pair: i, face: it.wylie, tib: false }])),
  )
  const [open, setOpen] = useState<number[]>([])
  const [matched, setMatched] = useState<Set<number>>(new Set())
  const [moves, setMoves] = useState(0)

  const flip = (i: number) => {
    if (open.length === 2 || open.includes(i) || matched.has(cards[i].pair)) return
    const now = [...open, i]
    setOpen(now)
    say(cards[i].face)
    if (now.length < 2) return
    setMoves(moves + 1)
    const [a, b] = now.map((k) => cards[k])
    if (a.pair === b.pair) {
      const it = pairs[a.pair]
      if (it.audio) play(it.audio)
      const m = new Set(matched).add(a.pair)
      setMatched(m)
      setOpen([])
      if (m.size === pairs.length)
        setTimeout(() => onDone({ score: pairs.length, total: pairs.length, note: `用了 ${moves + 1} 步配完 ${pairs.length} 对`, missed: [] }), 700)
    } else setTimeout(() => setOpen([]), 900)
  }

  return (
    <>
      <p className="ask center">翻出藏文和它的转写，配成一对</p>
      <div className="flip-grid">
        {cards.map((c, i) => {
          const shown = open.includes(i) || matched.has(c.pair)
          return (
            <button key={i} className={'flip' + (shown ? ' shown' : '') + (matched.has(c.pair) ? ' done' : '')} onClick={() => flip(i)}>
              {shown ? <span className={c.tib ? 'tib' : 'latin'}>{c.face}</span> : <span className="back">ༀ</span>}
              {shown && preview && pairs[c.pair] === preview && <span className="new-tag">新</span>}
            </button>
          )
        })}
      </div>
      <p className="small muted center">已翻 {moves} 步</p>
    </>
  )
}

/** 一个错误的转写：优先用形近字或相似音节。 */
function wrongWylie(it: Item, all: Item[]) {
  if (it.kc.startsWith('L:')) {
    const g = LOOKALIKE.find((x) => x.includes(it.tib))?.filter((x) => x !== it.tib && letterWylie.has(x)) ?? []
    const cand = g.length ? g.map((x) => letterWylie.get(x)!) : LETTERS.map((l) => l[1]).filter((w) => w !== it.wylie)
    return pick(cand, 1)[0]
  }
  const others = all.filter((x) => x.wylie !== it.wylie && x.kc[0] === it.kc[0]).map((x) => x.wylie)
  if (others.length) return pick(others, 1)[0]
  const pool = it.kc.startsWith('W:') ? words.map((w) => w.wylie) : [...syllableMap.values()].map((s) => s.wylie)
  return pick(pool.filter((w) => w !== it.wylie), 1)[0]
}

/** 快问快答：15 秒判断对错。限时，不记入掌握度。 */
function Quiz({ items, onDone }: { items: Item[]; onDone: (r: Result) => void }) {
  const make = () => {
    const it = pick(items, 1)[0]
    const truth = Math.random() < 0.5
    return { it, claim: truth ? it.wylie : wrongWylie(it, items), truth }
  }
  const [q, setQ] = useState(make)
  const [left, setLeft] = useState(15)
  const [score, setScore] = useState(0)
  const [count, setCount] = useState(0)
  const [combo, setCombo] = useState(0)
  const [best, setBest] = useState(0)
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
  const missed = useRef<Item[]>([])
  const ended = useRef(false)

  useEffect(() => {
    if (left <= 0) {
      if (!ended.current) {
        ended.current = true
        onDone({ score, total: count, note: `最长连击 ${best}`, missed: [...new Map(missed.current.map((m) => [m.kc, m])).values()].slice(0, 8) })
      }
      return
    }
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left, score, count, best, onDone])

  const answer = (yes: boolean) => {
    if (left <= 0) return
    const ok = yes === q.truth
    setCount(count + 1)
    setFlash(ok ? 'ok' : 'bad')
    setTimeout(() => setFlash(null), 250)
    if (ok) {
      setScore(score + 1)
      setCombo(combo + 1)
      setBest(Math.max(best, combo + 1))
    } else {
      setCombo(0)
      missed.current.push(q.it)
    }
    setQ(make())
  }

  return (
    <>
      <div className="quiz-top">
        <span className={'timer' + (left <= 10 ? ' low' : '')}>{left}s</span>
        <span>得分 {score}</span>
        {combo >= 3 && <span className="combo">连击 ×{combo}</span>}
      </div>
      <div className={'quiz-card' + (flash ? ' ' + flash : '')}>
        <div className="tib huge tap" onClick={() => q.it.audio && play(q.it.audio)}>{q.it.tib}</div>
        <div className="ask">读作</div>
        <div className="latin-big">{q.claim}</div>
        <div className="ask">吗？</div>
      </div>
      <div className="options">
        <button className="opt big-yes" onClick={() => answer(true)}>
          对
        </button>
        <button className="opt big-no" onClick={() => answer(false)}>
          错
        </button>
      </div>
    </>
  )
}

/** 按书写顺序列出音节的组成部分（含元音）。 */
function partsOfSyl(tib: string) {
  const s = sylOf(tib)
  const out: { ch: string; role: string }[] = []
  if (s.prefix) out.push({ ch: s.prefix, role: '前加字' })
  if (s.superscript) out.push({ ch: s.superscript, role: '上加字' })
  out.push({ ch: s.root, role: '基字' })
  for (const c of s.subscript ?? '') out.push({ ch: c, role: '下加字' })
  if (s.vowel) out.push({ ch: s.vowel, role: '元音' })
  if (s.suffix) out.push({ ch: s.suffix, role: '后加字' })
  if (s.postSuffix) out.push({ ch: s.postSuffix, role: '再后加字' })
  return out
}

const showCh = (ch: string) => (VOWELS.some((v) => v[0] === ch) ? '◌' + ch : ch)

/** 拼音节：按顺序点出每个组成部分。记入掌握度。 */
function Build({ items, onDone }: { items: Item[]; onDone: (r: Result) => void }) {
  const [i, setI] = useState(0)
  const [filled, setFilled] = useState(0)
  const [used, setUsed] = useState<Set<number>>(new Set())
  const [shake, setShake] = useState<number | null>(null)
  const [erred, setErred] = useState(false)
  const [score, setScore] = useState(0)
  const missed = useRef<Item[]>([])
  const it = items[i]
  const parts = partsOfSyl(it.tib)
  const [tiles, setTiles] = useState<string[]>([])

  useEffect(() => {
    const ps = partsOfSyl(items[i].tib)
    const near = ps.flatMap((p) => LOOKALIKE.find((g) => g.includes(p.ch)) ?? []).filter((c) => letterWylie.has(c) && !ps.some((p) => p.ch === c))
    const extra = pick(near.length >= 2 ? near : [...near, ...LETTERS.map((l) => l[0])].filter((c) => !ps.some((p) => p.ch === c)), 2)
    const vowelExtra = ps.some((p) => p.role === '元音') ? pick(VOWELS.map((v) => v[0]).filter((v) => !ps.some((p) => p.ch === v)), 1) : []
    setTiles(shuffle([...ps.map((p) => p.ch), ...new Set([...extra, ...vowelExtra])]))
    setFilled(0)
    setUsed(new Set())
    setErred(false)
    if (items[i].audio) play(items[i].audio!)
  }, [i, items])

  const complete = filled >= parts.length

  const tap = (k: number) => {
    if (complete || used.has(k)) return
    say(tiles[k])
    if (tiles[k] === parts[filled].ch) {
      setUsed(new Set(used).add(k))
      const f = filled + 1
      setFilled(f)
      if (f === parts.length) {
        if (it.audio) play(it.audio)
        if (!erred) setScore(score + 1)
        else missed.current.push(it)
        void recordAnswer(it.kc, !erred, undefined, 'game')
      }
    } else {
      setErred(true)
      setShake(k)
      setTimeout(() => setShake(null), 400)
    }
  }

  const next = () => {
    if (i + 1 < items.length) setI(i + 1)
    else onDone({ score, total: items.length, note: '一次拼对才算分', missed: missed.current })
  }

  return (
    <>
      <div className="bar">
        <div style={{ width: (i / items.length) * 100 + '%' }} />
      </div>
      <div className="prompt">
        <div className="ask">听读音，按书写顺序拼出这个音节</div>
        <button className="play-big small-play" onClick={() => it.audio && play(it.audio)}>
          ▶
        </button>
        <div className="latin-big tap" onClick={() => it.audio && play(it.audio)}>{it.wylie}</div>
      </div>
      <div className="slots">
        {parts.map((p, k) => (
          <div key={k} className={'slot' + (k < filled ? ' filled' : k === filled ? ' next' : '') + (p.role === '基字' ? ' root' : '')}>
            <div className="tib">{k < filled ? showCh(p.ch) : ' '}</div>
            <div className="small">{p.role}</div>
          </div>
        ))}
      </div>
      {!complete && (
        <div className="tiles">
          {tiles.map((t, k) => (
            <button key={k} className={'opt tib' + (used.has(k) ? ' dim' : '') + (shake === k ? ' wrong shake' : '')} disabled={used.has(k)} onClick={() => tap(k)}>
              {showCh(t)}
            </button>
          ))}
        </div>
      )}
      {complete && (
        <div className={'feedback ' + (erred ? 'bad' : 'ok')}>
          <div className="tib huge tap" onClick={() => it.audio && play(it.audio)}>{it.tib}</div>
          <div>{rootReason(sylOf(it.tib))}</div>
          <button className="primary" onClick={next}>
            继续
          </button>
        </div>
      )}
    </>
  )
}

/** 词义连连看：左边藏文词，右边中文。记入掌握度。 */
function Words({ items, onDone }: { items: Item[]; onDone: (r: Result) => void }) {
  const [right] = useState(() => shuffle(items.map((it) => it.gloss!)))
  const [sel, setSel] = useState<number | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [bad, setBad] = useState<string | null>(null)
  const errs = useRef<Set<number>>(new Set())

  const pickZh = (zh: string) => {
    if (sel === null) return
    const it = items[sel]
    if (it.gloss === zh) {
      const d = new Set(done).add(sel)
      setDone(d)
      setSel(null)
      void recordAnswer(it.kc, !errs.current.has(sel), undefined, 'game')
      if (d.size === items.length) {
        const missed = [...errs.current].map((k) => items[k])
        setTimeout(() => onDone({ score: items.length - missed.length, total: items.length, note: '一次连对才算分', missed }), 600)
      }
    } else {
      errs.current.add(sel)
      setBad(zh)
      setTimeout(() => setBad(null), 400)
    }
  }

  return (
    <>
      <p className="ask center">先点藏文词，再点它的意思</p>
      <div className="match">
        <div className="col">
          {items.map((it, k) => (
            <button key={k} className={'opt' + (done.has(k) ? ' right' : sel === k ? ' sel' : '')} disabled={done.has(k)} onClick={() => {
                setSel(k)
                if (it.audio) play(it.audio)
              }}>
              <span className="tib">{it.tib}</span>
              <span className="w small muted">{it.wylie}</span>
            </button>
          ))}
        </div>
        <div className="col">
          {right.map((zh) => {
            const isDone = items.some((it, k) => done.has(k) && it.gloss === zh)
            return (
              <button key={zh} className={'opt' + (isDone ? ' right' : bad === zh ? ' wrong shake' : '')} disabled={isDone} onClick={() => pickZh(zh)}>
                {zh}
              </button>
            )
          })}
        </div>
      </div>
      <p className="small muted center">释义来自常用词表，尚未人工审校。</p>
    </>
  )
}

/** 找基字连击：答错就结束，挑战最高纪录。不限时，记入掌握度。 */
function Root({ items, onDone }: { items: Item[]; onDone: (r: Result) => void }) {
  const [i, setI] = useState(0)
  const [wrong, setWrong] = useState<number | null>(null)
  const [best, setBest] = useState(0)
  useEffect(() => {
    db.settings.get('best-root').then((r) => setBest(Number(r?.value ?? 0)))
  }, [])
  const it = items[i % items.length]
  const s = sylOf(it.tib)
  const parts = partsOf(s)

  const tap = async (k: number) => {
    if (wrong !== null) return
    const ok = parts[k].role === '基字'
    void recordAnswer(it.kc, ok, undefined, 'game')
    if (it.audio) play(it.audio)
    if (ok) return setI(i + 1)
    setWrong(k)
    if (i > best) await db.settings.put({ key: 'best-root', value: i })
  }

  const end = () =>
    onDone({ score: i, total: i + 1, note: i > best ? `新纪录！之前最好 ${best} 连击` : `最高纪录 ${best} 连击`, missed: [it] })

  return (
    <>
      <div className="quiz-top">
        <span className="combo">连击 {i}</span>
        <span className="small muted">最高 {Math.max(best, i)}</span>
      </div>
      <div className="prompt">
        <div className="ask">基字是哪个？</div>
        <div className="tib huge tap" onClick={() => it.audio && play(it.audio)}>{it.tib}</div>
        <div className="latin">{it.wylie}</div>
      </div>
      <div className="options row">
        {parts.map((p, k) => (
          <button key={k} className={'opt tib' + (wrong === null ? '' : p.role === '基字' ? ' right' : k === wrong ? ' wrong' : ' dim')} onClick={() => tap(k)}>
            {p.ch}
          </button>
        ))}
      </div>
      {wrong !== null && (
        <div className="feedback bad">
          <div className="fb-title">连击结束：{i}</div>
          <div>{rootReason(s)}</div>
          <button className="primary" onClick={end}>
            看结果
          </button>
        </div>
      )}
    </>
  )
}

/** 听音打地鼠：60 秒，听读音点中对应的词。限时，不记入掌握度。 */
function Whack({ items, onDone }: { items: Item[]; onDone: (r: Result) => void }) {
  const [left, setLeft] = useState(60)
  const [round, setRound] = useState(0)
  const [holes, setHoles] = useState<(Item | null)[]>(Array(9).fill(null))
  const [target, setTarget] = useState<Item | null>(null)
  const [score, setScore] = useState(0)
  const [hit, setHit] = useState<number | null>(null)
  const [miss, setMiss] = useState<number | null>(null)
  const missed = useRef<Item[]>([])
  const shots = useRef(0)
  const ended = useRef(false)

  // 每轮：随机 3–4 个洞冒出词，其中一个是要听的
  useEffect(() => {
    if (left <= 0) return
    const t = pick(items, 1)[0]
    const others = pick(items.filter((x) => x.kc !== t.kc), round < 5 ? 2 : 3)
    const spots = pick([...Array(9).keys()], others.length + 1)
    const h: (Item | null)[] = Array(9).fill(null)
    ;[t, ...others].forEach((x, k) => (h[spots[k]] = x))
    setHoles(h)
    setTarget(t)
    setHit(null)
    setMiss(null)
    if (t.audio) play(t.audio)
    // 越往后缩回得越快
    const stay = Math.max(2200, 4000 - round * 150)
    const timer = setTimeout(() => {
      shots.current++
      missed.current.push(t)
      setRound((r) => r + 1)
    }, stay)
    return () => clearTimeout(timer)
  }, [round])

  useEffect(() => {
    if (left <= 0) {
      if (!ended.current) {
        ended.current = true
        onDone({ score, total: shots.current, note: '听到读音就点', missed: [...new Map(missed.current.map((m) => [m.kc, m])).values()].slice(0, 8) })
      }
      return
    }
    const t = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(t)
  }, [left, score, onDone])

  const tap = (k: number) => {
    const x = holes[k]
    if (!x || !target || hit !== null || left <= 0) return
    if (x.kc === target.kc) {
      setHit(k)
      setScore(score + 1)
      shots.current++
      setTimeout(() => setRound((r) => r + 1), 350)
    } else {
      if (x.audio) play(x.audio)
      setMiss(k)
      setTimeout(() => setMiss(null), 300)
    }
  }

  return (
    <>
      <div className="quiz-top">
        <span className={'timer' + (left <= 10 ? ' low' : '')}>{left}s</span>
        <span>得分 {score}</span>
        <button className="link" onClick={() => target?.audio && play(target.audio)}>
          ▶ 再听
        </button>
      </div>
      <div className="whack">
        {holes.map((x, k) => (
          <button key={k + '-' + round} className={'hole' + (x ? ' up' : '') + (hit === k ? ' hit' : '') + (miss === k ? ' wrong shake' : '')} onClick={() => tap(k)}>
            {x && <span className="tib">{x.tib}</span>}
          </button>
        ))}
      </div>
    </>
  )
}

/** 周日大杂烩：本周答错过的内容，每个出一道选择题。记入掌握度。 */
function Mix({ items, onDone }: { items: Item[]; onDone: (r: Result) => void }) {
  const [i, setI] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [score, setScore] = useState(0)
  const missed = useRef<Item[]>([])
  const it = items[i]
  const isWord = it.kc.startsWith('W:')
  const answer = isWord ? it.gloss! : it.wylie
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    const pool = items.filter((x) => x.kc !== items[i].kc).map((x) => (items[i].kc.startsWith('W:') ? x.gloss ?? '' : x.wylie)).filter(Boolean)
    const fill = items[i].kc.startsWith('W:') ? words.map((w) => w.gloss) : [...syllableMap.values()].map((s) => s.wylie)
    const right = items[i].kc.startsWith('W:') ? items[i].gloss! : items[i].wylie
    const wrong = [...new Set([...shuffle(pool), ...shuffle(fill)])].filter((x) => x !== right).slice(0, 3)
    setOptions(shuffle([right, ...wrong]))
    if (items[i].audio) play(items[i].audio!)
  }, [i, items])

  const choose = (o: string) => {
    if (chosen) return
    setChosen(o)
    const ok = o === answer
    if (ok && it.audio) play(it.audio)
    else say(o)
    if (ok) setScore(score + 1)
    else missed.current.push(it)
    void recordAnswer(it.kc, ok, undefined, 'game')
  }
  const next = () => {
    setChosen(null)
    if (i + 1 < items.length) setI(i + 1)
    else onDone({ score, total: items.length, note: '这周的错题都过了一遍', missed: missed.current })
  }

  return (
    <>
      <div className="bar">
        <div style={{ width: (i / items.length) * 100 + '%' }} />
      </div>
      <div className="prompt">
        <div className="ask">{isWord ? '这个词是什么意思？' : '这个怎么读？'}</div>
        <div className="tib huge tap" onClick={() => it.audio && play(it.audio)}>{it.tib}</div>
      </div>
      <div className="options">
        {options.map((o) => (
          <button key={o} className={'opt' + (isWord ? '' : ' latin') + (chosen === null ? '' : o === answer ? ' right' : o === chosen ? ' wrong' : ' dim')} onClick={() => choose(o)}>
            {o}
          </button>
        ))}
      </div>
      {chosen && (
        <button className="primary" onClick={next}>
          继续
        </button>
      )}
    </>
  )
}
