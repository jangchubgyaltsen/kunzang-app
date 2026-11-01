/** 线条图标（一套，24×24，描边）。代替 emoji 和文字符号。 */
const P: Record<string, string> = {
  today: 'M4 20V10l8-6 8 6v10h-5v-6H9v6z',
  path: 'M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  book: 'M4 5.5c3-1.3 5.5-1.3 8 .5 2.5-1.8 5-1.8 8-.5V19c-3-1.3-5.5-1.3-8 .5-2.5-1.8-5-1.8-8-.5zM12 6v13.5',
  library: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  me: 'M15.6 8.5a3.6 3.6 0 1 1-7.2 0 3.6 3.6 0 0 1 7.2 0zM5 20c.8-3.8 3.6-5.6 7-5.6s6.2 1.8 7 5.6',
  lock: 'M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2zM8 11V8a4 4 0 0 1 8 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  chevron: 'M9 6l6 6-6 6',
  down: 'M6 9l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  stop: 'M7 7h10v10H7z',
}

export function Icon({ name, size = 22, className }: { name: keyof typeof P | 'play' | 'pathDots'; size?: number; className?: string }) {
  if (name === 'play')
    return (
      <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
      </svg>
    )
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === 'path' && (
        <>
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
        </>
      )}
      <path d={P[name === 'pathDots' ? 'path' : name]} />
    </svg>
  )
}

/** 列表里每一行左边的状态：做完（实心勾）、现在（圆点）、没做（空圈）、锁住 */
export function StateDot({ state }: { state: 'done' | 'now' | 'todo' | 'lock' | 'fail' }) {
  if (state === 'lock') return <span className="sdot lock"><Icon name="lock" size={16} /></span>
  return <span className={'sdot ' + state}>{state === 'done' && <Icon name="check" size={14} />}</span>
}
