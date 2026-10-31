"""开篇逐词数据：分词、一本通式注音、切分版词音频、整句连读音频。

输入 scripts/data/opening-words.tsv（word_id line_id pos tibetan yitong_guess）
输出 src/opening-words.json。音频文件放在 public/audio/op/<word_id>.mp3 和 <line_id>.mp3，
文件名里不带版本；挑哪个版本（切分 / 词首 / 多 seed）在生成音频时已经决定。

用法：python3 scripts/build_opening_words.py
"""
import csv, json, os
from collections import Counter, defaultdict

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
rows = list(csv.DictReader(open(os.path.join(here, 'data/opening-words.tsv'), encoding='utf-8'), delimiter='\t'))

lines = {}
for r in rows:
    lid = r['line_id']
    passage, n = lid.rsplit('-', 1)
    ln = lines.setdefault(lid, {'id': lid, 'passage': passage, 'index': int(n) - 1, 'audio': 'op/' + lid, 'words': []})
    assert os.path.exists(os.path.join(root, 'public/audio/op', r['word_id'] + '.mp3')), r['word_id']
    ln['words'].append({'id': r['word_id'], 'tibetan': r['tibetan'], 'yitong': r['yitong_guess'], 'audio': 'op/' + r['word_id']})
    assert os.path.exists(os.path.join(root, 'public/audio/op', lid + '.mp3')), lid

# 单个音节的注音：取各词里音节数和注音段数对得上的，按出现次数投票
votes = defaultdict(Counter)
for r in rows:
    syl = r['tibetan'].split('་')
    py = r['yitong_guess'].split()
    if len(syl) == len(py):
        for s, p in zip(syl, py):
            votes[s][p] += 1
sylYitong = {s: c.most_common(1)[0][0] for s, c in votes.items()}

out = {'lines': list(lines.values()), 'sylYitong': sylYitong}
json.dump(out, open(os.path.join(root, 'src/opening-words.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out['lines']), 'lines', sum(len(l['words']) for l in out['lines']), 'words', len(sylYitong), 'syllables with yitong')
