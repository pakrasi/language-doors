# Doors and Glue

A reusable framework for learning any language, as a static site.

- **Doors**: verb frames with one open slot (*I want to ___*).
- **Turns**: the same door rotated through time, polarity and mood.
- **Glue**: connectors and prepositions, and the word-order rule each triggers.
- **Slots**: what happens inside the slot (pronouns, articles, gender, case, agreement) plus the lexicon.
- **Functions**: what you are doing with the sentence (decline, suggest, complain). Functions pick recipes; recipes name doors and glue by ID.
- **Chunks**: fixed phrases with no slot.

Ten languages: five full (Khasi, German, Hindi, French, Swiss German) and five with phrases only for now (Bengali, Spanish, Italian, Portuguese, Arabic). Five levels, A1 to C1.

## Pages

- `index.html` (homepage): a Today panel for returning visitors (reviews due per language, new cards left, one-tap Start), one sentence in five languages, and How it works: change the sentence, word order compared with English, "go" in nine tenses, the parts, and links into the app.
- `app.html`: Drill, Look up (Phrases, Verb frames, Linking words, Grammar, Notes, with one search across all of them) and Write. Hashes: `#drill`, `#drill/start`, `#lookup/<tab>`, `#write/<SC-id>`.

Old links still work: the homepage forwards app-style hashes (`index.html#drill/B1/german`, `#reference/...`, `#chunks/...`, `#practice/...`) to `app.html`, which maps the old view names; `#framework` goes to How it works; `explore.html` redirects to the homepage.

## Layout

```
index.html, home.css, home.js      homepage
app.html, app.css, app.js          Drill, Look up, Write
tokens.css, site.js                shared: colour tokens, controls, site bar, settings, languages sheet
data/framework.json                language-neutral master: layers, levels, item IDs, 30 scenarios
data/<lang>.json                   one file per language, same IDs
data/turns.json                    "go" in nine tenses for the five full languages (built, see below)
data/sentences/                    sentence bank for the homepage and Drill (en.json built by a script)
data/chunks/                       the phrase bank (1,450 phrases)
scripts/build_framework.py         regenerates framework.json from the tuples inside it
scripts/build_turns.py             builds data/turns.json from each turnGrid plus authored status/marker/alt
scripts/build_sentences_en.py      builds data/sentences/en.json (English tokens, roles, hints)
scripts/validate.py                checks a language file against the master
scripts/validate_sentences.py      checks a data/sentences/<lang>.json file
scripts/AGENT_BRIEF.md             the spec each language file was written to
```

Data files are fetched with a `?v=` version string (`V` in `site.js`; the script and stylesheet tags carry the same string). Bump it when you change data or code so browsers fetch the new files.

## Editing content

Fix a wrong form directly in `data/<lang>.json`, then run:

```
python3 scripts/validate.py data/<lang>.json
```

To add a door, glue, chunk or scenario, add it in `scripts/build_framework.py`, rebuild, and add the matching entry to every language file (the validator will list what is missing).

If you change a language's `turnGrid`, rerun `python3 scripts/build_turns.py`. It copies gloss and note, and checks that every authored marker is still a run of whole words in its form.

## Local preview

```
python3 -m http.server 8430
```

then open http://localhost:8430/ (homepage) or http://localhost:8430/app.html.

## Drill

Say the English sentence out loud in the language shown, then show the answer and grade it: Space to show, Space again for Good, 1 to 4 for Again / Hard / Good / Easy, H for a hint, P to hear it, U to undo, Esc to end. On phones, tap the card, then tap a grade.

Scheduling is SM-2 style per language per card, stored in localStorage under `doors.srs.v1`. Due reviews always come from those keys, whatever the level or card types chosen; the level and card types only decide which new cards are introduced. New cards are limited per language per day (10 by default, in Settings; counted in `doors.today.v1`). Languages keep the order you set in the Languages sheet; the first one leads. Days practised are logged in `doors.days.v1` for the streak.

## Write

Scenario writing with a built-in key-word check and an optional "Check with Claude" button, which needs an Anthropic API key in Settings. The key is stored in this browser (`doors.apikey`) and sent only to api.anthropic.com. A rating in Write also updates the Drill schedule for that situation.

## Saved in the browser

`doors.srs.v1` (reviews), `doors.progress.v1` (writing), `doors.prefs.v2` (languages, level, theme, view settings), `doors.apikey`, `doors.days.v1`, `doors.today.v1`, `doors.prismSeen`. Settings has Export progress (JSON) and Delete all progress, which asks first.
