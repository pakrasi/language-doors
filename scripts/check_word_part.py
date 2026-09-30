#!/usr/bin/env python3
"""Check one word-list slice: python3 scripts/check_word_part.py data/words/parts/de/B1a.json

Errors fail. Warnings (duplicates with other slices, seed conflicts) are for review.
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
THEMES = [t["id"] for t in json.loads((ROOT / "data/words/themes.json").read_text())]
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
POS = {"noun", "verb", "adj", "adv", "prep", "conj", "pron", "num", "det", "interj", "phrase"}
KEYS = {"w", "art", "pl", "pos", "en", "alt", "level", "theme", "ex", "exen"}
OPTIONAL = {"forms"}
# slice name -> (level, allowed themes)
HALF = len(THEMES) // 2
SLICES = {
    "A1": ("A1", THEMES), "A2": ("A2", THEMES),
    "B1a": ("B1", THEMES[:HALF]), "B1b": ("B1", THEMES[HALF:]),
    "B2a": ("B2", THEMES[:HALF]), "B2b": ("B2", THEMES[HALF:]),
    "C1": ("C1", THEMES), "C2": ("C2", THEMES),
}


def key(r):
    # pronouns keep their case: "Sie" (formal you) and "sie" (she/they) are different words
    w = r["w"] if r.get("pos") == "pron" else r["w"].lower()
    return (w, r["pos"] if r["pos"] == "noun" else "")


def check(path):
    path = Path(path)
    name = path.stem
    if name not in SLICES:
        sys.exit(f"unknown slice {name}; expected one of {list(SLICES)}")
    level, themes = SLICES[name]
    data = json.loads(path.read_text())
    errors, warnings = [], []
    seen = {}
    for i, r in enumerate(data):
        where = f"[{i}] {r.get('w')!r}"
        extra = set(r) - KEYS - OPTIONAL
        missing = KEYS - set(r)
        if extra or missing:
            errors.append(f"{where}: missing {sorted(missing)} extra {sorted(extra)}")
            continue
        if r["level"] != level:
            errors.append(f"{where}: level must be {level}")
        if r["theme"] not in themes:
            errors.append(f"{where}: theme {r['theme']!r} not in this slice's themes")
        if r["pos"] not in POS:
            errors.append(f"{where}: pos must be one of {sorted(POS)}")
        if not (isinstance(r["en"], list) and r["en"] and all(isinstance(e, str) and e.strip() for e in r["en"])):
            errors.append(f"{where}: en must be a non-empty list of strings")
        if not isinstance(r["alt"], list):
            errors.append(f"{where}: alt must be a list")
        if r["pos"] == "noun":
            if r["art"] not in ("der", "die", "das"):
                errors.append(f"{where}: noun needs art der/die/das")
            if not r["w"][:1].isupper():
                errors.append(f"{where}: noun must be capitalized")
            if not isinstance(r["pl"], str):
                errors.append(f"{where}: noun pl must be a string (plural form, or '' if none)")
            if re.match(r"(der|die|das)\s", r["w"]):
                errors.append(f"{where}: put the article in art, not in w")
        else:
            if r["art"] != "" or r["pl"] is not None:
                errors.append(f"{where}: non-nouns need art '' and pl null")
        if not (r["ex"].strip() and r["exen"].strip()):
            errors.append(f"{where}: ex and exen required")
        elif r["pos"] != "phrase" and r["w"].split()[0].lower()[:4] not in r["ex"].lower():
            warnings.append(f"{where}: example may not contain the word: {r['ex']!r}")
        k = key(r)
        if k in seen:
            errors.append(f"{where}: duplicate of [{seen[k]}] in this slice")
        seen[k] = i

    for other in sorted(path.parent.glob("*.json")):
        if other == path:
            continue
        try:
            odata = json.loads(other.read_text())
        except json.JSONDecodeError:
            continue
        for r in odata:
            if isinstance(r, dict) and "w" in r and "pos" in r and key(r) in seen:
                warnings.append(f"{r['w']!r}: also in {other.stem} (level {r.get('level')})")

    seed = {(s["w"].lower(), s["pos"] if s["pos"] == "noun" else ""): s
            for s in json.loads((ROOT / "data/words/seed_de.json").read_text())}
    for r in data:
        s = seed.get(key(r)) if isinstance(r, dict) and "w" in r else None
        if s and s["art"] and r.get("art") != s["art"]:
            errors.append(f"{r['w']!r}: article {r.get('art')} conflicts with his decks ({s['art']})")

    counts = {}
    for r in data:
        counts[r.get("theme")] = counts.get(r.get("theme"), 0) + 1
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    print(f"{name}: {len(data)} words, {len(errors)} error(s), {len(warnings)} warning(s); per theme {counts}")
    return not errors


if __name__ == "__main__":
    ok = all([check(p) for p in sys.argv[1:]])
    sys.exit(0 if ok else 1)
