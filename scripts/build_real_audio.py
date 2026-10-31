"""把《安多方言会话教材》（Flash 课件）里的真人录音接进 App。

输入：拆解课件得到的目录（含 字母拼读.tsv、单词.tsv 和 audio/），用法：
    python3 scripts/build_real_audio.py <拆解目录>
输出：
    public/audio/L-01..30.m4a、CV-xx-v.m4a  直接换成真人录音（编号不变）
    public/audio/real/*.m4a                 音节卡、词卡用的真人录音
    src/real-audio.json                     藏文 → 音频编号
    scripts/data/amdo-real.tsv              每段录音的出处，便于核对
文章（开篇整句、原文页）不动，仍用 TTS。
"""
import csv, json, re, subprocess, sys, os
SRC = sys.argv[1]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUD = os.path.join(ROOT, 'public/audio')
LETTERS = 'ཀཁགངཅཆཇཉཏཐདནཔཕབམཙཚཛཝཞཟའཡརལཤསཧཨ'
VOWELS = [('ི', 'i'), ('ུ', 'u'), ('ེ', 'e'), ('ོ', 'o')]

def norm(t): return re.sub(r'[་།\s]+$', '', re.sub(r'^[་།\s]+', '', t)).replace(' ', '')

def conv(src, dst):
    af = ('silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'silenceremove=start_periods=1:start_threshold=-45dB,areverse,'
          'apad=pad_dur=0.08,loudnorm=I=-18:TP=-2:LRA=11')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *(['-f', 'mp3'] if src.endswith('.mp3') else []), '-i', src, '-af', af, '-ac', '1', '-ar', '16000',
                    '-c:a', 'aac', '-b:a', '32k', dst], check=True)

rows = list(csv.DictReader(open(os.path.join(SRC, '字母拼读.tsv')), delimiter='\t'))
words = list(csv.DictReader(open(os.path.join(SRC, '单词.tsv')), delimiter='\t'))
# 候选：拼读表里的单音节优先，其次单词表
pool = {}
for r in rows:
    if r['类型'] == '单音节':
        pool.setdefault(norm(r['藏文']), []).append(('拼读·' + r['部分'], r['录音']))
for r in words:
    for t in re.split(r'[（）()]', r['藏文']):
        if norm(t): pool.setdefault(norm(t), []).append((f"单词·第{r['页码']}页·{r['中文']}", r['录音']))

log = []
def pick(text, part=None):
    c = pool.get(text, [])
    if part: c = [x for x in c if x[0] == '拼读·' + part] or c
    return c[0] if c else None

# 字母、元音组合：换掉原文件
for i, l in enumerate(LETTERS, 1):
    src = pick(l, '辅音'); conv(os.path.join(SRC, src[1]), f'{AUD}/L-{i:02d}.m4a')
    log.append([l, f'L-{i:02d}', src[0], src[1]])
    for mark, v in VOWELS:
        src = pick(l + mark, '元音与辅音拼法'); conv(os.path.join(SRC, src[1]), f'{AUD}/CV-{i:02d}-{v}.m4a')
        log.append([l + mark, f'CV-{i:02d}-{v}', src[0], src[1]])

# 音节卡、词卡
opening = json.load(open(os.path.join(ROOT, 'src/opening.json')))
wordlist = json.load(open(os.path.join(ROOT, 'src/words.json')))
need = [s['tibetan'] for s in opening['syllables']] + [w['tibetan'] for w in wordlist]
os.makedirs(f'{AUD}/real', exist_ok=True)
real = {}
for t in need:
    k = norm(t)
    if t in real or k not in pool: continue
    src = pick(k); n = len(real) + 1
    conv(os.path.join(SRC, src[1]), f'{AUD}/real/r{n:03d}.m4a')
    real[t] = f'real/r{n:03d}'
    log.append([t, real[t], src[0], src[1]])
json.dump(real, open(os.path.join(ROOT, 'src/real-audio.json'), 'w'), ensure_ascii=False, indent=1)
with open(os.path.join(ROOT, 'scripts/data/amdo-real.tsv'), 'w', newline='') as f:
    w = csv.writer(f, delimiter='\t', lineterminator='\n')
    w.writerow(['藏文', '音频编号', '出处', '原始录音']); w.writerows(log)
print('letters/cv', 150, 'cards', len(real))
