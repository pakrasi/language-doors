# Igloo

Igloo is a static site for learning languages with one reusable framework: the same doors, turns and glue in every language.

- **Doors**: verb frames with one open slot (*I want to ___*).
- **Turns**: the same door rotated through time, polarity and mood.
- **Glue**: connectors and prepositions, and the word-order rule each triggers.
- **Slots**: what happens inside the slot (pronouns, articles, gender, case, agreement) plus the lexicon.
- **Functions**: what you are doing with the sentence (decline, suggest, complain). Functions pick recipes; recipes name doors and glue by ID.
- **Chunks**: fixed phrases with no slot.

Ten languages. The homepage shows all ten; in the app, Look up grammar and Write cover five (Khasi, German, Hindi, French, Swiss German) and the other five (Bengali, Spanish, Italian, Portuguese, Arabic) have phrases only for now. Five levels, A1 to C1.

## Pages

- `index.html` (homepage): a Today panel for returning visitors (reviews due per language, new cards left, one-tap Start), one sentence in all ten languages, and How it works: change the sentence, word order compared with English, "go" in nine tenses, the parts, and links into the app.
- `app.html`: Drill, Test, Look up (Phrases, Verb frames, Linking words, Grammar, Notes, with one search across all of them) and Write. Hashes: `#drill`, `#drill/start`, `#test`, `#test/placement`, `#test/sweep/<level>`, `#lookup/<tab>`, `#write/<SC-id>`.

Old links still work: the homepage forwards app-style hashes (`index.html#drill/B1/german`, `#reference/...`, `#chunks/...`, `#practice/...`) to `app.html`, which maps the old view names; `#framework` goes to How it works; `explore.html` redirects to the homepage.

## Layout

```
index.html, home.css, home.js      homepage
app.html, app.css, app.js          Drill, Test, Look up, Write
match.js                           answer checker for typed answers (articles, umlaut spellings, typos, phrase variants)
readiness.js                       per-level readiness score, coverage, estimate range, gaps
tokens.css, site.js                shared: colour tokens, controls, site bar, settings, languages sheet
data/framework.json                language-neutral master: layers, levels, item IDs, 30 scenarios
data/<lang>.json                   one file per language, same IDs
data/turns.json                    "go" in nine tenses for all ten languages (built, see below)
data/sentences/                    sentence bank for the homepage and Drill (en.json built by a script)
data/chunks/                       the phrase bank (1,450 phrases); priority_de.json tags B1 exam phrases
data/words/de.json                 German words A1-C2 (built from data/words/parts/de/, see below)
data/grammar/                      German grammar concepts and typed items
scripts/build_framework.py         regenerates framework.json from the tuples inside it
scripts/build_turns.py             builds data/turns.json from each turnGrid plus authored status/marker/alt, and from data/turns_src/
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

If you change a language's `turnGrid` or a file in `data/turns_src/`, rerun `python3 scripts/build_turns.py`. It copies gloss and note, and checks that every authored marker is still a run of whole words in its form.

## Words and grammar (German)

`data/words/de.json` is built from eight slices in `data/words/parts/de/` (A1, A2, B1a, B1b, B2a, B2b, C1, C2), written to `scripts/WORDS_BRIEF.md`:

```
python3 scripts/seed_words_de.py                  # words from Anki, b1-exam and the site lexicon -> data/words/seed_de.json
python3 scripts/check_word_part.py data/words/parts/de/*.json
~/.venvs/igloo/bin/python scripts/build_words_de.py   # needs wordfreq; merges, ranks, reports unplaced seed words
```

Word ids come from the word itself (`der_Tisch`, `gehen.verb`, `Sie.pron`), because progress is stored under them; don't renumber. Grammar concepts come from Fritz (`fritz.db`) plus a few added ones; items follow `scripts/GRAMMAR_BRIEF.md` and are checked by `python3 scripts/validate_grammar.py`. Tests: `node scripts/test_match.mjs` and `node scripts/test_readiness.mjs`.

## Test

Type the German for an English prompt. Right on the first try within the time limit (10 seconds, set in Settings) counts as known; right on the second try, slower, or one letter off counts as shaky. Nouns need the article; a wrong article is counted separately. Placement walks up from A1 (10 words, 6 phrases, 4 grammar items per level) and stops below 80%. Sweep goes through every untested item of one level. Known items get a review scheduled 7 days out; missed ones are queued for Drill.

Readiness per level = 35% words (weighted by frequency) + 35% phrases (B1 exam phrases count most) + 30% grammar concepts. Untested items count as not known, and the estimate range extrapolates from what has been tested.

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

`doors.srs.v1` (reviews), `doors.know.v1` (Test results), `doors.progress.v1` (writing), `doors.prefs.v2` (languages, level, theme, view settings), `doors.apikey`, `doors.days.v1`, `doors.today.v1`, `doors.prismSeen`. Settings has Export progress (JSON) and Delete all progress, which asks first.
