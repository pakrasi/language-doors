#!/usr/bin/env python3
"""Merge data/words/parts/de/*.json into data/words/de.json.

Run with the venv that has wordfreq:  ~/.venvs/igloo/bin/python scripts/build_words_de.py

- Duplicates across slices keep the lowest level.
- `id` is stable across rebuilds (derived from the word, not its position), because the
  learner's progress is stored under it: "das_Essen" for nouns, "essen.verb" for everything else.
- `zipf` = corpus frequency (wordfreq); `rank` = order within its level, blending the agents'
  usefulness order (60%) with frequency (40%).
  Non-noun ids carry the part of speech ("laut.adj" vs "laut.prep").
- `mine` = the word is in his Anki decks or the b1-exam app (data/words/seed_de.json).
- Reports seed words no slice placed, and words whose level is far from their frequency.
"""
import json, re, sys
from pathlib import Path

try:
    from wordfreq import zipf_frequency
except ImportError:
    sys.exit("wordfreq missing: run with ~/.venvs/igloo/bin/python")

ROOT = Path(__file__).resolve().parent.parent
PARTS = ROOT / "data/words/parts/de"
OUT = ROOT / "data/words/de.json"
LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"]
# rough zipf band per level, for flagging only
BAND = {"A1": 4.3, "A2": 3.9, "B1": 3.5, "B2": 3.1, "C1": 2.7, "C2": 2.2}


def key(r):
    # pronouns keep their case: "Sie" (formal you) and "sie" (she/they) are different words
    return (r["w"] if r["pos"] == "pron" else r["w"].lower(), r["pos"])


def loose(w):
    """Spelling key for matching seed words: no 'sich', no trailing punctuation or '-'."""
    w = re.sub(r"^sich\s+", "", w.strip().lower())
    return re.sub(r"[.!?\-]+$", "", w).strip()


def make_id(r):
    base = re.sub(r"[^\wäöüß]+", "_", r["w"].strip()).strip("_")
    if r["pos"] == "noun":
        return f"{r['art']}_{base}"
    # pronouns keep their case so "Sie.pron" and "sie.pron" stay distinct
    return f"{base if r['pos'] == 'pron' else base.lower()}.{r['pos']}"


def zipf(r):
    words = r["w"].split()
    if r["pos"] == "verb" and words[0] == "sich":
        words = words[1:]
    return round(min(zipf_frequency(w, "de") for w in words) if words else 0, 2)


def main():
    rows = {}
    for p in sorted(PARTS.glob("*.json")):
        for i, r in enumerate(json.loads(p.read_text())):
            r = dict(r, _slice=p.stem, _pos=i)
            k = key(r)
            if k not in rows or LEVELS.index(r["level"]) < LEVELS.index(rows[k]["level"]):
                rows[k] = r

    seed = json.loads((ROOT / "data/words/seed_de.json").read_text())
    # seed pos is rough (lexicon rows are often "other"), so match non-nouns on spelling alone
    placed = {loose(r["w"]) for r in rows.values()}
    mine = {loose(s["w"]) for s in seed if {"anki", "b1exam"} & set(s["src"])}
    unplaced = [s["w"] for s in seed if loose(s["w"]) not in placed]

    out, flags = [], []
    for level in LEVELS:
        items = [r for r in rows.values() if r["level"] == level]
        if not items:
            continue
        for r in items:
            r["zipf"] = zipf(r)
        n = len(items)
        # two half-slices at the same level (B1a/B1b) interleave by their own position
        slice_len = {s: sum(r["_slice"] == s for r in items) for s in {r["_slice"] for r in items}}
        agent_rank = {id(r): r["_pos"] / slice_len[r["_slice"]] for r in items}
        freq_rank = {id(r): i / n for i, r in enumerate(sorted(items, key=lambda r: -r["zipf"]))}
        items.sort(key=lambda r: 0.6 * agent_rank[id(r)] + 0.4 * freq_rank[id(r)])
        for i, r in enumerate(items, 1):
            row = {"id": make_id(r), "w": r["w"], "art": r["art"], "pl": r["pl"], "pos": r["pos"],
                   "en": r["en"], "alt": r["alt"], "level": level, "theme": r["theme"],
                   "rank": i, "zipf": r["zipf"], "ex": r["ex"], "exen": r["exen"]}
            if r.get("forms"):
                row["forms"] = r["forms"]
            if loose(r["w"]) in mine:
                row["mine"] = True
            out.append(row)
            # rare word at a low level, or very common word at a high level
            lo = LEVELS.index(level) <= 2 and r["zipf"] < BAND[level] - 1.5
            hi = LEVELS.index(level) >= 3 and r["zipf"] > BAND[level] + 1.5
            if r["pos"] != "phrase" and r["zipf"] and (lo or hi):
                flags.append(f"{level} {r['w']} zipf {r['zipf']}")

    ids = [r["id"] for r in out]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        sys.exit(f"duplicate ids: {sorted(dup)[:20]}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n")

    counts = {lv: sum(r["level"] == lv for r in out) for lv in LEVELS}
    print(f"{len(out)} words -> {OUT.relative_to(ROOT)}  {counts}  mine={sum('mine' in r for r in out)}")
    print(f"seed words not placed: {len(unplaced)}" + (f": {unplaced}" if unplaced else ""))
    print(f"level/frequency mismatches to review: {len(flags)}" + (f": {flags}" if flags else ""))


if __name__ == "__main__":
    main()
