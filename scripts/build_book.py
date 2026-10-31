"""全书原文：按章切成 public/book/chNN.json，每章用到时才下载。

输入（都不在仓库里，路径作参数传入）：
  book.tsv   句子表（sid section tibetan nsyl），make_book.py 从藏汉对照全文生成
  words.tsv  分词（sid word_index word_id tibetan），segment.py 用 botok 生成
  align/     每句一个 JSON：整句音频里每个音节的起止秒数（run_book.py 生成）
  m4a/       整句音频 <sid>.m4a（从 sent/<sid>.mp3 转成 24 kbps 单声道 AAC）
章节边界在 scripts/data/book/chapters.tsv（每章第一个段落编号）。

输出 src/book-index.json（章节目录）和 public/book/chNN.json：
  {id, zh, tibetan, paras: [{id, sents: [{id, words: [[藏文, 起, 止], ...]}]}]}
音频复制到 public/book/audio/<sid>.m4a。点词时只播整句里那一段，不另做词音频。

用法：python3 scripts/build_book.py <book.tsv> <words.tsv> <align 目录(可多个, 逗号分隔)> <m4a 目录>
"""
import csv, json, os, shutil, sys
from collections import OrderedDict

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
BOOK, WORDS, ALIGN, M4A = sys.argv[1:5]
out_dir = os.path.join(root, 'public/book')
os.makedirs(os.path.join(out_dir, 'audio'), exist_ok=True)

chapters = list(csv.DictReader(open(os.path.join(here, 'data/book/chapters.tsv'), encoding='utf-8'), delimiter='\t'))
sents = OrderedDict((r['sid'], r['tibetan']) for r in csv.DictReader(open(BOOK, encoding='utf-8'), delimiter='\t'))
words = OrderedDict()
for r in csv.DictReader(open(WORDS, encoding='utf-8'), delimiter='\t'):
    words.setdefault(r['sid'], []).append(r['tibetan'])
align_dirs = ALIGN.split(',')

def align_of(sid):
    for d in align_dirs:
        p = os.path.join(d, sid + '.json')
        if os.path.exists(p):
            return json.load(open(p, encoding='utf-8'))
    return None

def chapter_of(pid):
    c = chapters[0]
    for ch in chapters:
        if ch['first_para'] <= pid:
            c = ch
    return c['chapter']

books = OrderedDict((c['chapter'], {'id': c['chapter'], 'zh': c['zh'], 'tibetan': c['tibetan'], 'paras': []}) for c in chapters)
missing_audio = no_align = 0
for sid, tib in sents.items():
    pid = sid[:5]
    ch = books[chapter_of(pid)]
    if not ch['paras'] or ch['paras'][-1]['id'] != pid:
        ch['paras'].append({'id': pid, 'sents': []})
    ws = words.get(sid) or [tib]
    times = [None] * len(ws)
    a = align_of(sid)
    if a and len(a.get('words', [])) == len(ws):
        for s in a['syllables']:
            w = s['word']
            t = times[w]
            times[w] = [s['start'], s['end']] if t is None else [t[0], s['end']]
    else:
        no_align += 1
    src = os.path.join(M4A, sid + '.m4a')
    has_audio = os.path.exists(src)
    if has_audio:
        dst = os.path.join(out_dir, 'audio', sid + '.m4a')
        if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src):
            shutil.copyfile(src, dst)
    else:
        missing_audio += 1
    sent = {'id': sid, 'words': [[w] + ([round(t[0], 2), round(t[1], 2)] if t else []) for w, t in zip(ws, times)]}
    if not has_audio:
        sent['noAudio'] = True
    ch['paras'][-1]['sents'].append(sent)

index = []
for c in books.values():
    n = sum(len(p['sents']) for p in c['paras'])
    json.dump(c, open(os.path.join(out_dir, f"ch{c['id']}.json"), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    index.append({'id': c['id'], 'zh': c['zh'], 'tibetan': c['tibetan'], 'paras': len(c['paras']), 'sents': n})
    print(c['id'], c['zh'], len(c['paras']), 'paras', n, 'sents')
json.dump(index, open(os.path.join(root, 'src/book-index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('sentences', len(sents), 'without audio', missing_audio, 'without word timings', no_align)
