# Doors and Glue

A reusable framework for learning any language, as a static site.

- **Doors**: verb frames with one open slot (*I want to ___*).
- **Turns**: the same door rotated through time, polarity and mood.
- **Glue**: connectors and prepositions, and the word-order rule each triggers.
- **Slots**: what happens inside the slot (pronouns, articles, gender, case, agreement) plus the lexicon.
- **Functions**: what you are doing with the sentence (decline, suggest, complain). Functions pick recipes; recipes name doors and glue by ID.
- **Chunks**: fixed phrases with no slot.

Nine languages (German, French, Spanish, Italian, Portuguese, Hindi, Bengali, Khasi, Arabic), five levels (A1 to C1), three views (Reference, Practice, Glossary).

## Prism

`explore.html` is the interactive companion: one meaning refracted into five languages, a machine that turns it (time, negation, question, glue) with animated token motion and hover-alignment, ribbons showing word-order crossings, and a dial for the GO door across nine tense cells. Its data is `data/sentences/en.json` (the role-tagged English spec, built by `scripts/build_sentences_en.py`) plus one `data/sentences/<lang>.json` per language, validated by `scripts/validate_sentences.py`.

## Layout

```
index.html, styles.css, app.js     the site, no build step
data/framework.json                language-neutral master: layers, levels, 284 item IDs, 30 scenarios
data/<lang>.json                   one file per language, same IDs
scripts/build_framework.py         regenerates framework.json from the tuples inside it
scripts/validate.py                checks a language file against the master
scripts/AGENT_BRIEF.md             the spec each language file was written to
```

## Editing content

Fix a wrong form directly in `data/<lang>.json`, then run:

```
python3 scripts/validate.py data/<lang>.json
```

To add a door, glue, chunk or scenario, add it in `scripts/build_framework.py`, rebuild, and add the matching entry to every language file (the validator will list what is missing).

## Local preview

```
python3 -m http.server 8430
```

then open http://localhost:8430/.

## Drill

Production practice, keyboard-paced: a meaning in English, say it out loud in the language shown, Space to reveal, Space again to grade Good and move on (1 to 4 for Again / Hard / Good / Easy, H for a hint, P to hear it, U to undo, Esc to end). One meaning is cycled through all selected languages in order. Cards come from door chunks, example sentences plus the Prism sentence bank, and scenarios. Scheduling is SM-2 style per language per card, stored in localStorage under `doors.srs.v1`. On phones, tap the card to reveal and tap a grade.

## Practice checker

The Practice page has a built-in checker (key-word match against the model answer) and an optional "Check with Claude" button. The latter needs an Anthropic API key entered in Settings; it is stored in the browser's localStorage and sent only to api.anthropic.com.
