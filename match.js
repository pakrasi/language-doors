/* Igloo answer matcher. Pure functions, no DOM. Used by the Test view and node tests (scripts/test_match.mjs).
   check(input, accepted[], {pos, strictCase, slots}) -> {ok, exact, close, articleMiss, caseMiss, matched, others, fixed}
   - Normalizes: NFC, trim, collapse whitespace, drop commas and quotes, drop final . ! ? ; : (and lowercase unless strictCase).
   - ae/oe/ue/ss count as ä/ö/ü/ß; `fixed` is the accepted spelling, `exact` is false when the input needed that folding.
   - Nouns: the right word with a wrong or missing article is ok:false, articleMiss:true.
   - close: Damerau-Levenshtein distance 1 on answers of 6+ letters (ok:false, close:true).
   - Chunk variants: accepted strings may hold [slot] placeholders (1-6 words; glued to a word, the rest of that word),
     "..." (same as a slot) and (optional) parts. `others` lists the accepted strings that were not matched. */
(function (root) {
  'use strict';
  const SLOT = '\uE000', OPEN = '\uE001', CLOSE = '\uE002';
  const ARTICLES = ['der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer'];
  const FOLD = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ẞ': 'SS' };

  // Shared cleanup for both sides. Keeps case; callers lowercase when needed.
  function clean(s) {
    return String(s == null ? '' : s).normalize('NFC')
      .replace(/[‘’ʼ]/g, "'")
      .replace(/["„“”«»‚]/g, ' ')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ').trim()
      .replace(/[\s.!?;:]+$/u, '')
      .replace(/^[¿¡]+/, '')
      .trim();
  }
  const tidy = s => String(s).normalize('NFC').replace(/\s+/g, ' ').trim();
  const fold = s => s.replace(/[äöüßÄÖÜẞ]/g, c => FOLD[c]);
  const letters = s => (s.match(/\p{L}/gu) || []).length;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // One regex source per literal character run; with fold=true each umlaut/ss matches both spellings.
  function litRe(text, allowFold) {
    if (!allowFold) return esc(text);
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const c = text[i], two = text.slice(i, i + 2), lo2 = two.toLowerCase();
      if (FOLD[c]) { out += `(?:${esc(c)}|${esc(FOLD[c])})`; continue; }
      const back = { ae: 'ä', oe: 'ö', ue: 'ü', ss: 'ß' }[lo2];
      if (back) { const u = two[0] === two[0].toUpperCase() && two[0] !== two[0].toLowerCase() ? back.toUpperCase() : back; out += `(?:${esc(two)}|${esc(u)})`; i++; continue; }
      out += esc(c);
    }
    return out;
  }

  // Expand (optional) groups into separate variants, then parse each into {lit} and {slot, glued} parts.
  function expand(s) {
    const m = s.match(/\uE001([^\uE001\uE002]*)\uE002/u);
    if (!m) return [s];
    const pre = s.slice(0, m.index), post = s.slice(m.index + m[0].length);
    return [...expand(pre + m[1] + post), ...expand(pre + ' ' + post)];
  }
  function parts(str) {
    const out = []; let buf = '';
    for (let i = 0; i < str.length; i++) {
      const c = str[i];
      if (c === SLOT) {
        if (buf) { out.push({ lit: buf }); buf = ''; }
        const prev = str[i - 1], next = str[i + 1];
        out.push({ slot: true, glued: !!((prev && prev !== ' ') || (next && next !== ' ')) });
      } else buf += c;
    }
    if (buf) out.push({ lit: buf });
    return out;
  }
  const reSrc = (ps, allowFold) => ps.map(p => p.lit != null ? litRe(p.lit, allowFold) : p.glued ? '(\\S+?)' : '(\\S+(?: \\S+){0,5}?)').join('');
  const fill = (ps, m) => { let i = 1; return ps.map(p => p.lit != null ? p.lit : (m && m[i++]) || '…').join('').replace(/\s+/g, ' ').trim(); };

  function compile(accepted, strictCase, useSlots) {
    const flags = 'u' + (strictCase ? '' : 'i');
    let s = String(accepted).normalize('NFC');
    if (useSlots) s = s.replace(/\[[^\]]*\]/g, SLOT).replace(/\.\.\.|…/g, SLOT).replace(/\(/g, OPEN).replace(/\)/g, CLOSE);
    const seen = new Set();
    const forms = expand(s).filter(x => { const k = clean(x); if (!k || seen.has(k)) return false; seen.add(k); return true; }).map(x => {
      const ps = parts(clean(x));
      const show = parts(x.replace(/\s+([,.!?;:])/g, '$1').replace(/\s+/g, ' ').trim());
      return { ps, show, loose: new RegExp('^' + reSrc(ps, true) + '$', flags), strict: new RegExp('^' + reSrc(ps, false) + '$', flags) };
    });
    return { forms, slots: s.includes(SLOT) };
  }
  // which form of a compiled answer matches, and how exactly
  function test(c, inp) {
    for (const f of c.forms) if (f.strict.test(inp)) return { exact: true, fixed: fill(f.show, inp.match(f.strict)) };
    for (const f of c.forms) { const m = inp.match(f.loose); if (m) return { exact: false, fixed: fill(f.show, m) }; }
    return null;
  }

  function dl1(a, b) {
    // true when the Damerau-Levenshtein distance is 0 or 1
    if (a === b) return true;
    const la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;                                   // substitution
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);    // transposition
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);         // deletion / insertion
  }

  const splitArticle = s => {
    const m = s.match(/^(\S+) (.+)$/);
    if (m && ARTICLES.includes(m[1].toLowerCase())) return { art: m[1], rest: m[2] };
    return { art: '', rest: s };
  };

  function check(input, accepted, opts = {}) {
    const strictCase = !!opts.strictCase;
    const list = (Array.isArray(accepted) ? accepted : [accepted]).filter(a => a != null && String(a).trim() !== '');
    const inp = clean(input);
    const res = { ok: false, exact: false, close: false, articleMiss: false, caseMiss: false, matched: null, others: list.slice(), fixed: list[0] ? tidy(list[0]) : '' };
    if (!inp || !list.length) return res;
    const compiled = list.map(a => compile(a, strictCase, opts.slots !== false));

    // 1. exact or folded match (exact matches win over folded ones)
    let hit = -1, got = null;
    for (let k = 0; k < compiled.length && hit < 0; k++) { const t = test(compiled[k], inp); if (t && t.exact) { hit = k; got = t; } }
    for (let k = 0; k < compiled.length && hit < 0; k++) { const t = test(compiled[k], inp); if (t) { hit = k; got = t; } }
    if (hit >= 0) {
      res.ok = true; res.exact = got.exact; res.matched = list[hit];
      res.others = list.filter((_, k) => k !== hit);
      res.fixed = got.fixed;
      return res;
    }

    // 2. strict case: same answer, only capitalisation differs
    if (strictCase) {
      const again = check(input, list, { ...opts, strictCase: false });
      if (again.ok) { res.caseMiss = true; res.matched = again.matched; res.fixed = again.fixed; res.others = again.others; return res; }
    }

    const low = s => fold(strictCase ? s : s.toLowerCase());

    // 3. nouns: right word, wrong or missing article
    if (opts.pos === 'noun') {
      const iu = splitArticle(inp);
      for (let k = 0; k < list.length; k++) {
        const au = splitArticle(clean(list[k]));
        if (!au.art) continue;
        if (low(iu.rest) === low(au.rest)) {
          res.articleMiss = true; res.matched = list[k]; res.fixed = tidy(list[k]);
          res.others = list.filter((_, j) => j !== k);
          return res;
        }
      }
    }

    // 4. close: one edit away on answers of 6+ letters (slot patterns excluded)
    for (let k = 0; k < list.length; k++) {
      if (compiled[k].slots) continue;
      const a = clean(list[k]);
      let body = a, ib = inp;
      if (opts.pos === 'noun') {
        const au = splitArticle(a), iu = splitArticle(inp);
        if (au.art) { if (low(au.art) !== low(iu.art)) continue; body = au.rest; ib = iu.rest; }
      }
      if (letters(body) >= 6 && dl1(low(ib), low(body))) {
        res.close = true; res.matched = list[k]; res.fixed = tidy(list[k]); res.others = list.filter((_, j) => j !== k);
        return res;
      }
    }
    return res;
  }

  function acceptedForWord(word) {
    if (!word) return [];
    const main = word.pos === 'noun' && word.art ? `${word.art} ${word.w}` : word.w;
    const out = [main];
    for (const a of word.alt || []) if (a && !out.includes(a)) out.push(a);
    return out;
  }
  // t: the German chunk string, variants split on " / ". ex (optional): the German example sentence, accepted first.
  function acceptedForChunk(t, ex) {
    const out = [];
    if (ex) out.push(ex);
    for (const v of String(t || '').split(' / ').map(s => s.trim()).filter(Boolean)) if (!out.includes(v)) out.push(v);
    return out;
  }

  const api = { check, acceptedForWord, acceptedForChunk, clean, fold, dl1 };
  root.Match = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
