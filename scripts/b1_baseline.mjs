// node scripts/b1_baseline.mjs [--write]  — no-regression check for Igloo Test grading while B1 changes match.js.
// Rebuilds every Test item (words, phrases with accept patterns, grammar) the way app.js does (wordItem, chunkItem,
// grammarItem) and grades a fixed set of inputs per item with Test's options. --write saves the results as the
// baseline; without it, the results must equal scripts/baselines/test_match.json.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const M = require('../match.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const items = [];
for (const w of J('data/words/de.json')) {
  const form = M.nounForm(w);
  const accepted = M.acceptedForWord(w, form);
  items.push({ id: 'W:' + w.id, accepted, opts: { pos: w.pos }, answer: accepted[0] });
}
const en = J('data/chunks/en.json'), de = J('data/chunks/german.json').chunks, acc = J('data/chunks/accept_german.json');
for (const c of en) {
  const r = de[c.id]; if (!r) continue;
  const a = acc[c.id];
  if (a && a.accept?.length && a.core_en && c.natural_example.toLowerCase().includes(String(a.core_en).toLowerCase()))
    items.push({ id: 'K:' + c.id, accepted: a.accept, opts: { anywhere: true }, answer: r.ex || M.renderPattern(a.accept[0], r.ex) });
  else items.push({ id: 'K:' + c.id, accepted: M.acceptedForChunk(r.t, r.ex), opts: {}, answer: r.ex });
}
for (const it of J('data/grammar/items_de.json')) {
  const ans = Array.isArray(it.answer) ? it.answer : [it.answer];
  const gap = String(it.prompt).includes('___');
  const opts = { strictCase: !!it.strict_case };
  if (gap || it.kind !== 'translate') opts.loose = M.gapLoose(it.prompt);
  const lead = (String(it.prompt).match(/→\s*(.+?)\s*…\s*$/) || [])[1];
  const short = lead ? ans.filter(a => a.startsWith(lead)).map(a => a.slice(lead.length).trim()).filter(Boolean) : [];
  items.push({ id: 'G:' + it.id, accepted: gap ? M.acceptedForGap(it.prompt, ans) : [...ans, ...short], opts, answer: ans[0] });
}

const UML = { 'ä': 'a', 'ö': 'o', 'ü': 'u', 'Ä': 'A', 'Ö': 'O', 'Ü': 'U' };
const inputs = a => {
  const s = String(a || '');
  const ws = s.split(' '); const k = ws.reduce((b, w, i) => w.length > ws[b].length ? i : b, 0);
  const drop = ws.map((w, i) => i === k && w.length > 3 ? w.slice(0, -2) + w.slice(-1) : w).join(' ');
  return [s, M.fold(s), s.toLowerCase(), s.replace(/[äöüÄÖÜ]/g, c => UML[c]), drop, 'Ich ' + s, 'weiss nicht'];
};
const out = {};
for (const it of items) {
  out[it.id] = inputs(it.answer).map(x => {
    const r = M.check(x, it.accepted, it.opts);
    return `${+r.ok}${+r.exact}${+r.close}${+r.articleMiss}${+r.caseMiss}${r.typos.length}:${r.fixed}`;
  }).join('|');
}
const file = path.join(ROOT, 'scripts/baselines/test_match.json');
const hash = createHash('sha256').update(JSON.stringify(out)).digest('hex').slice(0, 16);
if (process.argv.includes('--write')) {
  writeFileSync(file, JSON.stringify({ hash, n: items.length, results: out }) + '\n');
  console.log(`baseline written: ${items.length} items, hash ${hash}`);
} else {
  const base = JSON.parse(readFileSync(file, 'utf8'));
  const diff = Object.keys(base.results).filter(k => base.results[k] !== out[k]);
  if (diff.length || base.n !== items.length) {
    console.error(`Test grading changed on ${diff.length} item(s) (baseline ${base.n}, now ${items.length}):`);
    for (const k of diff.slice(0, 15)) console.error(`  ${k}\n    was ${base.results[k]}\n    now ${out[k]}`);
    process.exit(1);
  }
  console.log(`Test grading unchanged: ${items.length} items × 7 inputs (hash ${hash})`);
}
