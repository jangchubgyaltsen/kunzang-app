import { audioFor, say } from './sound.ts'
import { yitongOf } from './reading.ts'
import { PRON } from './pron.ts'

const label = (t: string) => (PRON[t] ? PRON[t].join(' ') : yitongOf(t))

// “注音怎么读”：App 里的注音是安多拼音（amdoPron.ts）：按安多话的实际读音、用汉语拼音字母写。
// 下面几条是和普通话拼音不一样、要专门记的地方。例子能点就点着听录音。
const ROWS: [string, string, string[]][] = [
  ['声母按拼音读', 'b d g z j zh 不送气，p t k c q ch 送气。安多话没有声调，不用管几声。ཀ/ག、ཏ/ད 这几对注音一样，汉字后加“·浊”的那个带一点气，听录音对比。', ['པ', 'ཕ', 'ཀ', 'ག']],
  ['e 和 ê', 'e 是拼音的 e（“的”的韵母），ི ུ 都读它；ê 是“欸”，ེ 读它。', ['མི', 'མེ', 'ཀུ', 'ཀེ']],
  ['小上标 ʰ', '前加字 ག ད བ、上加字 ར ལ ས 读成声母前一个很轻的 h（有的地方像 r）。后面是 g d b j z 时要读成真正的浊音。', ['སྐར', 'དགའ', 'རྒྱལ']],
  ['小上标 ⁿ', '前加字 འ མ 读成声母前一个很轻的 n 或 m，像“嗯”一带而过。', ['འགྲོ', 'མཚོ', 'འབྲུག']],
  ['结尾 k p l', '后加字 ག བ ད 要读出来，但很短，嘴摆好位置就停，不爆开。', ['ཐུགས', 'ཐོབ', 'མེད']],
  ['结尾 r m n ng', '后加字 ར 舌尖轻卷，མ 闭嘴，ན ང 和拼音一样。', ['ནོར', 'གསུམ', 'དོན', 'དང']],
  ['ལ ས 结尾', '不读出来，只把元音变了：ལས lê、ཞལ xia、ཆོས qê、ཡུལ yu。', ['ལས', 'ཞལ', 'ཆོས']],
  ['几个特别的声母', 'པྱ ཕྱ བྱ 读 x（不是 ch）；ལྷ 写 lh，舌头放在 l 的位置往外吹气；དབ དཔ 读 hw；下加 ར 读 zh、ch。', ['བྱ', 'ལྷ', 'དབང', 'ཁྲིད']],
]

export default function PronGuide() {
  return (
    <details className="pron-guide">
      <summary>注音怎么读</summary>
      <p className="small muted">
        App 里藏文下面的小字是<strong>安多拼音</strong>：按安多话的实际读音、用汉语拼音字母写，不用 Wylie 转写。规律参考了安多话的语言学研究和夏河、泽库两地的词表，按规律推出来，没有逐个核对，和录音不一样时以录音为准。和普通话拼音不同的只有这几处：
      </p>
      <dl>
        {ROWS.map(([k, v, ex]) => (
          <div key={k} className="pg-row">
            <dt>{k}</dt>
            <dd>
              {v}
              <span className="pg-ex">
                {ex.map((t) => (
                  <button key={t} className={'pg-chip' + (audioFor(t) ? ' tap' : '')} onClick={() => say(t)}>
                    <span className="tib">{t}</span> <span className="pron">{label(t)}</span>
                  </button>
                ))}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}
