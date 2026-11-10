// 安多话类拼音注音：给任意一个藏文音节按规律推出一个“像汉语拼音”的读法，不用 Wylie。
//
// 写法沿用《安多藏语一本通》：字母和“字母 + 元音”直接用 pron.ts 里的表（ཀ ga、ཀི ge、གོ gu……），
// 带加字的音节先把声母换成和它读音一样的单个字母（ཀྱ → ཅ j、ཁྲ → ch、སྐ → ཀ g……），
// 再按元音和后加字配韵母。规律是对照开篇已有的注音和教材录音整理的，没有逐个核对，以录音为准。
//
// 和拼音不同、需要记的只有几处（App 里“注音怎么读”有说明）：
//   结尾 f：后加字 བ，嘴唇闭上就停，不送气（རབ raf）。
//   结尾 r：后加字 ར，舌尖轻轻卷一下（ནོར nor）。
//   结尾 m、n、ng 和拼音一样；后加字 ག ད ས 不单独读，只改变前面的元音（ལས lei、མེད mai）。
//   前加字、上加字大多不写出来：安多话里它们常在声母前带一个很轻的 h/r/n，听录音模仿。

import { CV_PRON, PRON } from './pron.ts'

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

type Cls = 'plain' | 'pal' | 'retro' | 'zero'
/** 声母：[拼音, 类别, 读音相同的单个字母（有的话，开音节直接查表）] */
function initialOf(p: Parsed): [string, Cls, string?] {
  const { root, subs, prefix, super: sup } = p
  const sub = subs[0]
  if ((prefix === 'ད' || prefix === 'ག') && (root === 'ཡ' || (root === 'བ' && sub === 'ཡ'))) return ['y', 'pal', 'ཡ'] // དབྱིངས yang
  if (sup === 'ལ' && root === 'ཧ') return ['l', 'plain', 'ལ'] // ལྷ la
  if (sub === 'ཡ') {
    if ('ཀཔ'.includes(root)) return ['j', 'pal', 'ཅ']
    if ('ཁཕ'.includes(root)) return ['q', 'pal', 'ཆ']
    if (root === 'ག') return ['j', 'pal', 'ཇ']
    if (root === 'བ') return ['ch', 'retro'] // བྱ cha，开篇注音这样写
    if (root === 'མ') return ['n', 'pal', 'ཉ']
  }
  if (sub === 'ར') {
    if ('ཁཐཕ'.includes(root)) return ['ch', 'retro']
    if ('ཀཏཔགདབ'.includes(root)) return ['zh', 'retro']
    if (root === 'ས') return ['s', 'plain', 'ས']
    if (root === 'ཤ' || root === 'ཧ') return ['x', 'pal', 'ཤ']
    if (root === 'མ') return ['m', 'plain', 'མ']
  }
  if (sub === 'ལ') return root === 'ཟ' ? ['d', 'plain', 'ད'] : ['l', 'plain', 'ལ']
  // དབ、དཔ：读成 hu（དབང huang、དཔལ huai）
  if ((prefix === 'ད' || prefix === 'ག') && 'བཔ'.includes(root) && !sup) return ['hu', 'plain']
  const eq = root === 'བ' && (prefix || sup) ? 'པ' : root
  if (root === 'ཉ') return ['n', 'pal', 'ཉ']
  const py = PRON[eq][0].replace(/a$/, '')
  if (root === 'འ' || root === 'ཨ') return ['', 'zero', eq]
  if ('ཅཆཇཞཤཡ'.includes(root)) return [py.replace(/i$/, ''), 'pal', eq]
  return [py, 'plain', eq]
}

/** 韵母（不带声母），按“元音 + 后加字”查 */
const FINALS: Record<string, Record<string, string>> = {
  a: { '': 'a', 'འ': 'a', 'ག': 'a', 'ང': 'ang', 'ད': 'ai', 'ན': 'an', 'བ': 'af', 'མ': 'am', 'ར': 'ar', 'ལ': 'ai', 'ས': 'ei' },
  'ི': { 'ང': 'ang', 'ན': 'in', 'བ': 'if', 'མ': 'im', 'ར': 'ir' },
  'ུ': { 'ག': 'ou', 'ང': 'ong', 'ན': 'un', 'བ': 'uf', 'མ': 'um', 'ར': 'ur', 'ལ': 'ai' },
  'ེ': { 'ག': 'ai', 'ང': 'eng', 'ད': 'ai', 'ན': 'an', 'བ': 'ef', 'མ': 'em', 'ར': 'er', 'ལ': 'ai', 'ས': 'ei' },
  'ོ': { 'ག': 'u', 'ང': 'ong', 'ད': 'ao', 'ན': 'un', 'བ': 'uf', 'མ': 'om', 'ར': 'or', 'ལ': 'ai', 'ས': 'ei' },
}
/** 卷舌声母（zh ch）后面的开音节 */
const RETRO_OPEN: Record<string, string> = { '': 'a', 'ི': 'i', 'ུ': 'u', 'ེ': 'ai', 'ོ': 'uo' }

/** 舌面音（j q x y n+i）后面 a 类韵母加 i */
function palatalize(fin: string) {
  if (fin === 'ai') return 'ie'
  if (fin.startsWith('a')) return 'i' + fin
  return fin
}

function join(ini: string, cls: Cls, fin: string) {
  if (cls === 'pal') {
    fin = palatalize(fin)
    if (ini === 'y') return 'y' + fin.replace(/^i(?=[aeo])/, '')
    if (ini === 'n') return fin.startsWith('i') ? 'n' + fin : 'ny' + fin
  }
  if (cls === 'zero' && fin === 'ou') return 'ou'
  if (ini === 'hu') return ('hu' + fin).replace(/^huu/, 'hu').replace(/^hue(i|$)/, 'hui')
  return ini + fin
}

/** 开音节（没有后加字）：能换成单个字母的直接查《一本通》的表 */
function openOf(ini: string, cls: Cls, eq: string | undefined, vowel: string) {
  if (eq && cls !== 'retro') {
    if (!vowel) {
      const a = PRON[eq][0]
      return ini === 'hu' ? 'hua' : a
    }
    const t = CV_PRON[eq + vowel]?.[0]
    if (t) return t
  }
  if (cls === 'retro') return ini + RETRO_OPEN[vowel]
  if (ini === 'hu') return join(ini, cls, vowel ? (CV_PRON['ཝ' + vowel]?.[0] ?? '').replace(/^w/, '') : 'a')
  return undefined
}

/** 一个音节的安多类拼音注音；推不出来（梵文音译等）返回 undefined */
export function amdoPinyin(syl: string): string | undefined {
  const p = parseSyllable(syl)
  if (!p || !ROOTS.includes(p.root)) return
  const [ini, cls, eq] = initialOf(p)
  const v = p.vowel
  const suf = p.suffix === 'འ' ? '' : p.suffix ?? ''
  let out: string | undefined
  // 不改变元音的后加字：ི ུ 后面的 ག ད ས、ུ 后的 ཏ……按开音节读
  const silent = suf === '' || (('ིུ'.includes(v) && v !== '') && 'གདསལ'.includes(suf) && !(v === 'ུ' && suf === 'ལ') && !(v === 'ུ' && suf === 'ག'))
  if (silent) {
    out = openOf(ini, cls, ini === 'hu' ? undefined : eq, v)
    if (out && v === 'ི' && suf === 'ག') out = out.replace(/([^aeiou])i$/, '$1e') // ིག 读得松一点：ཡིག ye、རིག re、གཅིག je
  }
  else {
    const fin = FINALS[v || 'a'][suf] ?? FINALS[v || 'a']['']
    if (fin === undefined) return
    out = join(ini, cls, fin)
  }
  if (!out) return
  if (p.ai) out = out.endsWith('a') ? out + 'i' : /(ei|i)$/.test(out) ? out.replace(/e$/, 'ei') : out.replace(/e$/, 'ei').replace(/([^ei])$/, '$1i')
  if (p.u) out += 'u' // ཁྱེའུ、བེའུ：后面带一个轻轻的 u
  return out
}

/** 常见梵文音译词，规律推不出来，单独写 */
const SPECIAL: Record<string, string> = { 'མཎྜལ': 'man da la', 'པདྨ': 'bai ma', 'པདྨེ': 'bai mei', 'པཎྜི': 'ban di', 'པཎྜི་ཏ': 'ban di da', 'ཤཱཀྱ': 'xia ja', 'ཨོཾ': 'om', 'ཧཱུྃ': 'hum', 'ཧཱུཾ': 'hum', 'ཨཱཿ': 'a' }

/** 一个词（音节用 ་ 隔开）的注音；有一个音节推不出来就整体不给 */
export function amdoPinyinOfWord(word: string): string | undefined {
  const w = word.replace(/[་།\s]+$/, '')
  if (SPECIAL[w]) return SPECIAL[w]
  const parts = word.replace(/[་།\s]+$/, '').split('་').filter(Boolean).map((s) => SPECIAL[s] ?? amdoPinyin(s))
  return parts.length && parts.every(Boolean) ? parts.join(' ') : undefined
}
