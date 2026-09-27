# Doors and Glue

A reusable framework for learning any language, as a static site.

- **Doors**: verb frames with one open slot (*I want to ___*).
- **Turns**: the same door rotated through time, polarity and mood.
- **Glue**: connectors and prepositions, and the word-order rule each triggers.
- **Slots**: what happens inside the slot (pronouns, articles, gender, case, agreement) plus the lexicon.
- **Functions**: what you are doing with the sentence (decline, suggest, complain). Functions pick recipes; recipes name doors and glue by ID.
- **Chunks**: fixed phrases with no slot.

Nine languages (German, French, Spanish, Italian, Portuguese, Hindi, Bengali, Khasi, Arabic), five levels (A1 to C1), three views (Reference, Practice, Glossary).

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

## Practice checker

The Practice page has a built-in checker (key-word match against the model answer) and an optional "Check with Claude" button. The latter needs an Anthropic API key entered in Settings; it is stored in the browser's localStorage and sent only to api.anthropic.com.
