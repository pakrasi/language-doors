/* B1 trainer: sticky-error detectors. Run on EVERY typed answer, accepted or not (an accepted answer can still hide
   "weil ich muss arbeiten" in a free [x] slot). Pure; window.Detect in the browser, require() in node.
   The verb-final / inversion / v2 rules mirror scripts/validate_b1.py detect(); scripts/test_b1.mjs checks that both
   agree on every model and wrong answer in data/b1/items.json and on Igloo's German example sentences.
   Detect.run(input, item, r) → null | {cls, hint, word}   (r = the Match.check result, optional) */
(function (root) {
  'use strict';
  const norm = s => String(s == null ? '' : s).normalize('NFC').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[’]/g, "'").replace(/[^\p{L}\p{N}_\s\[\]()'-]/gu, ' ').split(/\s+/).filter(Boolean).join(' ');
  const set = s => new Set(norm(s).split(' '));
  const FINITE = set(`bin bist ist sind seid war warst waren habe hab hast hat haben habt hatte hatten kann kannst können
    könnt muss musst müssen will willst wollen soll sollst sollen darf darfst dürfen möchte möchtest möchten werde wirst
    wird werden würde würdest würden könnte könntest könnten hätte hättest hätten wäre wärst wären mag gibt geht kommt
    macht regnet passt klappt sollte sollten solltest wollte wollten konnte konnten musste mussten durfte durften
    mochte mochten wurde wurden gab ging kam`);
  const PRON = set('ich du er sie es wir ihr man das dies jemand niemand');
  const DET = set('der die das den dem des ein eine einen einem einer mein meine meinen dein deine sein seine ihr ihre unser unsere euer eure kein keine dieser diese dieses jede jeder jedes jeden alle viele manche einige beide meisten wenige');
  const SUB = set('dass weil wenn ob obwohl damit sobald bevor nachdem während falls indem sodass seitdem');
  const PARTICLES = set('ab an auf aus ein mit vor zu zurück weg los fest teil statt vorbei hin her nach');
  const PARTS_BY_LEN = [...PARTICLES].sort((a, b) => b.length - a.length);
  // plan.json traps[v2].fronted, longest first (test_b1.mjs checks the two lists are the same)
  let FRONTED = `auf der anderen seite|in meinem heimatland|meiner meinung nach|auf der einen seite|aus diesem grund|vor zwei jahren|am wochenende|schließlich|am anfang|am samstag|außerdem|im sommer|inzwischen|natürlich|vielleicht|zum schluss|am ende|danach|deshalb|deswegen|seitdem|trotzdem|bei uns|gestern|zuerst|zuletzt|früher|leider|morgen|darum|heute|jetzt|dann`
    .split('|').map(norm).sort((a, b) => b.length - a.length);
  const RAW_FRONT = new Map();
  const finiteAny = w => /^[a-z]{2,}(e|st|t|en|n)$/.test(w) && !/(ung|heit|keit|lein)$/.test(w);

  function clauseVerbs(model) {
    const out = new Set();
    for (const clause of String(model || '').split(/[,.;:!?]/)) {
      const toks = norm(clause).split(' ').filter(Boolean);
      if (toks.length && toks.slice(0, -1).some(t => SUB.has(t))) {
        const last = toks[toks.length - 1]; out.add(last);
        const pre = PARTS_BY_LEN.find(p => last.startsWith(p) && last.length > p.length + 2);
        if (pre) out.add(last.slice(pre.length));
      }
    }
    return out;
  }
  function subjectEnd(toks, j, fin) {
    if (j >= toks.length) return null;
    if (DET.has(toks[j]) && j + 1 < toks.length && !fin.has(toks[j + 1])) return j + 2;
    if (PRON.has(toks[j]) || DET.has(toks[j])) return j + 1;
    return null;
  }
  // the word-order classes, with the word to name in the hint
  function order(text, model) {
    const out = [];
    const fin = new Set([...FINITE, ...clauseVerbs(model)]);
    for (const clause of String(text).split(/[,.;:!?]/)) {
      const toks = norm(clause).split(' ').filter(Boolean);
      toks.forEach((t, i) => {
        if (t === 'als') {   // only "als + subject + finite verb + more": "als ich habe die Nachricht bekommen"
          const j = subjectEnd(toks, i + 1, fin);
          if (j != null && j < toks.length - 1 && fin.has(toks[j]) && toks.slice(j + 1).some(r => !fin.has(r))) out.push({ cls: 'verb-final', word: t });
          return;
        }
        if (!SUB.has(t)) return;
        if (i + 1 < toks.length && FINITE.has(toks[i + 1])) return;   // "Damit bin ich …": an adverb
        for (let j = i + 1; j < Math.min(i + 5, toks.length - 1); j++) {
          if (SUB.has(toks[j])) break;
          const rest = toks.slice(j + 1);
          if (fin.has(toks[j]) && !['oder', 'und', 'aber'].includes(rest[0]) && rest.some(r => !fin.has(r))) { out.push({ cls: 'verb-final', word: t }); return; }
        }
        const cl = toks.slice(i + 1);
        if (cl.length >= 3 && PARTICLES.has(cl[cl.length - 1]) && cl.slice(1, -1).some(c => fin.has(c) || finiteAny(c))) out.push({ cls: 'verb-final', word: t });
      });
    }
    for (const sent of String(text).trim().split(/(?<=[.!?])\s+/)) {
      const k = sent.indexOf(',');
      if (k < 0) continue;
      const hd = norm(sent.slice(0, k)).split(' ').filter(Boolean);   // "Wer hat Fragen, kann …" (not a question)
      if (!/\?\s*$/.test(sent) && hd.length >= 3 && hd[0] === 'wer' && fin.has(hd[1]) && hd.slice(2).some(r => !fin.has(r))) out.push({ cls: 'verb-final', word: 'wer' });
      const head = norm(sent.slice(0, k)).split(' ');
      if (!SUB.has(head[0]) || norm(sent.slice(0, k)).includes('oder nicht')) continue;
      const rest = norm(sent.slice(k + 1)).split(' ').filter(Boolean);
      const j = subjectEnd(rest, 0, fin);
      if (j != null && j < rest.length && (fin.has(rest[j]) || finiteAny(rest[j]))) out.push({ cls: 'inversion', word: head[0] });
    }
    for (const sent of String(text).trim().split(/(?<=[.!?])\s+/)) {
      const n = norm(sent);
      const f = FRONTED.find(f => n.startsWith(f + ' '));
      if (!f) continue;
      const rest = n.slice(f.length).split(' ').filter(Boolean);
      const j = subjectEnd(rest, 0, fin);
      if (j != null && j < rest.length && (fin.has(rest[j]) || finiteAny(rest[j]))) out.push({ cls: 'v2', word: sent.trim().split(/[\s,]+/).slice(0, f.split(' ').length).join(' ') });
    }
    return out;
  }
  // the same classes as validate_b1.detect(text, model), as a sorted array (for the parity test)
  const classes = (text, model) => [...new Set(order(text, model).map(x => x.cls))].sort();

  const NEUTER_END = /(ma|um|ment|chen|lein)$/i;
  const WRONG_FOR_NEUTER = new Set(['der', 'die', 'den', 'eine', 'einen', 'einer']);
  const NEUTER_ART = new Set(['das', 'dem', 'des', 'ein', 'einem', 'eines']);
  const words = s => [...String(s).matchAll(/[\p{L}\p{N}_'-]+/gu)].map(m => m[0]);
  const focusHas = (item, c) => item && (item.trap === c || (item.focus || []).includes(c));
  const it = w => `*${w}*`;

  function run(input, item = {}, r = null) {
    const text = String(input || '');
    if (!text.trim()) return null;
    const model = item.model || '';
    const o = order(text, model);
    const pick = c => o.find(x => x.cls === c);
    let x;
    if ((x = pick('verb-final'))) return { cls: 'verb-final', word: x.word, hint: `Check where the verb goes after ${it(x.word)}.` };
    if ((x = pick('inversion'))) return { cls: 'inversion', word: x.word, hint: 'Check the word order after the comma.' };
    if ((x = pick('v2'))) return { cls: 'v2', word: x.word, hint: `Check the word order after ${it(x.word)}.` };
    // für / vor where the model has the other one (fear and warning take vor)
    const mw = words(model).map(w => w.toLowerCase()), iw = words(text).map(w => w.toLowerCase());
    if (focusHas(item, 'fuer-vor') || /\b(angst|warnen|warnt|schämen|schäme|fürchten)\b.*\bvor\b/i.test(model)) {
      for (const [want, bad] of [['vor', 'für'], ['für', 'vor']]) {
        if (mw.includes(want) && !iw.includes(want) && iw.includes(bad)) {
          const k = iw.indexOf(bad), prev = k > 0 ? words(text)[k - 1] : null;
          return { cls: 'fuer-vor', word: prev, hint: prev ? `Check the preposition after ${it(prev)}.` : 'Check the preposition.' };
        }
      }
    }
    // a neuter noun of the model (-ma, -um, -ment, -chen, nouns made from verbs) with a masculine or feminine article
    const MW = words(model);
    for (let k = 1; k < MW.length; k++) {
      const noun = MW[k], art = MW[k - 1].toLowerCase();
      if (!/^\p{Lu}/u.test(noun) || !NEUTER_ART.has(art)) continue;
      if (!(NEUTER_END.test(noun) || /en$/.test(noun) || focusHas(item, 'neuter'))) continue;
      const IW = words(text);
      for (let j = 1; j < IW.length; j++) {
        if (IW[j].toLowerCase() === noun.toLowerCase() && WRONG_FOR_NEUTER.has(IW[j - 1].toLowerCase()) && !(art === 'des' && IW[j - 1].toLowerCase() === 'der'))
          return { cls: 'neuter', word: noun, hint: `Check the article on ${it(noun)}.` };
      }
    }
    if (r && ((r.focusMiss && r.focusMiss.length) || (focusHas(item, 'cap') && r.capMiss && r.capMiss.length)))
      return { cls: 'cap', word: (r.focusMiss && r.focusMiss[0] || r.capMiss[0]).expected, hint: 'Check the capital letters.' };
    return null;
  }
  const api = { run, classes, norm, setFronted(list) { FRONTED = list.map(norm).sort((a, b) => b.length - a.length); }, get FRONTED() { return FRONTED; } };
  void RAW_FRONT;
  root.Detect = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
