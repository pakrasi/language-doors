#!/usr/bin/env python3
"""Check data/chunks/accept/<lang>/*.json (accepted typed answers per phrase).

    python3 scripts/validate_accept.py german [part]      # one part file, or all parts
    python3 scripts/validate_accept.py german --assemble  # all parts -> data/chunks/accept_<lang>.json

Entry: {"ENG_CHUNK_0301": {"core_en": "how do you know", "accept": ["woher kennst du [x]", "woher kennen Sie [x]"]}}
"weak": true marks a phrase whose German is a single generic word ("oder", "also"); the typed Test skips it.

Pattern rules (match.js implements the same):
  - case and punctuation are ignored; ae/oe/ue/ss == ä/ö/ü/ß
  - "(word word)" = optional words
  - "[anything]" = a slot: 1 to 6 words
  - a pattern matches if it appears anywhere in the answer (the answer may add context around it)
"""
import json, re, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def norm(s):
    s = unicodedata.normalize("NFC", s).lower()
    s = s.replace("ä", "ae").replace("ö", "oe").replace("ü", "ue").replace("ß", "ss")
    s = re.sub(r"[^\w\s\[\]()'’-]", " ", s)
    return " ".join(s.replace("’", "'").split())


def to_regex(pattern):
    p = norm(pattern)
    out = []
    toks = re.findall(r"\[[^\]]*\]|\([^)]*\)|[^\s\[\]()]+", p)
    for tok in toks:
        if tok.startswith("["):
            out.append(r"(?:\S+(?: \S+){0,5})")
        elif tok.startswith("("):
            inner = " ".join(re.escape(w) for w in tok[1:-1].split())
            out.append(f"(?:{inner})?" if inner else "")
        else:
            out.append(re.escape(tok))
    # optional groups may be absent, so spacing between fixed parts is flexible;
    # a slot must be separated from its neighbours by whitespace (no half-word slots)
    parts = [(x, tok.startswith("[")) for x, tok in zip(out, toks) if x]
    body = ""
    for i, (x, is_slot) in enumerate(parts):
        if i:
            body += r"\s+" if (is_slot or parts[i - 1][1]) else r"\s*"
        body += x
    return re.compile(r"(?:^|\s)" + body + r"(?:\s|$)")


def matches(answer, pattern):
    return bool(to_regex(pattern).search(" " + norm(answer) + " "))


def load(lang):
    en = {c["id"]: c for c in json.loads((ROOT / "data/chunks/en.json").read_text())}
    tr = json.loads((ROOT / f"data/chunks/{lang}.json").read_text())["chunks"]
    return en, tr


def check_part(path, en, tr):
    data = json.loads(Path(path).read_text())
    errors, warnings = [], []
    for cid, e in data.items():
        if cid not in en:
            errors.append(f"{cid}: unknown id")
            continue
        if not {"core_en", "accept"} <= set(e) <= {"core_en", "accept", "weak"}:
            errors.append(f"{cid}: keys must be core_en, accept (and optional weak)")
            continue
        ex_en = en[cid]["natural_example"]
        if e["core_en"].lower() not in ex_en.lower():
            errors.append(f"{cid}: core_en {e['core_en']!r} is not in the English example {ex_en!r}")
        acc = e["accept"]
        if not (isinstance(acc, list) and acc and all(isinstance(a, str) and a.strip() for a in acc)):
            errors.append(f"{cid}: accept must be a non-empty list of strings")
            continue
        if len(acc) != len({norm(a) for a in acc}):
            warnings.append(f"{cid}: duplicate patterns")
        for a in acc:
            if a.count("(") != a.count(")") or a.count("[") != a.count("]"):
                errors.append(f"{cid}: unbalanced brackets in {a!r}")
            if not re.sub(r"\[[^\]]*\]|\([^)]*\)", "", a).strip(" .,!?"):
                errors.append(f"{cid}: pattern {a!r} has no fixed words")
        ex_de = tr.get(cid, {}).get("ex", "")
        if ex_de and not any(matches(ex_de, a) for a in acc):
            errors.append(f"{cid}: the German example does not match any pattern: {ex_de!r}")
    return data, errors, warnings


def main():
    lang = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else None
    en, tr = load(lang)
    pdir = ROOT / f"data/chunks/accept/{lang}"
    parts = [pdir / f"{arg}.json"] if arg and arg != "--assemble" else sorted(pdir.glob("*.json"))
    merged, errs = {}, 0
    for p in parts:
        data, errors, warnings = check_part(p, en, tr)
        for w in warnings:
            print("WARN ", w)
        for e in errors:
            print("ERROR", e)
        errs += len(errors)
        print(f"{p.name}: {len(data)} phrases, {len(errors)} error(s), {len(warnings)} warning(s)")
        merged.update(data)
    if arg == "--assemble":
        missing = [c for c in en if c not in merged]
        if missing:
            print(f"ERROR {len(missing)} phrases have no entry, e.g. {missing[:10]}")
            errs += 1
        if not errs:
            out = ROOT / f"data/chunks/accept_{lang}.json"
            out.write_text(json.dumps(merged, ensure_ascii=False, separators=(",", ":")) + "\n")
            print(f"wrote {out.relative_to(ROOT)} ({len(merged)} phrases)")
    sys.exit(1 if errs else 0)


if __name__ == "__main__":
    main()
