#!/usr/bin/env python3
import json, pathlib, re, sys, collections, difflib
root = pathlib.Path(__file__).resolve().parent.parent
KEYS = ["id", "chunk", "category", "pragmatic_function", "register", "variable_slots", "natural_example", "substitutable_examples", "cefr_level"]
CATS = {"sentence_frame", "collocation", "gambit_filler", "fixed_formula", "discourse_connector"}
old = json.loads((root / 'data/chunks/en.json').read_text())
try: new = json.loads((root / 'data/chunks/beginner_en.json').read_text())
except Exception as e: print('INVALID:', e); sys.exit(1)
norm = lambda t: re.sub(r'\[[^\]]*\]', '[x]', re.sub(r"[^\w\[\] ']", '', t.lower())).strip()
errs = []
if len(new) != 250: errs.append(f'need 250 items, got {len(new)}')
seen = {norm(o['chunk']): o['id'] for o in old}
for i, e in enumerate(new):
    want = f'ENG_CHUNK_{1201 + i:04d}'
    if list(e.keys()) != KEYS: errs.append(f'{e.get("id")}: keys must be exactly {KEYS}')
    if e.get('id') != want: errs.append(f'item {i}: id should be {want}')
    if e.get('category') not in CATS: errs.append(f'{want}: bad category')
    if e.get('register') not in ('neutral', 'informal', 'polite', 'formal'): errs.append(f'{want}: bad register')
    if e.get('cefr_level') not in ('A1', 'A2'): errs.append(f'{want}: cefr_level must be A1 or A2')
    slots = re.findall(r'\[[^\]]+\]', e.get('chunk', '')); vs = [s.get('slot') for s in e.get('variable_slots', [])]
    if sorted(slots) != sorted(vs): errs.append(f'{want}: variable_slots {vs} do not match chunk slots {slots}')
    if len(e.get('substitutable_examples', [])) != 2: errs.append(f'{want}: need 2 substitutable_examples')
    k = norm(e.get('chunk', ''))
    if k in seen: errs.append(f'{want}: duplicate of {seen[k]} ("{e["chunk"]}")')
    else:
        close = difflib.get_close_matches(k, list(seen), n=1, cutoff=0.92)
        if close: errs.append(f'{want}: near-duplicate of {seen[close[0]]} ("{e["chunk"]}")')
    seen[k] = want
if errs: print(len(errs), 'problem(s):'); [print(' -', x) for x in errs[:50]]; sys.exit(1)
print('OK beginner_en.json:', len(new), dict(collections.Counter(e['cefr_level'] for e in new)), dict(collections.Counter(e['category'] for e in new)))
