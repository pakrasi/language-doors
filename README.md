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

Phrase answers for the typed Test are in `data/chunks/accept_german.json` (per phrase: the English span to highlight and the German patterns that count, with `(optional)` words and `[slot]`s; `weak` phrases are skipped). Edit the parts in `data/chunks/accept/german/`, written to `scripts/ACCEPT_BRIEF.md`, then run `python3 scripts/validate_accept.py german --assemble`. `node scripts/test_match.mjs` checks that match.js agrees with the Python reference.

## Test

Type the German for an English prompt. Right on the first try, spelled right and within the time limit counts as known; right on a later try, slower, or with a typo counts as shaky. The limit is 10 seconds for words (Settings); phrases and grammar add 0.5 s per character of the model answer beyond 12, up to 30 s. Nouns are asked as "the car" (der/die/das) or, for about 30% of countable nouns, "a car" (ein/eine; the definite form also counts). A wrong article is counted separately.

Phrases with an entry in `data/chunks/accept_german.json` (built from `data/chunks/accept/german/*.json` by `scripts/validate_accept.py german --assemble`; see `scripts/ACCEPT_BRIEF.md`) highlight `core_en` in the English sentence and are graded on that part only: any accept pattern anywhere in the answer counts. Phrases without an entry are graded on the whole example sentence. `match.js` checks word by word: each word may be a small typo away (0 edits up to 3 letters, 1 for 4-7, 2 for 8+), but articles, pronouns, prepositions and a few grammar words (dass, sind, ...) never count as typos. Gap items take the missing word or the whole phrase with the gap filled; in grammar items only words carried over from the prompt may have typos. With an API key set, close answers to phrases and grammar get an "Ask Claude" button (or are checked automatically, a setting). Placement walks up from A1 (10 words, 6 phrases, 4 grammar items per level) and stops below 80%. Sweep goes through every untested item of one level. Known items get a review scheduled 7 days out; missed ones are queued for Drill.

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

## B1 trainer (`app.html#b1`)

Goethe B1 exam practice in German: typed rounds with a soft timer, FSRS scheduling capped at the exam date, sticky-error hints, Situations (topic match), Exam words, Say it aloud and the Teil 2 talk.

**Files**

- `b1.js`: data, pools, round composer, grading glue, hub, area pages, done screen, settings section.
- `b1round.js`: the round screen (docked input, feedback states, retype, reinsertion).
- `b1more.js`: Exam words, Say it aloud with the mic check, and the Teil 2 talk.
- Pure modules (no DOM), tested in node:
  - `match.js`: matching.
  - `detect.js`: trap detectors.
  - `speech.js`: transcript cleanup and spoken grading.
  - `fsrs.js`: scheduling.
  - `b1day.js`: local day with a 04:00 cutoff, exam phases.
  - `timer.js`: time limits.
  - `b1ready.js`: readiness.
- `b1.css`: styles. `sw.js`: offline service worker.
- `data/b1/src/*.json`: authored items. Edit these, never the built files.
- `data/b1/`: built runtime data: `items.json`, `annot.json`, `grammar.json`, `bank.json`, `nouns.json`, `frames.json`, `wordmap.json`. `plan.json` is the hand-edited plan (topics, traps, functions, scenarios).

Exam words are not in this repo. They are read at runtime from the private `pakrasi/b1-exam` repo with the GitHub token that the b1-exam app stores in this browser (`gh:token`).

**Build and validate**

```
python3 scripts/validate_b1.py data/b1/src/<file>.json   # one content file
python3 scripts/validate_b1.py --all                     # every src file + coverage report
python3 scripts/build_b1.py                              # src → data/b1/*.json (stops on any error)
```

**Gates** (all must pass before a deploy; the server runs on :8430 with `python3 -m http.server 8430`)

```
node scripts/test_match.mjs      # matcher; every B1 model matches and every wrong answer fails
node scripts/test_b1.mjs         # day, FSRS, timer, detectors (JS = Python, 0 fires on right sentences), speech, readiness
bash scripts/b1_regress.sh       # Igloo Test and Drill unchanged (headless WebKit, baseline in scripts/baselines/ui.json)
```

Then do a full round on `http://localhost:8430/app.html?b1auto=40#b1/round` (localhost only: it answers 40 items, every fifth one wrong) and check that there are no console errors.

**Deploy**

Run `bash scripts/bump_v.sh` before every deploy. It sets one version everywhere: `V` in `site.js`, every `?v=` in `app.html`/`index.html`, `sw.js` and `version.json`. Phones then pick up the new files from the B1 hub. Without the bump they keep the cached data.

**Stored**

`doors.b1.*`: `fsrs.v1`, `round.v1`, `day.v1`, `days.v1`, `settings.v1`, `words.v1` (exam-word cache), `cal.v1` (mic check), `teil2.v1`, `variants.v1`, `backup.v1`. B1 reads Igloo's `doors.srs.v1`/`doors.know.v1` once to seed itself and never writes them.

## Saved in the browser

`doors.srs.v1` (reviews), `doors.know.v1` (Test results), `doors.progress.v1` (writing), `doors.prefs.v2` (languages, level, theme, view settings), `doors.apikey`, `doors.days.v1`, `doors.today.v1`, `doors.prismSeen`. Settings has Export progress (JSON) and Delete all progress, which asks first.
