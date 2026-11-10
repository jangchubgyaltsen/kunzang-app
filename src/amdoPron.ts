// 安多拼音：按安多话的实际读音、用汉语拼音字母给任意一个藏文音节注音，不用 Wylie。
//
// 依据：宋国明《Colloquial Amdo Tibetan》第 2 课（声母、加字的读法）、Green 2012（前置辅音和清浊）、
// 《A Phonological History of Amdo Tibetan Rhymes》（韵母），并用孙宏开《藏缅语语音和词汇》里
// 夏河、泽库两点的词表核对过（scripts/check-pron.py）。调研见项目文档“安多读音注音方案调研”。
//
// 写法：
//   声母和汉语拼音同音：b d g z j zh 不送气，p t k c q ch 送气；x s sh h；m n ny ng l r y w；lh 清边音；hw。
//   前加字、上加字读成声母前一个很轻的音，用小号上标：ʰ（ག ད བ 前加字，ར ལ ས 上加字）、ⁿ（འ མ 前加字）。
//   韵母：e 是拼音 e（“的”的韵母，ི ུ 开音节都读它），ê 是“欸”（ེ）；后加字 ག བ ད 读 -k -p -l，
//   ར 读 -r，ང ན མ 和拼音一样，ལ ས 不读、只改元音。
//   ོ 开音节写 o（夏河、泽库都读 o；《一本通》有几个写 u，待听阿坝录音确认）。

const ROOTS = 'ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ'
const VOWEL_MARKS = 'ིེོུ'
/** 下加字（U+0F90–0FBC 是叠在下面的字母）还原成普通字母 */
const sub2base = (c: string) => String.fromCharCode(c.charCodeAt(0) - 0x50)
const isSub = (c: string) => c >= 'ྐ' && c <= 'ྼ'

type Stack = { base: string; subs: string[]; vowel?: string }

function stacksOf(syl: string): Stack[] | undefined {
  const out: Stack[] = []
  for (const c of syl) {
    if (ROOTS.includes(c)) out.push({ base: c, subs: [] })
    else if (isSub(c) && out.length) out[out.length - 1].subs.push(sub2base(c))
    else if (VOWEL_MARKS.includes(c) && out.length && !out[out.length - 1].vowel) out[out.length - 1].vowel = c
    else return // 梵文字、长元音等，不推
  }
  return out.length ? out : undefined
}

export type Parsed = { prefix?: string; super?: string; root: string; subs: string[]; vowel: string; suffix?: string; post?: string; ai?: boolean; u?: boolean }

const PREFIXES = 'གདབམའ'
const SUPERS = 'རལས'

/** 拆音节：前加字、上加字、基字、下加字、元音、后加字、再后加字；结尾的 འི 单独标出来 */
export function parseSyllable(syl: string): Parsed | undefined {
  // 梵文音译：反写字母换成普通字母，长音号、送气号不管，ཾ 当后加字 མ
  let s = syl
    .replace(/[་།༔\sཱཿ]/g, '')
    .replace(/[ཊཋཌཎཥྚྛྜྞྵ]/g, (c) => 'ཏཐདནཤྟྠྡྣྴ'['ཊཋཌཎཥྚྛྜྞྵ'.indexOf(c)])
    .replace(/[ཾྃ]/g, 'མ')
    .replace(/ཻ/g, 'ེ')
    .replace(/ཽ/g, 'ོ')
    .replace(/ྀ/g, 'ི')
  let ai = false, u = false
  if (s.length > 2 && s.endsWith('འུ')) {
    u = true
    s = s.slice(0, -2)
  }
  if (s.length > 2 && s.endsWith('འི')) {
    ai = true
    s = s.slice(0, -2)
  } else if (s.length > 1 && s.endsWith('འོ') && s !== 'འོ') s = s.slice(0, -2) // 句尾的 འོ 不影响读音，按前面的读
  const st = stacksOf(s)
  if (!st) return
  let ri = st.findIndex((x) => x.vowel || x.subs.length)
  if (ri < 0) {
    if (st.length <= 2) ri = 0
    // 三个字母：头一个是前加字就算第二个是基字；但 གངས、བབས 这种（中间是 ང ག བ མ、最后是 ས）基字是第一个
    else if (st.length === 3) ri = PREFIXES.includes(st[0].base) && !(st[2].base === 'ས' && 'ངགབམ'.includes(st[1].base)) ? 1 : 0
    else ri = 1
  }
  if (ri > 1) return
  const rootSt = st[ri]
  let sup: string | undefined, root = rootSt.base, subs = rootSt.subs
  if (subs.length && SUPERS.includes(root) && !'ཡརལཝ'.includes(subs[0])) {
    sup = root
    root = subs[0]
    subs = subs.slice(1)
  }
  const rest = st.slice(ri + 1)
  if (rest.length > 2 || rest.some((x) => x.vowel || x.subs.length)) return
  return {
    prefix: ri === 1 ? st[0].base : undefined,
    super: sup,
    root,
    subs: subs.filter((c) => c !== 'ཝ'),
    vowel: rootSt.vowel ?? '',
    suffix: rest[0]?.base,
    post: rest[1]?.base,
    ai,
    u,
  }
}


type Cls = 'plain' | 'pal' | 'zero'
/** 声母：[前置音, 声母, 类别] */
function initialOf(p: Parsed): [string, string, Cls] {
  const { root, subs, prefix, super: sup } = p
  const sub = subs[0]
  let pre = prefix && 'འམ'.includes(prefix) ? 'ⁿ' : prefix || sup ? 'ʰ' : ''
  const palatal = (c: string): [string, string, Cls] => [pre, c, 'pal']
  if ((prefix === 'ད' || prefix === 'ག') && 'བཔ'.includes(root) && !sub && !sup) return ['', 'hw', 'plain'] // དབང hwang、དཔལ hwa
  if (root === 'ཧ' && sup === 'ལ') return ['', 'lh', 'plain'] // ལྷ
  if (sub === 'ཡ') {
    if ('ཀག'.includes(root)) return palatal('j')
    if (root === 'ཁ') return palatal('q')
    if ('པཕབ'.includes(root)) return prefix === 'ད' || prefix === 'ག' ? ['ʰ', 'y', 'pal'] : prefix === 'འ' ? ['ⁿ', 'j', 'pal'] : palatal('x')
    if (root === 'མ') return palatal('ny')
  }
  if (sub === 'ར') {
    if ('ཁཐཕ'.includes(root)) return [pre, 'ch', 'plain']
    if ('ཀཏཔགདབ'.includes(root)) return [pre, 'zh', 'plain']
    if ('སཤཧ'.includes(root)) return [pre, 'sh', 'plain']
    if (root === 'མ') return [pre, 'm', 'plain']
  }
  if (sub === 'ལ') {
    if (root === 'ཟ') return ['ʰ', 'd', 'plain'] // ཟླ hda
    if (root === 'ས') return ['', 'lh', 'plain'] // སླ
    return ['ʰ', 'l', 'plain'] // ཀླ གླ བླ རླ：基字本身读成前面的轻音
  }
  const B: Record<string, string> = {
    ཀ: 'g', ཁ: 'k', ག: 'g', ང: 'ng', ཅ: 'j', ཆ: 'q', ཇ: 'j', ཉ: 'ny', ཏ: 'd', ཐ: 't', ད: 'd', ན: 'n',
    པ: 'b', ཕ: 'p', བ: pre ? 'b' : 'w', མ: 'm', ཙ: 'z', ཚ: 'c', ཛ: 'z', ཝ: 'w', ཞ: 'x', ཟ: 's', འ: '',
    ཡ: 'y', ར: 'r', ལ: 'l', ཤ: 'x', ས: 's', ཧ: 'h', ཨ: '',
  }
  const c = B[root]
  if (c === '') return [pre, '', 'zero']
  return [pre, c, 'ཅཆཇཉཞཤཡ'.includes(root) ? 'pal' : 'plain']
}

/** 韵母，按“元音 + 后加字”（夏河的读法） */
const RHYMES: Record<string, Record<string, string>> = {
  a: { '': 'a', ག: 'ak', ང: 'ang', ད: 'al', ན: 'an', བ: 'ap', མ: 'am', ར: 'ar', ལ: 'a', ས: 'ê' },
  'ི': { '': 'e', ག: 'ek', ང: 'ang', ད: 'e', ན: 'en', བ: 'ep', མ: 'em', ར: 'er', ལ: 'i', ས: 'i' },
  'ུ': { '': 'e', ག: 'ek', ང: 'ong', ད: 'e', ན: 'en', བ: 'ep', མ: 'em', ར: 'er', ལ: 'u', ས: 'i' },
  'ེ': { '': 'ê', ག: 'êk', ང: 'ang', ད: 'êl', ན: 'ên', བ: 'êp', མ: 'êm', ར: 'êr', ལ: 'i', ས: 'i' },
  'ོ': { '': 'o', ག: 'ok', ང: 'ong', ད: 'ol', ན: 'on', བ: 'op', མ: 'om', ར: 'or', ལ: 'u', ས: 'ê' },
}

/** 声母和韵母拼起来，按拼音习惯调整：j q x 后 a 类韵母加 i、e 写 i、ê 写 ie */
function join(c: string, cls: Cls, r: string) {
  if (cls === 'pal') {
    if (c === 'y') {
      if (r === 'e') return 'yi'
      if (r === 'ê') return 'ye'
      return 'y' + r
    }
    if (c === 'ny') {
      if (r === 'e' || r === 'i') return 'ni'
      if (r === 'ê') return 'nie'
      return (r.startsWith('a') ? 'ni' : 'ny') + r
    }
    if (r === 'e') return c + 'i'
    if (r === 'ê') return c + 'ie'
    if (r.startsWith('a')) return c + 'i' + r
    return c + r
  }
  if (cls === 'zero') return r
  if (c === 'hw' && r === 'u') return 'hu'
  return c + r
}

/** 一个音节的安多拼音；推不出来（梵文音译等）返回 undefined */
export function amdoPinyin(syl: string): string | undefined {
  const p = parseSyllable(syl)
  if (!p || !ROOTS.includes(p.root)) return
  const [pre, c, cls] = initialOf(p)
  const suf = p.suffix === 'འ' ? '' : p.suffix ?? ''
  const r = RHYMES[p.vowel || 'a'][suf]
  if (r === undefined) return
  let out = join(c, cls, r)
  if (p.ai) out = /[ae]$/.test(out) && !out.endsWith('ie') ? out.replace(/ê$/, 'e') + 'i' : out.endsWith('i') ? out : out + 'i'
  if (p.u) out += 'u'
  return pre + out
}

/** 常见梵文音译词，规律推不出来，单独写 */
const SPECIAL: Record<string, string> = { 'མཎྜལ': 'man da la', 'པདྨ': 'bê ma', 'པདྨེ': 'bê mê', 'པཎྜི': 'ben di', 'པཎྜི་ཏ': 'ben di da', 'ཤཱཀྱ': 'xia ja', 'ཨོཾ': 'om', 'ཧཱུྃ': 'hum', 'ཧཱུཾ': 'hum', 'ཨཱཿ': 'a' }

/** 一个词（音节用 ་ 隔开）的注音；有一个音节推不出来就整体不给 */
export function amdoPinyinOfWord(word: string): string | undefined {
  const w = word.replace(/[་།\s]+$/, '')
  if (SPECIAL[w]) return SPECIAL[w]
  const parts = w.split('་').filter(Boolean).map((s) => SPECIAL[s] ?? amdoPinyin(s))
  return parts.length && parts.every(Boolean) ? parts.join(' ') : undefined
}
