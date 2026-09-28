#!/usr/bin/env python3
"""Build data/chunks/en.json (the site's English master) from:
  data/chunks/en_source.json     original 1,200-chunk bank (copied verbatim from the vault)
  data/chunks/levels/batchNN.json practical levels for the original bank (optional)
  data/chunks/beginner_en.json    beginner bank, ENG_CHUNK_1201+ (optional)
Adds `level` (practical level used by the site) and `level_reason`; keeps `cefr_level` as the source tag.
Also writes data/chunks/src/batch13.. for the beginner bank, and the vault export files when --vault is given."""
import json, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = json.loads((root / 'data/chunks/en_source.json').read_text())
lv = {}
for p in sorted((root / 'data/chunks/levels').glob('batch*.json')):
    for r in json.loads(p.read_text()): lv[r['id']] = r
out = []
for c in src:
    c = dict(c); r = lv.get(c['id'])
    c['level'] = r['level'] if r else c['cefr_level']
    if r: c['level_reason'] = r['r']
    out.append(c)
bp = root / 'data/chunks/beginner_en.json'
beg = json.loads(bp.read_text()) if bp.exists() else []
for c in beg:
    c = dict(c); c['level'] = c['cefr_level']; out.append(c)
if beg:
    keep = ('id', 'chunk', 'category', 'pragmatic_function', 'register', 'natural_example', 'cefr_level')
    for i in range(0, len(beg), 100):
        rows = [{k: c[k] for k in keep} for c in beg[i:i + 100]]
        (root / f'data/chunks/src/batch{13 + i // 100:02d}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=0))
(root / 'data/chunks/en.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
from collections import Counter
print(f'en.json: {len(out)} chunks; levels {dict(sorted(Counter(c["level"] for c in out).items()))}; re-levelled {len(lv)}; beginner {len(beg)}')
if '--vault' in sys.argv:
    V = pathlib.Path.home() / 'Library/Mobile Documents/iCloud~md~obsidian/Documents/pakrasi-vault/20-Languages/English Chunk Bank'
    (V / 'english_chunks_levels.json').write_text(json.dumps({k: {'practical_level': v['level'], 'reason': v['r']} for k, v in lv.items()}, ensure_ascii=False, indent=1))
    if beg: (V / 'english_beginner_chunks.json').write_text(json.dumps(beg, ensure_ascii=False, indent=1))
    print('wrote vault exports to', V)
