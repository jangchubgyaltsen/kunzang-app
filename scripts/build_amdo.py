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
    words.append({'id': wid, 'page': int(r['页码']), 'tib': clean(r['藏文']), 'zh': zh, 'audio': audio(r['录音'], 'w/' + wid)})
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
        t['rows'][-1].append({'tib': clean(r['藏文']), 'audio': a})
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

with ThreadPoolExecutor(8) as ex: list(ex.map(conv, jobs))
order = ['辅音', '元音', '元音与辅音拼法', '五个前加字', '三个上加字', '四个下加字', '十个后加字', '两个再后加字', '叠加字']
data = {'sentences': sentences, 'sets': sets, 'words': words,
        'pages': [{'page': p, 'ids': ids} for p, ids in sorted(pages.items())],
        'tables': [tables[p] for p in order if p in tables],
        'lessons': [lessons[n] for n in sorted(lessons)]}
json.dump(data, open(os.path.join(ROOT, 'src/amdo.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(sentences), len(words), sum(len(r) for t in tables.values() for r in t['rows']), sum(len(l['segs']) for l in lessons.values()))
