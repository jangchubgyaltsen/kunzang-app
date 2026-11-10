"""原文高频词表：public/book/ch*.json → public/book/vocab.json。

按全书（开篇以外的 14 章）的词频从高到低排，取前 N 个词，每个词配一句原文例句：
按词频顺序学下来，挑“除了这个词，别的词都已经学过”的短句（3–12 个词、有录音），
挑不到就挑其他词最常见的那句。例句的录音是整句音频，词的读音从整句里按时间切出来。

每章另记这些词各出现几次，进度页算“每章认识多少”。
另外列出全书最常见的 200 个音节，各找一处它单独成词的地方（有录音），拼读流利度测验用。

改了分词或音频以后运行：python3 scripts/build_vocab.py
"""
import glob, json, os, re
from collections import Counter, defaultdict

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
N = 1500
TOP_SYL = 200
TIB = re.compile(r'^[ཀ-ྼ་]+$')

sents = []  # (sid, words[[w,s,e]...])
chap = {}  # 章 → 词频，算“这一章你认识多少”用
for f in sorted(glob.glob(os.path.join(root, 'public/book/ch*.json'))):
    ch = json.load(open(f, encoding='utf-8'))
    if ch['id'] == '00':
        continue
    for p in ch['paras']:
        for s in p['sents']:
            ws = [w for w in s['words'] if TIB.match(w[0])]
            chap.setdefault(ch['id'], Counter()).update(w[0] for w in ws)
            if ws:
                sents.append((s['id'], ws, not s.get('noAudio')))

freq = Counter(w[0] for _, ws, _ in sents for w in ws)
total = sum(freq.values())
ranked = [w for w, _ in freq.most_common()]
rank = {w: i for i, w in enumerate(ranked)}

by_word = defaultdict(list)
for k, (_, ws, audio) in enumerate(sents):
    if not audio or not 3 <= len(ws) <= 12:
        continue
    if any(len(w) < 3 for w in ws):  # 没有时间的词，切不出读音
        continue
    for w in {w[0] for w in ws}:
        by_word[w].append(k)

out = []
for i, w in enumerate(ranked[:N]):
    best = None
    for k in by_word.get(w, []):
        sid, ws, _ = sents[k]
        others = [rank[x[0]] for x in ws if x[0] != w]
        worst = max(others) if others else 0
        # 其他词最好都已经学过（刚开始的几十个词放宽到前 100 个高频词），再挑 5–9 个词的句子；
        # 挑不到就比“其他词里最生的那个”排名多靠前
        t = max(i, 100)
        dup = len(ws) - len({x[0] for x in ws})
        key = (worst > t, 0 if worst <= t else worst, dup > 0, abs(len(ws) - 7), worst)
        if best is None or key < best[0]:
            best = (key, k)
    item = {'w': w, 'n': freq[w]}
    if best:
        sid, ws, _ = sents[best[1]]
        idx = next(j for j, x in enumerate(ws) if x[0] == w)
        item['ex'] = {'s': sid, 't': [[x[0], round(x[1], 2), round(x[2], 2)] for x in ws], 'i': idx}
    out.append(item)

# 最常见的音节：找一处它单独成词、有时间的地方
syl = Counter()
for _, ws, _ in sents:
    for w in ws:
        for s in w[0].split('་'):
            if s:
                syl[s] += 1
clips = {}
for sid, ws, audio in sents:
    if not audio:
        continue
    for x in ws:
        if len(x) >= 3 and '་' not in x[0] and x[0] not in clips and x[2] - x[1] >= 0.15:
            clips[x[0]] = [sid, round(x[1], 2), round(x[2], 2)]
syls = []
for s, n in syl.most_common():
    if s in clips:
        syls.append({'s': s, 'n': n, 'clip': clips[s]})
    if len(syls) >= TOP_SYL:
        break

# 每章：总词次，和前 N 个高频词各在这一章出现几次（扁平成 [排名, 次数, 排名, 次数, …]）
chs = []
for cid, c in sorted(chap.items()):
    flat = []
    for i, w in enumerate(ranked[:N]):
        if c[w]:
            flat += [i, c[w]]
    chs.append({'id': cid, 'total': sum(c.values()), 'c': flat})

json.dump({'total': total, 'words': out, 'syls': syls, 'chs': chs}, open(os.path.join(root, 'public/book/vocab.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
cov = sum(x['n'] for x in out) / total
print(f'{len(out)} 个词，覆盖全书 {cov:.1%}；有例句 {sum(1 for x in out if "ex" in x)} 个；音节 {len(syls)} 个')
