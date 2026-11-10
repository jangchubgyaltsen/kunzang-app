import { audioFor, say } from './sound.ts'
import { yitongOf } from './reading.ts'
import { PRON } from './pron.ts'

const label = (t: string) => (PRON[t] ? PRON[t].join(' ') : yitongOf(t))

// “注音怎么读”：App 里的注音是安多话的类拼音（沿用《安多藏语一本通》的写法），按汉语拼音读，
// 下面几条是和拼音不一样、要专门记的地方。例子能点就点着听录音。
const ROWS: [string, string, string[]][] = [
  ['按汉语拼音读', 'b d g 不送气，p t k 送气，j q x、z c s、zh ch 都和普通话一样。', ['པ', 'ཕ', 'ཅ', 'ཆ', 'ཙ', 'ཚ']],
  ['·浊', '字母 ཀ/ག、ཏ/ད 这类，书上注音一样，汉字后加“·浊”的那个声音低沉一些、带一点气。听录音对比。', ['ཀ', 'ག', 'ཏ', 'ད']],
  ['结尾 f', '后加字 བ：嘴唇闭上就停，不发出声来。', ['རབ', 'ཐོབ', 'ཟབ']],
  ['结尾 r', '后加字 ར：舌尖轻轻往上卷一下。', ['ནོར', 'ཟེར', 'མཐར']],
  ['结尾 m n ng', '后加字 མ ན ང：和拼音一样，m 要闭嘴。', ['གསུམ', 'དོན', 'དང']],
  ['ག ད ས ལ 结尾', '不单独读出来，只是把前面的元音变了：ལས lei、མེད mai、ཐུགས tou、ཞལ xie。', ['ལས', 'མེད', 'ཐུགས', 'ཞལ']],
  ['前加字、上加字', '注音里大多不写。安多话里它们常在声母前带一个很轻的 h、r 或 n（如 སྐ、རྒ、འགྲོ），跟着录音模仿就行。', ['སྐད', 'དགའ', 'འགྲོ']],
  ['…ai / …ei 结尾的 འི', '词尾的 འི 把读音变成 -i：བླ་མའི la mai。', ['བླ་མའི', 'པའི']],
]

export default function PronGuide() {
  return (
    <details className="pron-guide">
      <summary>注音怎么读</summary>
      <p className="small muted">
        App 里藏文下面的小字是安多话的<strong>类拼音</strong>注音，不用 Wylie 转写。字母和“字母 + 元音”照《安多藏语一本通》写，其余音节按规律推出来，没有逐个核对，和录音不一样时以录音为准。和普通话拼音不同的只有这几处：
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
