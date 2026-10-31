import { useEffect, useState } from 'react'
import { syllableMap } from './content.ts'
import { db } from './db.ts'
import { play } from './audio.ts'
import { AUSPICIOUS, GAMES, availableGames, dayKey, learnedPool, lineOfDay, planToday, streakInfo, type GameKind } from './daily.ts'

type Info = Awaited<ReturnType<typeof streakInfo>>

/** 首页顶部的「今日」卡片：今日一句、今日游戏、签到天数。 */
export default function Today({ onPlay }: { onPlay: (kind: GameKind | undefined, daily: boolean) => void }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [game, setGame] = useState<GameKind | null>(null)
  const [others, setOthers] = useState<GameKind[]>([])
  const [showCal, setShowCal] = useState(false)
  const [showHall, setShowHall] = useState(false)
  const [zh, setZh] = useState<string | null>(null)
  const { passage, line, i } = lineOfDay()

  useEffect(() => {
    streakInfo().then(setInfo)
    planToday().then((p) => setGame(p.game))
    learnedPool().then((p) => setOthers(availableGames(p)))
    db.translations.get(passage.id).then((t) => {
      const parts = (t?.chinese ?? '').split(/(?<=[，。！])/).filter(Boolean)
      setZh(parts.length === passage.lines.length ? parts[i] : null)
    })
  }, [passage, i])

  return (
    <div className="today">
      <div className="today-head">
        <div>
          <div className="today-date">{new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</div>
          {info && (
            <button className="link small" onClick={() => setShowCal(!showCal)}>
              已连续 {info.streak} 天 · 累计 {info.total} 天 {showCal ? '▴' : '▾'}
            </button>
          )}
        </div>
        <div className={'seal' + (info?.today ? ' on' : '')}>{info?.today ? '已签' : '未签'}</div>
      </div>
      {showCal && info && <Calendar done={info.done} rest={info.rest} />}
      {showCal && info && (
        <div>
          <div className="small muted">八吉祥 · 累计签到点亮</div>
          <div className="badges">
            {AUSPICIOUS.map(([n, name]) => (
              <span key={n} className={'badge' + (info.total >= n ? ' on' : '')} title={`累计 ${n} 天`}>
                {info.total >= n ? name : `${n} 天`}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="today-line">
        <div className="small muted">今日一句</div>
        <div className="line-row">
          <button className="play" onClick={() => play(line.audio)} aria-label="播放这一句">
            ▶
          </button>
          <div className="syls">
            {line.syllables.map((s, j) => (
              <span key={j} className="syl" onClick={() => syllableMap.get(s) && play(syllableMap.get(s)!.audio)}>
                <span className="tib">
                  {s}
                  {j < line.syllables.length - 1 ? '་' : ''}
                </span>
                <span className="syl-wylie">{syllableMap.get(s)?.wylie ?? ''}</span>
              </span>
            ))}
          </div>
        </div>
        {zh && <div className="zh">{zh}</div>}
      </div>

      {game && (
        <button className="primary today-go" onClick={() => onPlay(undefined, true)}>
          今日游戏：{GAMES[game].name}
          <span className="small">{info?.today ? '今天已签到，可以再玩' : GAMES[game].desc + ' · 玩完即签到'}</span>
        </button>
      )}
      {info?.today && others.length > 1 && (
        <button className="link small" onClick={() => setShowHall(!showHall)}>
          {showHall ? '收起' : '换个游戏玩'}
        </button>
      )}
      {showHall && (
        <div className="hall">
          {others.map((g) => (
            <button key={g} onClick={() => onPlay(g, false)}>
              <b>{GAMES[g].name}</b>
              <span className="small muted">{GAMES[g].desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Calendar({ done, rest }: { done: Set<string>; rest: Set<string> }) {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), 1)
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, k) => new Date(now.getFullYear(), now.getMonth(), k + 1))]
  return (
    <div className="cal">
      <div className="cal-title small muted">{now.getMonth() + 1} 月 · 空心圈是休息日（每周可以歇一天）</div>
      <div className="cal-grid">
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
          <div key={w} className="cal-w small muted">
            {w}
          </div>
        ))}
        {cells.map((d, k) =>
          d ? (
            <div key={k} className={'cal-d' + (done.has(dayKey(d)) ? ' done' : rest.has(dayKey(d)) ? ' rest' : '') + (dayKey(d) === dayKey(now) ? ' now' : '')}>
              {d.getDate()}
            </div>
          ) : (
            <div key={k} />
          ),
        )}
      </div>
    </div>
  )
}
