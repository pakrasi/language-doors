#!/usr/bin/env python3
"""Crude language sanity check on chunk part files: script ranges + stopword votes.
Flags any batch whose dominant language guess differs from its folder."""
import json, pathlib, re, collections, sys
root = pathlib.Path(__file__).resolve().parent.parent / 'data/chunks/parts'
SCRIPT = {'hindi': r'[ऀ-ॿ]', 'bengali': r'[ঀ-৿]', 'arabic': r'[؀-ۿ]'}
STOP = {
 'german': 'ich du nicht und ist das es wir ein eine mit auf für sie mir dich',
 'swissgerman': 'isch nöd ich du mir chan cha wott gsi hät es au no mit',
 'french': 'je tu ne pas le la les est et que de un une vous on ça',
 'spanish': 'el la que de y es no un una por para lo me te se',
 'italian': 'il la che di e è non un una per mi ti ci lo sono',
 'portuguese': 'o a que de e é não um uma para você eu me se com',
 'khasi': 'nga ka u ki ha ba ia ïa bad ym lah ban la phi me',
}
bad = 0
for d in sorted(root.iterdir()):
    lang = d.name
    for f in sorted(d.glob('batch*.json')):
        rows = json.loads(f.read_text()); text = ' '.join(r.get('t', '') + ' ' + r.get('ex', '') for r in rows)
        if lang in SCRIPT:
            share = len(re.findall(SCRIPT[lang], text)) / max(1, len(re.findall(r'\w', text)))
            ok = share > 0.5; guess = f'{share:.0%} native script'
        else:
            words = collections.Counter(re.findall(r"[a-zäöüàâçéèêëîïôûùœßñíóúãõ']+", text.lower()))
            votes = {l: sum(words[w] for w in s.split()) for l, s in STOP.items()}
            g = max(votes, key=votes.get); ok = g == lang or {g, lang} == {'german', 'swissgerman'} and votes[lang] > 0.5 * votes[g]
            guess = g
        if not ok: bad += 1; print(f'SUSPECT {lang}/{f.name}: looks like {guess}')
print('langcheck done,', bad, 'suspect batch(es)'); sys.exit(1 if bad else 0)
