#!/usr/bin/env python3
"""Collect German words Ishaan already has into data/words/seed_de.json.

Sources (all read-only):
  1. L-* lexicon items in data/german.json ("der Name (name), ...")
  2. ~/pakrasi-lab/b1-exam/data/vocab.json
  3. Anki decks B1-practice and Fritz::Romulo via AnkiConnect (localhost:8765), if running

Output rows: {w, art, pos, en, src:[...], pl?, theme_hint?}. The word agents fold these into
the levelled lists; build_words_de.py marks them `mine` if they came from b1-exam or Anki.
"""
import json, re, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/words/seed_de.json"
B1EXAM = Path.home() / "pakrasi-lab/b1-exam/data/vocab.json"
ART = ("der", "die", "das")
POS_MAP = {"nomen": "noun", "verb": "verb", "adjektiv": "adj", "adverb": "adv", "konnektor": "conj",
           "praeposition": "prep", "phrase": "phrase", "redewendung": "phrase"}
L_THEME = {"L-SELF": "people", "L-FAMILY": "people", "L-FOOD": "food", "L-TIME": "time", "L-PLACES": "city",
           "L-VERBS-CORE": "core", "L-TRAVEL": "travel", "L-SHOPPING": "clothes", "L-HEALTH": "body",
           "L-WORK": "work", "L-WEATHER": "nature", "L-ROUTINE": "home", "L-OPINION": "communication",
           "L-FEELINGS": "feelings", "L-ENVIRONMENT": "science", "L-EDUCATION": "school", "L-HOUSING": "home",
           "L-TECH": "media", "L-ABSTRACT": "abstract", "L-BUSINESS": "work", "L-SOCIETY": "society",
           "L-SCIENCE": "science", "L-CULTURE": "culture"}


def split_article(text):
    parts = text.strip().split(maxsplit=1)
    if len(parts) == 2 and parts[0].lower() in ART:
        return parts[0].lower(), parts[1]
    return "", text.strip()


def add(rows, w, art, pos, en, src, **extra):
    w = w.strip()
    if not w:
        return
    key = (w.lower(), pos if pos == "noun" else "")
    row = rows.setdefault(key, {"w": w, "art": art, "pos": pos, "en": [], "src": []})
    for e in en:
        e = e.strip()
        if e and e not in row["en"]:
            row["en"].append(e)
    if src not in row["src"]:
        row["src"].append(src)
    if art and not row["art"]:
        row["art"] = art
    elif art and row["art"] != art:
        row.setdefault("conflict", []).append(f"{src}: {art}")
    for k, v in extra.items():
        if v and k not in row:
            row[k] = v


def from_lexicon(rows):
    items = json.loads((ROOT / "data/german.json").read_text())["items"]
    for it in items:
        if not it["id"].startswith("L-") or it["id"] not in L_THEME:
            continue
        for m in re.finditer(r"([^,(]+?)\s*\(([^)]*)\)", it["target"]):
            art, w = split_article(m.group(1))
            if len(w.split()) > 3:
                continue
            pos = "noun" if art else ("verb" if w.endswith("en") and w[0].islower() else "other")
            add(rows, w, art, pos, [m.group(2)], "lexicon", theme_hint=L_THEME[it["id"]])


def from_b1exam(rows):
    if not B1EXAM.exists():
        return
    for v in json.loads(B1EXAM.read_text())["words"]:
        pos = POS_MAP.get((v.get("pos") or "").lower(), "other")
        art = (v.get("gender") or "").lower() if pos == "noun" else ""
        if art not in ART:
            art = ""
        w = v.get("lemma") or v["word"]
        w = split_article(w)[1]
        add(rows, w, art, pos, re.split(r"[,;]", v.get("gloss") or ""), "b1exam", pl=v.get("plural"))


def anki(action, **params):
    req = urllib.request.Request("http://localhost:8765", json.dumps(
        {"action": action, "version": 6, "params": params}).encode())
    return json.loads(urllib.request.urlopen(req, timeout=5).read())["result"]


def clean(html):
    html = re.sub(r"\[sound:[^\]]*\]", "", html)
    html = re.sub(r"<[^>]+>", " ", html).replace("&nbsp;", " ")
    return " ".join(html.split())


def from_anki(rows):
    try:
        ids = anki("findNotes", query='"deck:B1-practice" or "deck:Fritz::Romulo"')
    except Exception as e:
        print("Anki not reachable, skipped:", e)
        return
    for n in anki("notesInfo", notes=ids):
        f = n["fields"]
        if "Front" not in f or "Back" not in f:
            continue
        front = clean(f["Front"]["value"])
        front = re.sub(r"\s*\(.*?\)\s*$", "", front)  # drop plural / principal parts
        tags = {t.lower() for t in n["tags"]}
        pos = next((POS_MAP[t] for t in tags if t in POS_MAP), "other")
        art, w = split_article(front)
        if art:
            pos = "noun"
        if len(w.split()) > 4:
            continue
        add(rows, w, art, pos, re.split(r"[,;/]", clean(f["Back"]["value"])), "anki")


rows = {}
from_lexicon(rows)
from_b1exam(rows)
from_anki(rows)
out = sorted(rows.values(), key=lambda r: r["w"].lower())
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
by = {}
for r in out:
    for s in r["src"]:
        by[s] = by.get(s, 0) + 1
print(f"{len(out)} seed words -> {OUT.relative_to(ROOT)}; by source {by}; "
      f"conflicts {sum(1 for r in out if 'conflict' in r)}")
