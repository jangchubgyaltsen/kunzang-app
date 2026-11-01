"""全书原文词表：scripts/data/book/gloss.tsv（藏文<TAB>中文释义）→ public/book/gloss.json。

释义是给全书 botok 分词后的词形（去掉 འི ས ར འང འམ འོ 这些粘在词尾的助词以后）逐条写的，
按出现次数从多到少，高频词在前。释义前面带 ? 的是推测，还没有核对，App 里会标出来。
改了 tsv 以后运行：python3 scripts/build_gloss.py
"""
import json, os

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
out = {}
for line in open(os.path.join(here, 'data/book/gloss.tsv'), encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    tib, gloss = line.rstrip('\n').split('\t')
    out[tib] = gloss
json.dump(out, open(os.path.join(root, 'public/book/gloss.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(len(out), '条')
