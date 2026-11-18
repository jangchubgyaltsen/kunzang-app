#!/usr/bin/env python3
"""把「藏汉课诵阅读器」（daily_recitation_reader）的颂词库转成本 App 的偈颂数据。

用法：python3 scripts/build_verses.py <daily_recitation_reader 仓库目录>

输出：
- public/verse/verses.json：仪轨（分类、段落、每句的藏文、汉义、课诵本音译、逐词释义）和学习顺序
- public/verse/w/<文件>.mp3：用到的词的发音（课诵阅读器的共用词库，安多 MMS TTS，w 挑过的候选；
  从课诵阅读器发布的网页 index.html 里的 LEX 表查词 → a/<哈希>.mp3）

逐词：用颂词库里每句的 beat_groups（按格律分组，每组带汉义）。
w 定的规则是按格律分组，会把一个词拆成两组时后半组汉义写「…」，这里把它并回前一组，学的时候是一个完整的词。
汉字音译：课诵本每个音节的音译（zh_ph），App 里发音提示一律用它。
学习顺序：COURSE 里先列的短而常念的偈颂，然后其余有逐词释义的祈祷文、发愿文按句数从少到多。
咒语不放（w 2026-11-18）：没有汉译的句子都去掉，去完没句子的仪轨整部不要；名号有音译和汉译，进学习线。
同一句在几部仪轨里都有（如四无量心单独一部、释迦佛修法里也有）只学一次。
"""
import json
import shutil
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'verse'

# 先学的：短、常念、词常见。其余按句数排在后面
COURSE = [
    'refuge-four', 'four-immeasurables', 'refuge-bodhicitta-mipham', 'dedication-verse', 'seven-line-prayer',
    'request-dharma', 'meal-offering', 'auspicious-verse', 'manjushri-wisdom', 'refuge-bodhicitta-verse',
    'samantabhadra-dedication', 'guru-khyen', 'truth-words', 'guru-inseparable-aspiration', 'chenrezig-prayer',
    'amitayus-prayer', 'medicine-buddha-prayer', 'tara-prayer', 'longchenpa-prayer', 'mipham-prayer-1',
    'jigme-phuntsok-prayer', 'seven-branch',
]
# 最后学的长篇（在其余的后面，按这个顺序）
LAST = ['eight-auspicious', 'bodhisattva-vow', 'shakyamuni', 'seven-line-guru-yoga', 'ngondro', 'inexpressible-confession',
        'manjushri-dzogchen-aspiration', 'samantabhadra-aspiration', 'sukhavati-aspiration']

# 咒语都去掉了，「咒语名号」这一类只剩名号
CAT_RENAME = {'咒语名号': '名号'}

DOTS = {'…', '...', '……'}


def nfc(s):
    return unicodedata.normalize('NFC', s or '').strip()


def lex_key(w):
    return nfc(w).strip('་།༎ ')


def load_categories(src):
    cats, cur = [], None
    for ln in (src / 'src/rituals/categories.list').read_text(encoding='utf-8').splitlines():
        ln = ln.strip()
        if not ln or ln.startswith('#'):
            continue
        if ln.startswith('=='):
            cur = (ln[2:].strip(), [])
            cats.append(cur)
        elif cur:
            cur[1].append(ln)
    return cats


def load_lexicon(src):
    """词 → a/ 里的文件名。课诵阅读器发布的网页（index.html）里嵌着这张表（LEX），文件名是内容哈希"""
    t = (src / 'index.html').read_text(encoding='utf-8')
    i = t.index('const LEX=') + len('const LEX=')
    m, _ = json.JSONDecoder().raw_decode(t[i:])
    lex = {}
    for w, f in m.items():
        f = f.split('/')[-1]
        if (src / 'a' / f).exists():
            lex[lex_key(w)] = f
    return lex


def words_of(line):
    """beat_groups → 词：[{t 藏文, g 这句里的汉义, s 第几个音节起, n 几个音节}]，「…」并回前一组"""
    syl = line.get('syllables') or []
    out = []
    for g in line.get('beat_groups') or []:
        ids = g.get('syl') or []
        if not ids:
            continue
        t = '་'.join(syl[i]['bo'] for i in ids)
        zh = (g.get('zh') or '').strip()
        if zh in DOTS and out:
            out[-1]['t'] += '་' + t
            out[-1]['n'] += len(ids)
            continue
        out.append({'t': nfc(t), 'g': zh, 's': ids[0], 'n': len(ids)})
    return out


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    lex = load_lexicon(src)
    cats = load_categories(src)
    cat_of = {}
    for name, ids in cats:
        for i in ids:
            cat_of.setdefault(i, []).append(name)

    rituals = {}
    for f in sorted((src / 'src/rituals').glob('*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        m = d['meta']
        if m.get('restriction') != 'public':
            continue
        rituals[m['id']] = d

    # 学习顺序
    def glossed(rid):
        return sum(1 for s in rituals[rid]['sections'] for l in s['lines'] if l.get('beat_groups'))

    rest = [r for r in rituals if r not in COURSE and r not in LAST and glossed(r) >= 1]
    rest.sort(key=lambda r: (sum(len(s['lines']) for s in rituals[r]['sections']), r))
    order = [r for r in COURSE + rest + LAST if r in rituals]
    # 名号短而常念，放在开头的短偈颂后面
    names = [r for r in order if r.endswith('-name')]
    order = [r for r in order if r not in names]
    order[len(COURSE) - 1:len(COURSE) - 1] = names

    used_audio = set()
    gloss_count = defaultdict(Counter)
    ph_count = defaultdict(Counter)
    word_n = Counter()
    seen_line = {}
    course = []
    out_r = []

    def line_rec(rid, l):
        words = words_of(l)
        for w in words:
            a = lex.get(lex_key(w['t']))
            if a:
                w['a'] = a.rsplit('.', 1)[0]
                used_audio.add(a)
        return {
            'id': l['id'],
            'bo': nfc(l['bo']),
            'zh': l.get('zh', ''),
            'ph': l.get('zh_ph', ''),
            'syl': [s['bo'] for s in l.get('syllables') or []],
            # 每个音节的汉字音译（课诵本自带的，如 森 坚）
            'sp': [s.get('zh_ph', '') for s in l.get('syllables') or []],
            'w': words,
        }

    recs = {}
    for rid, d in rituals.items():
        m = d['meta']
        secs = []
        for s in d['sections']:
            # 咒语不放（w 2026-11-18）：没有汉译的句子（咒语、种子字）去掉；名号有音译和汉译，留着
            ls = [line_rec(rid, l) for l in s['lines'] if (l.get('zh') or '').strip() and (l.get('zh_ph') or '').strip()]
            if ls:
                secs.append({'title': s.get('title.zh', ''), 'lines': ls})
        if not secs:
            continue
        recs[rid] = {
            'id': rid,
            'title': m.get('title.zh', rid),
            'titleBo': m.get('title.bo', ''),
            'cats': [CAT_RENAME.get(c, c) for c in cat_of.get(rid, ['咒语名号' if 'mantra' in rid or 'dharani' in rid or 'name' in rid else '其他'])],
            'gloss': 'draft' if 'draft' in (m.get('gloss.status') or '') else 'ok',
            'source': m.get('source.zh', ''),
            'sections': secs,
        }

    # 学习线：按顺序，每句有逐词释义才学；同一句只学一次
    for rid in order:
        for s in recs[rid]['sections']:
            for l in s['lines']:
                if not l['w'] or not any(w['g'] for w in l['w']):
                    continue
                key = l['bo'].strip('་།༎ ༔')
                kc = f'{rid}/{l["id"]}'
                if key in seen_line:
                    l['same'] = seen_line[key]
                    continue
                seen_line[key] = kc
                course.append(kc)
                for w in l['w']:
                    if w['g']:
                        gloss_count[w['t']][w['g']] += 1
                        ph = ''.join(l['sp'][w['s']:w['s'] + w['n']])
                        if ph:
                            ph_count[w['t']][ph] += 1
                        word_n[w['t']] += 1

    # 词表：每个词最常见的那个汉义、用到几次、发音
    words = {}
    for t, c in gloss_count.items():
        a = lex.get(lex_key(t))
        p = ph_count[t].most_common(1)[0][0] if ph_count[t] else ''
        words[t] = {'g': c.most_common(1)[0][0], 'n': word_n[t], 'p': p, **({'a': a.rsplit('.', 1)[0]} if a else {})}

    # 仪轨页的排序：分类顺序，分类里按 categories.list 的顺序
    cat_names = [CAT_RENAME.get(n, n) for n, _ in cats] + ['其他']
    pos = {rid: i for _, ids in cats for i, rid in enumerate(ids)}
    for rid in sorted(recs, key=lambda r: (cat_names.index(recs[r]['cats'][0]) if recs[r]['cats'][0] in cat_names else 99, pos.get(r, 999), r)):
        out_r.append(recs[rid])

    data = {
        'source': 'daily_recitation_reader（藏汉课诵阅读器）颂词库',
        'cats': cat_names,
        'rituals': out_r,
        'course': course,
        'words': words,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'verses.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    wdir = OUT / 'w'
    if wdir.exists():
        shutil.rmtree(wdir)
    wdir.mkdir()
    for a in sorted(used_audio):
        shutil.copyfile(src / 'a' / a, wdir / a)
    with_audio = sum(1 for w in words.values() if 'a' in w)
    print(f'仪轨 {len(out_r)} 部，学习线 {len(course)} 句，词 {len(words)} 个（有发音 {with_audio}），音频文件 {len(used_audio)} 个')


if __name__ == '__main__':
    main()
