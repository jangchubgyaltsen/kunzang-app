"""《安多方言会话教材》→ App 数据（src/amdo.json）和录音、课文图片（public/amdo/）。

用法：python3 scripts/build_amdo.py <拆解目录>
拆解目录里有 300句.tsv、单词.tsv、字母拼读.tsv、课文.tsv 和对应的 audio/、课文/。
"""
import csv, json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public/amdo')
jobs = []

def audio(src_rel, id_):
    dst = f'{PUB}/{id_}.m4a'
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    jobs.append((os.path.join(SRC, src_rel), dst))
    return 'amdo/' + id_

def conv(a):
    src, dst = a
    af = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB,areverse,apad=pad_dur=0.08,loudnorm=I=-18:TP=-2:LRA=11')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *(['-f', 'mp3'] if src.endswith('.mp3') else []), '-i', src, '-af', af, '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', '32k', dst], check=True)

# ── 音节结构分析：算出读一个词需要哪些字母、元音、规则（和 course.ts 的 sylKCs 同样的知识点）──
VOW = {'\u0f72': 'ི', '\u0f74': 'ུ', '\u0f7a': 'ེ', '\u0f7c': 'ོ'}
PREFIX, SUFFIX, POST = set('གདབམའ'), set('གངདནབམའརལས'), set('དས')
norm_letter = lambda c: chr(ord(c) - 0x50) if '\u0f90' <= c <= '\u0fbc' else c
LETTERS = set('ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ')

def stacks(syl):
    out = []
    for ch in syl:
        if '\u0f40' <= ch <= '\u0f6c': out.append([ch, [], None])
        elif '\u0f90' <= ch <= '\u0fbc' and out: out[-1][1].append(ch)
        elif ch in VOW and out: out[-1][2] = ch
        else: return None  # 其他符号（长元音、标点等）不分析
    return out

def syl_kcs(syl):
    st = stacks(syl)
    if not st: return None
    kcs = set()
    if len(st) >= 2 and st[-1][0] == 'འ' and st[-1][2] and not st[-1][1]:  # 结尾的 འི འུ འོ 当作助词
        kcs |= {'L:འ', 'V:' + st[-1][2]}; st = st[:-1]
    ri = next((i for i, x in enumerate(st) if x[1] or x[2]), None)
    n = len(st)
    if ri is None:
        if n == 1: ri = 0
        elif n == 2: ri = 0
        elif n == 3: ri = 1 if st[0][0] in PREFIX and st[2][0] in SUFFIX and not (st[1][0] in SUFFIX and st[2][0] in POST and st[0][0] not in PREFIX) else 0
        elif n == 4: ri = 1
        else: return None
    if ri > 1 or n - ri - 1 > 2: return None
    if ri == 1:
        if st[0][0] not in PREFIX or st[0][1] or st[0][2]: return None
        kcs |= {'L:' + st[0][0], 'R:pre'}
    base, subs, v = st[ri]
    subs = [norm_letter(c) for c in subs]
    if subs and base in 'རལས' and subs[0] not in 'ཡརལཝ':
        kcs |= {'L:' + base, 'R:sup'}; base, subs = subs[0], subs[1:]
    kcs.add('L:' + base)
    for c in subs: kcs |= {'L:' + c, 'R:sub'}
    if v: kcs.add('V:' + v)
    after = st[ri + 1:]
    if after:
        if after[0][0] not in SUFFIX or after[0][1] or after[0][2]: return None
        kcs |= {'L:' + after[0][0], 'R:suf'}
    if len(after) == 2:
        if after[1][0] not in POST: return None
        kcs |= {'L:' + after[1][0], 'R:post'}
    if any(k[2:] not in LETTERS for k in kcs if k.startswith('L:')): return None
    return kcs

def split_syl(syl):
    """课件里有的词漏了音节点（如 ཇགཔ），试着切成两个都合规的音节"""
    if syl_kcs(syl) is not None: return [syl]
    for i in range(1, len(syl)):
        a, b = syl[:i], syl[i:]
        if '\u0f40' <= b[0] <= '\u0f6c' and syl_kcs(a) is not None and syl_kcs(b) is not None and len(stacks(a)) >= 2: return [a, b]
    return None

def fix_tsheg(t):
    """补上漏掉的音节点；切不开的原样保留"""
    parts = re.split(r'([་།\s（）()]+)', t)
    return ''.join('་'.join(split_syl(p) or [p]) if p and not re.match(r'[་།\s（）()]', p) else p for p in parts)

def word_kcs(t):
    out = set()
    for syl in re.split(r'[་།\s（）()]+', t):
        if not syl: continue
        k = syl_kcs(syl)
        if k is None: return None
        out |= k
    return sorted(out) if out else None

def read(name): return list(csv.DictReader(open(os.path.join(SRC, name)), delimiter='\t'))
clean = lambda t: re.sub(r'\s+', ' ', t).strip()

# 300 句：按课件分组（每个文件 15 句左右）
sentences, sets = [], []
for r in read('300句.tsv'):
    n = int(r['编号'])
    sid = f'{n:03d}' if not any(s['id'] == f'{n:03d}' for s in sentences) else f'{n:03d}b'
    if any(s['tib'] == r['藏文'] and s['zh'] == r['中文'] for s in sentences): continue  # 两个课件里重复的同一句
    sentences.append({'id': sid, 'n': n, 'tib': clean(r['藏文']), 'zh': clean(r['中文']), 'audio': audio(r['录音'], 's/' + sid)})
for i in range(0, len(sentences), 15):
    g = sentences[i:i + 15]
    sets.append({'title': f'第 {g[0]["n"]}–{g[-1]["n"]} 句', 'ids': [s['id'] for s in g]})

# 单词：按课本页码分组
words, pages = [], {}
for i, r in enumerate(read('单词.tsv'), 1):
    wid = f'{i:03d}'
    zh = clean(r['中文']).replace('（）', '').strip('　 ，,')
    tib = fix_tsheg(clean(r['藏文']))
    words.append({'id': wid, 'page': int(r['页码']), 'tib': tib, 'zh': zh, 'audio': audio(r['录音'], 'w/' + wid), 'kcs': word_kcs(tib)})
    pages.setdefault(int(r['页码']), []).append(wid)

# 拼读表：每部分按行，连读按钮读整行
tables = {}
for i, r in enumerate(read('字母拼读.tsv'), 1):
    t = tables.setdefault(r['部分'], {'part': r['部分'], 'rows': [[]]})
    a = audio(r['录音'], f't/{i:03d}')
    if r['类型'] == '连读':
        t['rows'][-1].append({'tib': '', 'audio': a, 'all': True})
        t['rows'].append([])
    else:
        t['rows'][-1].append({'tib': clean(r['藏文']), 'audio': a, 'id': f'{i:03d}', 'kcs': word_kcs(r['藏文'])})
for t in tables.values(): t['rows'] = [x for x in t['rows'] if x]

# 课文：每段一张切图 + 一段录音
lessons = {}
for r in read('课文.tsv'):
    n = int(r['课'])
    L = lessons.setdefault(n, {'n': n, 'topic': r['主题'], 'page': int(r['页']), 'segs': []})
    k = f'k/L{n}/{int(r["段"]):03d}'
    im = Image.open(os.path.join(SRC, r['图片'])).convert('RGB')
    w = 900; im = im.resize((w, max(1, round(im.size[1] * w / im.size[0]))))
    os.makedirs(f'{PUB}/k/L{n}', exist_ok=True); im.save(f'{PUB}/{k}.jpg', quality=72, optimize=True)
    L['segs'].append({'img': k, 'audio': audio(r['录音'], k)})

import os as _os
if not _os.environ.get('SKIP_AUDIO'):
    with ThreadPoolExecutor(8) as ex: list(ex.map(conv, jobs))
order = ['辅音', '元音', '元音与辅音拼法', '五个前加字', '三个上加字', '四个下加字', '十个后加字', '两个再后加字', '叠加字']
data = {'sentences': sentences, 'sets': sets, 'words': words,
        'pages': [{'page': p, 'ids': ids} for p, ids in sorted(pages.items())],
        'tables': [tables[p] for p in order if p in tables],
        'lessons': [lessons[n] for n in sorted(lessons)]}
json.dump(data, open(os.path.join(ROOT, 'src/amdo.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(sentences), len(words), sum(len(r) for t in tables.values() for r in t['rows']), sum(len(l['segs']) for l in lessons.values()))
