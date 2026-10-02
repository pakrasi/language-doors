/* B1 trainer (app.html#b1): data, item pools, the round composer, grading glue, the hub, the done screen and the
   B1 settings. The session loop is b1round.js; scheduling fsrs.js; readiness b1ready.js; detectors detect.js.
   Stores (all doors.b1.*): fsrs.v1, round.v1, day.v1, days.v1, settings.v1, words.v1, variants.v1, backup.v1.
   B1 reads Igloo's doors.srs.v1 / doors.know.v1 once to seed, and never writes them. */
(function () {
  'use strict';
  const { h, $, getJSON } = DG;
  const rep = (el, ...k) => el.replaceChildren(...k.flat(Infinity).filter(x => x != null && x !== false));
  const D8 = B1Day, FS = FSRS, RD = B1Ready;
  const DEV = D8.DEV();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pct = x => Math.round(100 * (x || 0)) + ' %';
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const K = { fsrs: 'doors.b1.fsrs.v1', round: 'doors.b1.round.v1', day: 'doors.b1.day.v1', days: 'doors.b1.days.v1', settings: 'doors.b1.settings.v1',
    words: 'doors.b1.words.v1', variants: 'doors.b1.variants.v1', backup: 'doors.b1.backup.v1', seeded: 'doors.b1.seeded', firstRun: 'doors.b1.firstRun' };
  const AREA_NAME = { speaking: 'Sprechen phrases', reading: 'Lesen phrases', grammar: 'Grammar', words: 'Exam words' };
  const AREA_ROUTE = { speaking: 'sprechen', reading: 'lesen', grammar: 'grammar', words: 'words' };
  const ROUTE_AREA = Object.fromEntries(Object.entries(AREA_ROUTE).map(([a, r]) => [r, a]));
  const ROUND = 12;

  // ---------- storage with visible failures ----------
  let saveFailed = false;
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { if (!saveFailed) { saveFailed = true; showSaveError(); } return false; }
  }
  function showSaveError() {
    const b = $('#banner'); if (!b) return;
    b.replaceChildren(h('div', { class: 'banner', role: 'alert' }, "Couldn't save on this device. Export your progress now.",
      h('button', { type: 'button', class: 'btn small-btn', onclick: () => DG.exportProgress?.() }, 'Export')));
  }
  const settings = () => ({ newPerDay: 40, claude: true, layout: 'docked', backup: true, ...load(K.settings, {}) });
  const setSetting = (k, v) => { const s = settings(); s[k] = v; save(K.settings, s); };

  // ---------- data ----------
  let DATA = null, DATA_P = null, NOUNS = null;
  function ensureData() {
    if (DATA) return Promise.resolve(DATA);
    if (!DATA_P) DATA_P = (async () => {
      const opt = p => getJSON(p).catch(() => null);
      const [items, grammar, bank, plan] = await Promise.all([opt('data/b1/items.json'), opt('data/b1/grammar.json'), opt('data/b1/bank.json'), getJSON('data/b1/plan.json')]);
      NOUNS = getJSON('data/b1/nouns.json').catch(() => ({}));
      DATA = build(items || [], grammar || [], bank || {}, plan);
      DATA.nouns = await NOUNS;
      return DATA;
    })().catch(e => { DATA_P = null; throw e; });
    return DATA_P;
  }
  const TEIL_GROUP = { 'Sprechen T1': ['S1', 'S1'], 'Sprechen T2': ['S2', 'S2'], 'Sprechen T3': ['S3', 'S3'], Forum: ['opinion', 'S3'] };
  const PLAN_OF_KIND = { transform: 'transform', join: 'transform', order: 'transform', gap: 'recall', 'choose-article': 'recall', translate: 'recall' };
  function build(items, grammar, bank, plan) {
    const topics = new Map(plan.topics.map(t => [t.id, t]));
    const byId = new Map(), pool = [];
    const add = it => { if (!byId.has(it.id)) { byId.set(it.id, it); pool.push(it); } };
    const twins = new Set(items.map(i => i.chunk).filter(Boolean));
    for (const a of items) add({ ...a, promptLang: a.prompt_lang, gap: String(a.prompt).includes('___'), mine: String(a.src || '').startsWith('mine') });
    for (const [cid, b] of Object.entries(bank)) {
      if (twins.has(cid)) continue;
      const [group, teil] = TEIL_GROUP[b.part] || ['opinion', 'S3'];
      add({ id: 'K:' + cid, kind: 'phrase', area: 'speaking', group, teil, fn: b.fn, star: b.prio === 1, trap: null, focus: ['chunk'], strict: [], plan: 'recall',
        task: null, prompt: b.en, promptLang: 'en', hl: b.hl, partner: null, prefill: null, accept: b.accept, anywhere: true,
        model: b.ex && Match.matches(b.ex, b.accept[0]) ? b.ex : Match.renderPattern(b.accept[0], b.ex), wrong: [], rule: b.n || '', src: 'bank', level: b.level, bank: true });
    }
    for (const g of grammar) {
      const t = topics.get(g.topic); if (!t) continue;
      const ans = [].concat(g.answer), gap = String(g.prompt).includes('___');
      const lead = (String(g.prompt).match(/→\s*(.+?)\s*…\s*$/) || [])[1];
      const short = lead ? ans.filter(a => a.startsWith(lead)).map(a => a.slice(lead.length).trim()).filter(Boolean) : [];
      add({ id: 'G:' + g.id, kind: 'grammar', area: 'grammar', group: g.topic, teil: null, fn: null, star: !!t.trap, trap: g.trap || null, focus: g.focus || [],
        strict: g.strict || [], plan: PLAN_OF_KIND[g.kind] || 'recall', task: g.task, prompt: g.prompt, promptLang: g.kind === 'translate' ? 'en' : 'de', hl: null,
        partner: null, prefill: null, accept: [...ans, ...short], anywhere: false, literal: true, gap, loose: gap || g.kind !== 'translate',
        model: gap ? (Match.gapFill(g.prompt, ans[0])?.text || ans[0]) : ans[0], wrong: g.wrong || [], rule: g.rule || g.note || '', src: 'igloo', level: g.level,
        strictCase: !!g.strict_case, rank: t.rank });
    }
    for (const it of pool) if (it.area === 'grammar' && it.rank == null) it.rank = topics.get(it.group)?.rank ?? 99;
    for (const w of (window.B1More?.wordItems?.() || [])) add(w);   // exam words from the cached b1-exam list (b1more.js)
    const traps = new Map(plan.traps.map(t => [t.id, t]));
    const fnInfo = new Map(plan.functions.map(f => [f.id, f]));
    return { pool, byId, plan, topics, traps, fnInfo };
  }

  // ---------- grading ----------
  function caseRef(it) {
    const m = new Map(Object.entries(DATA.nouns || {}).map(([k, v]) => [Match.fold(k), v]));
    for (const s of [it.model, ...(it.moves || []).map(x => x.model)].filter(Boolean)) {
      String(s).normalize('NFC').split(/(?<=[.!?:])\s+/).forEach(sent => Match.words(sent).forEach((w, i) => { if (i) m.set(w.n, w.raw); }));
    }
    return m;
  }
  const refCache = new WeakMap();
  function gradeAnswer(item, input, move) {
    const it = move ? { ...item, accept: move.accept, model: move.model, anywhere: true, fn: move.fn } : item;
    const accepted = it.gap ? Match.acceptedForGap(it.prompt, it.accept) : it.accept;
    let ref = refCache.get(it); if (!ref) { ref = caseRef(it); refCache.set(it, ref); }
    const o = { anywhere: !!it.anywhere, slotMax: 10, endings: true, umlaut: true, strict: it.strict || [], caseRef: ref, strictCase: !!it.strictCase };
    if (it.loose || it.gap) o.loose = Match.gapLoose(it.prompt);
    const r = Match.check(input, accepted, o);
    const det = Detect.run(input, it, r);
    const own = new Set(it.accept || []);   // gap answers; acceptedForGap adds the filled sentences, which render as they are
    const render = p => it.gap ? (own.has(p) ? (Match.gapFill(it.prompt, p)?.text || p) : p) : it.literal ? p : Match.renderPattern(p, it.model);
    let right = it.model;
    if (!r.ok && r.nearest != null && r.nearest > 0) right = render(accepted[r.nearest]);
    const shown = new Set([norm(r.ok ? r.input : right)]);
    const also = [];
    for (const p of (it.gap ? it.accept : accepted)) {   // gap items: the listed answers, not their filled-in sentences again
      const s = render(p); const k = norm(s);
      if (shown.has(k) || /…/.test(s) && it.kind !== 'topic' && it.kind !== 'reply' && it.anywhere === false) continue;
      shown.add(k); also.push(s);
    }
    if (r.ok && it.model && !shown.has(norm(it.model))) also.unshift(it.model);
    const detRule = det ? DATA.traps.get(det.cls)?.rule : null;
    return { ok: r.ok && !det, matchOk: r.ok, det, r, input: r.input, typos: r.typos || [], capMiss: r.capMiss || [], umlautMiss: r.umlautMiss || [],
      right, alsoCorrect: also.slice(0, 8), primary: r.ok && r.matched === accepted[0] && r.exact, detRule };
  }
  const norm = s => Match.fold(String(s).toLowerCase()).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  // ---------- learner state ----------
  let store = null;
  function getStore() { if (!store) { store = load(K.fsrs, {}); seed(); } return store; }
  function saveStore() { save(K.fsrs, store); }
  // once: Igloo Test/Drill history → B1 records (read-only on Igloo's stores; u: 0 so a real B1 record always wins)
  function seed() {
    if (load(K.seeded, false) || !DATA) return;
    const srs = load('doors.srs.v1', {}), know = load('doors.know.v1', {});
    const today = D8.today(), exam = D8.exam(), cap = D8.add(exam, -1);
    const dayIso = n => { const d = new Date(n * 86400000); return d.toISOString().slice(0, 10); };
    let n = 0;
    for (const it of DATA.pool) {
      if (!/^[KG]:/.test(it.id) || store[it.id]) continue;
      const s = srs['german|' + it.id], k = know['german|' + it.id];
      if (s && s.reps > 0) {
        const S = Math.max(1, s.ivl || 1); let due = dayIso(s.due); if (due > cap) due = cap; if (due < today) due = today;
        store[it.id] = { S, D: 5, reps: s.reps, lapses: s.lapses || 0, last: dayIso(s.last), first: dayIso(s.last), due, stage: S >= 7 ? 2 : 1, streak: 0, learn: null, relearn: false, u: 0, hist: [], seeded: 'srs' }; n++;
      } else if (k && (k.s === 'known' || k.s === 'shaky')) {
        const known = k.s === 'known';
        store[it.id] = { S: known ? 3 : 1, D: known ? 5 : 6, reps: 1, lapses: 0, last: D8.add(today, -1), first: D8.add(today, -1), due: known ? D8.add(today, 1) : today, stage: 1, streak: 0, learn: null, relearn: false, u: 0, hist: [], seeded: 'know' }; n++;
      }
    }
    save(K.seeded, { at: Date.now(), n }); saveStore();
  }
  function dayStore() {
    const t = D8.today();
    let d = load(K.day, null);
    if (!d || d.day !== t) {
      if (d && d.day) { const all = load(K.days, []).filter(x => x.day !== d.day); all.push(d); save(K.days, all.slice(-40)); }
      d = { day: t, rounds: 0, traps: null, newShown: 0, firstTry: [0, 0], pred: [0, 0], shown: [] };
      save(K.day, d);
    }
    return d;
  }
  const allDays = () => { const d = dayStore(); return [...load(K.days, []).filter(x => x.day !== d.day), d]; };
  function ctxNow() {
    const today = D8.today(), exam = D8.exam();
    return { today, exam, phase: D8.phase(today, exam) };
  }

  // ---------- the composer ----------
  const unseen = it => !(store[it.id] && store[it.id].reps);
  const isDue = it => RD.isDue(store[it.id], ctxNow().today);
  const R = (it, day) => FS.Ron(store[it.id], day);
  // New items come from two streams with their own daily quota (01 §c: 40 phrases : 15 grammar of 55):
  // 'p' = Sprechen/Lesen phrases, situations and words; 'g' = grammar.
  const stream = it => it.area === 'grammar' ? 'g' : 'p';
  const SPLIT = { p: 40 / 55, g: 15 / 55 };
  // P14 order for new items (+ review B1: his own mistakes first)
  function newOrder(pool, anyTopic = false) {   // anyTopic: the Situations round practises every situation
    const tier = it => {
      if (it.area === 'speaking' && it.group === 'S2' && it.star && it.kind === 'phrase') return 1;
      if (it.area === 'grammar' && DATA.topics.get(it.group)?.trap) return 2;
      if (it.area === 'speaking' && (it.group === 'S1' || it.group === 'S3') && it.star && it.kind === 'phrase') return 3;
      if (it.area === 'speaking' && it.group === 'opinion' && it.kind === 'phrase') return 4;
      if (it.area === 'grammar' && it.rank <= 20) return 5;
      if (it.area === 'reading' && it.group !== 'signal') return 6;
      if (it.area === 'speaking' && it.kind === 'phrase') return 7;
      if (it.kind === 'topic' || it.kind === 'reply') return 8;
      if (it.area === 'words') return 9;
      if (it.area === 'reading') return 10;
      return 11;
    };
    const eligible = it => it.rank !== 21 && !(it.group === 'praeteritum' && it.kind !== 'grammar');
    const list = pool.filter(it => unseen(it) && eligible(it) && (anyTopic || topicReady(it)));
    const base = list.filter(it => !it.mine).map((it, i) => [tier(it), it.area === 'grammar' ? it.rank : 0, it.star ? 0 : 1, it.bank ? 1 : 0, i, it])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4]).map(x => x[5]);
    // his own mistakes (src mine) are spread through the front of the order: one in every three
    const mine = list.filter(it => it.mine), out = [];
    while (base.length || mine.length) { if (mine.length) out.push(mine.shift()); for (let k = 0; k < 2 && base.length; k++) out.push(base.shift()); }
    return out;
  }
  // situations come in once two phrases with that function have graduated
  function topicReady(it) {
    if (it.kind !== 'topic' && it.kind !== 'reply') return true;
    const fn = it.fn === 't1_react' ? 't1_reject' : it.fn;
    let n = 0;
    for (const x of DATA.pool) if (x.fn === fn && x.kind === 'phrase' && store[x.id]?.reps && store[x.id].learn == null) if (++n >= 2) return true;
    return false;
  }
  function quota(st) { const ph = ctxNow().phase; if (ph === 'eve' || ph === 'day') return 0; return Math.round((ph === 'after' ? 10 : settings().newPerDay) * SPLIT[st]); }
  function newLeftOf(st) { const d = dayStore(); return Math.max(0, quota(st) - ((d.newBy || {})[st] || 0)); }
  function newLeft() { return newLeftOf('p') + newLeftOf('g'); }
  // the first n new items, taking each stream's quota in turn
  function nextNew(pool, n, left = { p: newLeftOf('p'), g: newLeftOf('g') }, anyTopic = false) {
    const order = newOrder(pool, anyTopic), out = [], q = { ...left };
    const byS = { p: order.filter(it => stream(it) === 'p'), g: order.filter(it => stream(it) === 'g') };
    while (out.length < n && (q.p > 0 && byS.p.length || q.g > 0 && byS.g.length)) {
      // keep the mix close to the split: pick the stream that is furthest behind its share
      const tp = out.filter(it => stream(it) === 'p').length, tg = out.length - tp;
      let st = (tp / SPLIT.p <= tg / SPLIT.g) ? 'p' : 'g';
      if (!(q[st] > 0 && byS[st].length)) st = st === 'p' ? 'g' : 'p';
      out.push(byS[st].shift()); q[st]--;
    }
    return out;
  }
  // the exam set for readiness: everything seen + the next items he'd meet by exam−2 at the daily quota
  // The learnable exam set (review M10): seen items + what the daily new-item budget can still introduce by exam−2 in the
  // composer's order (★ and traps first), with a floor per area of its share of that budget (so Exam words, the last tier,
  // isn't just "what's seen"). Every
  // area gets a fixed denominator, so one new item moves its bar by about 1/n. All ★/trap items would not fit the budget
  // (about 615 vs 280 at 40 a day) and would cap the bar near 45 %. Frozen for the day (recomputed when the pool changes).
  let examFrozen = null;
  function examSet() {
    const c = ctxNow();
    if (c.phase === 'after') return null;
    const key = `${c.today}|${DATA.pool.length}`;
    if (!examFrozen || examFrozen.key !== key) {
      const daysLeft = Math.max(0, D8.diff(c.today, D8.add(c.exam, -2)));
      const open = c.phase === 'week' || c.phase === 'lastNew';
      const d = dayStore(), shown = d.newBy || {};
      const dayQ = st => open ? quota(st) * (daysLeft + 1) - (shown[st] || 0) : 0;   // today's remaining budget + the days to exam−2
      const left = { p: Math.max(0, dayQ('p')), g: Math.max(0, dayQ('g')) };
      // the composer's own next items under the budget, plus a floor per area (its share of the budget by unseen items)
      const ids = new Set(nextNew(DATA.pool, left.p + left.g, left).map(it => it.id));
      const fresh = newOrder(DATA.pool), total = left.p + left.g;
      for (const a of ['speaking', 'reading', 'grammar', 'words']) {
        const un = fresh.filter(it => it.area === a), floor = fresh.length ? Math.round(total * un.length / fresh.length) : 0;
        let have = un.filter(it => ids.has(it.id)).length;
        for (const it of un) { if (have >= floor) break; if (!ids.has(it.id)) { ids.add(it.id); have++; } }
      }
      examFrozen = { key, ids };
    }
    const set = new Set(examFrozen.ids);
    for (const it of DATA.pool) if (!unseen(it)) set.add(it.id);
    return set;
  }
  // the day's trap set: 2 per class (verb-final, v2, fuer-vor, cap, neuter), 2 of them from his own mistakes
  function trapSet() {
    const d = dayStore();
    if (d.traps) return d.traps;
    const today = D8.today(), recent = D8.add(today, -3);
    const flagCount = (it, cls) => (store[it.id]?.hist || []).filter(h => h[0] >= recent && String(h[4]).includes('d' + cls)).length;
    const out = [];
    const pickFrom = (list, n, cls) => {
      const seen = list.filter(it => !unseen(it)).sort((a, b) => flagCount(b, cls) - flagCount(a, cls) || R(a, today) - R(b, today));
      const fresh = list.filter(it => unseen(it));
      for (const it of [...seen, ...fresh]) { if (n <= 0) break; if (!out.includes(it.id)) { out.push(it.id); n--; } }
    };
    const mine = DATA.pool.filter(it => it.mine && it.trap);
    pickFrom(mine, 2, '');
    for (const cls of ['verb-final', 'v2', 'fuer-vor', 'cap', 'neuter']) pickFrom(DATA.pool.filter(it => it.trap === cls && it.area !== 'words'), 2, cls);
    d.traps = out; save(K.day, d);
    return out;
  }
  // a round: due first (lowest R), ≤ 4 new (8 in the very first round), ≥ 2 traps, warm-ups first, a fix last
  function compose({ area = null, topic = null, kind = null, missed = false, size = ROUND } = {}) {
    getStore();
    const c = ctxNow(), today = c.today;
    let pool = DATA.pool.filter(it => (!area || it.area === area) && (!topic || it.group === topic || (DATA.topics.get(topic)?.confusable || []).includes(it.group)) && (!kind || (kind === 'situation' ? (it.kind === 'topic' || it.kind === 'reply') : true)));
    if (missed) {
      const since = D8.add(today, -3);
      const miss = DATA.pool.filter(it => (store[it.id]?.hist || []).some(h => h[0] >= since && h[1] === 1)).sort((a, b) => lastMiss(b) - lastMiss(a));
      return miss.slice(0, size).map(it => it.id);
    }
    if (c.phase === 'day') {   // exam morning: a warm-up of items he knows well, nothing written
      return pool.filter(it => store[it.id]?.reps && store[it.id].learn == null).sort((a, b) => R(b, today) - R(a, today)).slice(0, size).map(it => it.id);
    }
    let due = pool.filter(isDue);
    const starFirst = c.phase === 'eve';
    due.sort((a, b) => (starFirst ? ((b.star || b.trap ? 1 : 0) - (a.star || a.trap ? 1 : 0)) : 0) || R(a, today) - R(b, today));
    const firstEver = !Object.values(store).some(r => r && r.hist && r.hist.length);
    const nNew = Math.min(newLeft(), firstEver ? 8 : 4);
    const fresh = nextNew(pool, nNew + 2, undefined, kind === 'situation');
    const shownToday = new Set(dayStore().shown);
    const traps = (!area || area !== 'words') && !kind ? trapSet().map(id => DATA.byId.get(id)).filter(it => it && pool.includes(it) && !shownToday.has(it.id) && !(store[it.id]?.last === today && !isDue(it))) : [];
    const chosen = [], add = it => { if (it && !chosen.includes(it) && chosen.length < size) chosen.push(it); };
    // the fix: an item missed earlier today that is due again
    const fix = due.find(it => store[it.id]?.relearn || (store[it.id]?.learn != null && (store[it.id].hist || []).some(h => h[0] === today && h[1] === 1)));
    // warm-ups: due with the highest R
    const warm = due.filter(it => it !== fix && !store[it.id]?.relearn && store[it.id]?.learn == null).sort((a, b) => R(b, today) - R(a, today)).slice(0, 2);
    warm.forEach(add);
    const trapPick = traps.filter(it => !unseen(it) || nNew > 0).slice(0, 2);
    const rest = due.filter(it => it !== fix && !warm.includes(it));
    let newUsed = 0;
    const mid = [];
    const dueCap = size - warm.length - (fix ? 1 : 0) - trapPick.length - Math.min(nNew, fresh.length);
    for (const it of rest.slice(0, Math.max(0, dueCap))) mid.push(it);
    for (const it of trapPick) { if (unseen(it)) { if (newUsed >= nNew) continue; newUsed++; } mid.push(it); }
    for (const it of fresh) { if (newUsed >= nNew || mid.includes(it)) continue; mid.push(it); newUsed++; }
    for (const it of rest.slice(Math.max(0, dueCap))) { if (warm.length + mid.length + (fix ? 1 : 0) >= size) break; if (!mid.includes(it)) mid.push(it); }
    for (const it of nextNew(pool, size, undefined, kind === 'situation')) { if (warm.length + mid.length + (fix ? 1 : 0) >= size || newUsed >= nNew) break; if (!mid.includes(it)) { mid.push(it); newUsed++; } }
    // interleave: keep look-alike grammar topics next to each other, spread new items
    mid.sort((a, b) => (unseen(a) ? 1 : 0) - (unseen(b) ? 1 : 0));
    const out = [...warm, ...spread(mid)];
    if (fix && !out.includes(fix)) out.push(fix);
    return out.slice(0, size).map(it => it.id);
  }
  function lastMiss(it) { const hs = (store[it.id]?.hist || []).filter(h => h[1] === 1); return hs.length ? Date.parse(hs[hs.length - 1][0]) : 0; }
  function spread(list) {   // new items between reviews: r r n r r n …
    const news = list.filter(unseen), olds = list.filter(it => !unseen(it)), out = [];
    while (news.length || olds.length) { if (olds.length) out.push(olds.shift()); if (olds.length && out.length % 3 === 1) out.push(olds.shift()); if (news.length) out.push(news.shift()); }
    return out;
  }

  // ---------- a round in progress ----------
  // doors.b1.round.v1 = {id, kind, area, topic, day, startedAt, queue:[{id, re}], i, results:[{id, g, ok, first, ms}]}
  function loadRound() {
    const r = load(K.round, null);
    if (!r || r.day !== D8.today() || Date.now() - r.startedAt > 6 * 3600e3 || r.i >= r.queue.length) return null;
    return r;
  }
  function startRound(spec) {
    const ids = compose(spec);
    if (!ids.length) return null;
    const r = { id: Date.now(), ...spec, day: D8.today(), startedAt: Date.now(), queue: ids.map(id => ({ id })), i: 0, results: [], planned: ids.length, prev: {} };
    save(K.round, r);
    return r;
  }

  function runRound(view, round) {
    const s = settings();
    const roundsEver = allDays().reduce((a, d) => a + (d.rounds || 0), 0);
    const src = {
      cur() {
        const q = round.queue[round.i]; if (!q) return null;
        const item = DATA.byId.get(q.id);
        if (!item) { round.i++; return this.cur(); }
        const rec = store[item.id];
        const isNew = !rec || !rec.reps;
        const stage = isNew || rec.learn != null ? 0 : rec.stage || 0;
        const e = { item, isNew: isNew && !q.re, limit: isNew && !q.re ? null : B1Timer.limit(item, { stage }), stage, reinsert: !!q.re, q };
        e._before = rec ? JSON.parse(JSON.stringify(rec)) : null;
        return e;
      },
      grade: (e, typed, move) => gradeAnswer(e.item, typed, move),
      answer(e, o) {
        const c = ctxNow(), id = e.item.id;
        const logOnly = round.kind === 'missed' && store[id]?.last === c.today;
        if (o.override) {   // Claude said his answer is right: redo this answer as Hard, keep the variant
          const res = FS.schedule(e._before, { g: 2, ms: e._ms || 0, flags: 'a' }, { ...c, forecast }, Date.now());
          if (res.rec) store[id] = res.rec; else delete store[id];
          round.queue = round.queue.filter((q, k) => k <= round.i || !(q.id === id && q.re));
          const last = round.results[round.results.length - 1]; if (last && last.id === id) { last.ok = true; last.g = 2; }
          const v = load(K.variants, []); v.push({ id, answer: e._typed, at: Date.now() }); save(K.variants, v.slice(-200));
          saveStore(); save(K.round, round); return;
        }
        const rec = store[id];
        // the record before this round's first answer: the done screen rolls back only these to show what the round did
        round.prev = round.prev || {}; if (!(id in round.prev)) round.prev[id] = e._before;
        const g = FS.rate({ ok: o.ok, revealed: o.revealed, ms: o.ms, limit: e.limit, selfRepair: o.selfRepair, capSlip: o.capSlip, umlaut: o.umlaut,
          prevRating: rec?.hist?.length ? rec.hist[rec.hist.length - 1][1] : 0, stage: e.stage });
        const flags = [o.selfRepair && 'r', o.capSlip && 'c', o.typo && 'y', o.umlaut && 'u', e.limit && o.ms > e.limit * 1000 && 'o', o.det && 'd' + o.det, o.g?.det && !o.det && 'd' + o.g.det.cls].filter(Boolean).join('');
        e._ms = o.ms; e._typed = o.g?.input;
        // honesty: predicted R vs the first try of reviewed items, first attempt of the day only
        const d = dayStore();
        if (rec && rec.reps && rec.learn == null && rec.last !== c.today && !e.reinsert) { d.pred[0] += FS.Ron(rec, c.today); d.pred[1]++; d.firstTry[0] += g >= 3 ? 1 : 0; d.firstTry[1]++; }
        if (e.isNew) { d.newShown++; d.newBy = d.newBy || {}; d.newBy[stream(e.item)] = (d.newBy[stream(e.item)] || 0) + 1; }
        if (!d.shown.includes(id)) d.shown.push(id);
        save(K.day, d);
        const res = FS.schedule(rec, { g, ms: o.ms, onTime: !!(e.limit && o.ms <= e.limit * 1000), flags, mode: 't', logOnly }, { ...c, forecast }, Date.now());
        if (res.rec) store[id] = res.rec;
        // reinsert misses and learning steps: +4, then +10 (or the next round)
        const times = round.queue.filter(q => q.id === id).length;
        if (res.reinsert && times < 3) {
          const at = Math.min(round.queue.length, round.i + 1 + (times === 1 ? 4 : 10));
          if (times === 1 || at < round.queue.length + 1) round.queue.splice(Math.max(round.i + 1, at), 0, { id, re: true });
        }
        round.results.push({ id, g, ok: o.ok, first: !e.reinsert, ms: Math.round(o.ms || 0), isNew: e.isNew, det: o.det || o.g?.det?.cls || null });
        saveStore(); save(K.round, round);
        backupSoon();
      },
      advance() { round.i++; save(K.round, round); return round.i < round.queue.length; },
      dots() {
        return round.queue.map((q, k) => {
          if (k === round.i) return { s: 'cur' + (q.re ? ' extra' : '') };
          if (k > round.i) return { s: 'todo' + (q.re ? ' extra' : '') };
          const r = round.results.filter(x => x.id === q.id)[round.queue.slice(0, k).filter(x => x.id === q.id).length];
          return { s: (r && r.ok ? 'ok' : 'bad') + (q.re ? ' extra' : '') };
        });
      },
      finish(reason) {
        window.__cleanup = null;
        if (reason === 'end') {
          const done = round.results.filter(r => r.first).length;
          go('');
          setTimeout(() => toast(`Round saved. ${done} of ${round.planned} done.`), 50);
          return;
        }
        const d = dayStore(); d.rounds++; save(K.day, d);
        save(K.round, null);
        drawDone(view, round);
      },
    };
    src.claude = claudeCheck;
    claudeCheck.available = () => !!claudeKey() && settings().claude && navigator.onLine;
    B1Round.run(view, src, { layout: settings().layout, reduce, hlHelper: roundsEver < 3 });
    if (DEV) autoplay(view);
  }
  function forecast(day) { return RD.forecast(store, D8.today(), 8).find(x => x.day === day)?.n || 0; }
  // new exam words after a fetch (b1more.js): into the pool without a reload
  function addItems(list) {
    if (!DATA) return 0;
    let n = 0;
    for (const it of list) if (!DATA.byId.has(it.id)) { DATA.byId.set(it.id, it); DATA.pool.push(it); n++; }
    return n;
  }
  // Say it aloud: a spoken answer. Right = Good (Hard when slow); trap items (verb at the end, für/vor) get at most Hard from
  // speech alone; items not met yet are log-only (speech never starts a schedule)
  function recordSpoken(item, o) {
    getStore();
    const c = ctxNow(), id = item.id, rec = store[id];
    const trap = ['verb-final', 'fuer-vor'].some(x => item.trap === x || (item.focus || []).includes(x));
    let g = o.ok ? (o.limit && o.ms > o.limit * 1000 ? 2 : 3) : 1;
    if (o.ok && trap) g = Math.min(g, 2);
    const res = FS.schedule(rec, { g, ms: o.ms || 0, onTime: g >= 3, flags: 's', mode: 's', logOnly: !rec || !rec.reps }, { ...c, forecast }, Date.now());
    if (res.rec) store[id] = res.rec;
    saveStore(); backupSoon();
    return g;
  }

  // ---------- Claude: "My answer is right" ----------
  function claudeKey() {
    try { const k = localStorage.getItem('doors.apikey'); if (k) return k; } catch {}
    try { const k = JSON.parse(localStorage.getItem('anthropic:key')); if (k) return k; } catch {}
    return null;
  }
  async function claudeCheck(e, answer) {
    const it = e.item;
    const task = it.kind === 'topic' || it.kind === 'reply'
      ? `Situation (Goethe B1 Sprechen ${it.teil}): ${it.partner ? `the partner says „${it.partner}“. ` : ''}${it.prompt}`
      : `Task: ${it.task ? it.task + ' ' : ''}${it.prompt}${it.hl ? ` (the graded part: "${it.hl}")` : ''}${it.prefill ? ` The answer starts with: ${it.prefill}` : ''}`;
    const prompt = `You check one answer in a German B1 exam trainer. ${task}\nExample answers: ${[it.model, ...(it.accept || []).slice(0, 4)].filter(Boolean).join(' | ')}\nThe learner wrote: ${answer}\n` +
      `Is the learner's answer correct, natural B1 German that does the same job? The listed answers are examples, not the only correct ones. Judge grammar strictly (word order, verb position, articles, endings, capitals).\n` +
      `Reply with JSON only: {"verdict":"correct"|"minor"|"wrong","note":"one short sentence in English"}`;
    const text = await DG.claudeText(claudeKey(), { model: 'claude-haiku-4-5', max_tokens: 200, messages: [{ role: 'user', content: prompt }] });
    const m = text.match(/\{[\s\S]*\}/); const j = m ? JSON.parse(m[0]) : { verdict: 'wrong', note: '' };
    return { verdict: ['correct', 'minor', 'wrong'].includes(j.verdict) ? j.verdict : 'wrong', note: j.note || '' };
  }

  // ---------- readiness ----------
  function readiness() {
    getStore();
    const c = ctxNow();
    return RD.compute({ pool: DATA.pool, store, today: c.today, exam: c.exam, phase: c.phase, examSet: examSet() });
  }
  function bar(recall, coverage, cls = '', gain = null) {
    const r = Math.max(0, Math.min(1, recall)), c = Math.max(r, Math.min(1, coverage));
    return h('div', { class: 'b1-bar ' + cls, role: 'img', 'aria-label': `${pct(r)} would recall, ${pct(c)} seen` },
      h('i', { class: 'seen', style: `width:${c * 100}%` }), h('i', { class: 'rec', style: `width:${r * 100}%` }),
      gain ? h('i', { class: 'gain', style: `left:${gain[0] * 100}%;width:${Math.max(0, gain[1] - gain[0]) * 100}%` }) : null);
  }

  // ---------- views ----------
  let VIEW = null;
  function go(sub) { location.hash = '#b1' + (sub ? '/' + sub : ''); }
  function toast(t) {
    const el = h('div', { class: 'b1-toast', role: 'status' }, t);
    document.body.append(el); setTimeout(() => el.remove(), 3200);
  }
  async function view(el, sub) {
    VIEW = el;
    document.body.classList.add('b1');
    try { await ensureData(); }
    catch (e) { rep(el, h('div', { class: 'banner', role: 'alert' }, "Couldn't load the B1 data. Check the connection and reload.")); return; }
    getStore();
    const parts = (sub || '').split('/').filter(Boolean);
    const [a, b] = parts;
    if (a === 'round') return roundRoute(el, { kind: 'today' });
    if (a === 'missed') return roundRoute(el, { kind: 'missed', missed: true });
    if (a === 'situations' && b === 'round') return roundRoute(el, { kind: 'situation' });
    if (ROUTE_AREA[a] && b === 'round') return roundRoute(el, { kind: 'area', area: ROUTE_AREA[a] });
    if (a === 'grammar' && b && parts[2] === 'round') return roundRoute(el, { kind: 'topic', area: 'grammar', topic: b });
    if (a === 'grammar' && b) return drawTopic(el, b);
    if (ROUTE_AREA[a]) return drawArea(el, ROUTE_AREA[a]);
    if (a === 'situations') return drawSituations(el);
    if (a === 'frames') return drawFrames(el);
    if (a && window.B1More && B1More.route(el, a, parts.slice(1), api)) return;
    return drawHub(el);
  }
  function roundRoute(el, spec) {
    let round = loadRound();
    if (!round || (spec.kind !== 'today' && round.kind !== spec.kind)) round = startRound(spec);
    if (!round) { drawNothing(el, spec); return; }
    runRound(el, round);
  }
  function drawNothing(el, spec) {
    const t = D8.add(D8.today(), 1);
    rep(el, h('section', { class: 'b1-wrap' }, h('p', { class: 'eyebrow' }, 'B1 · German'), h('h1', { tabindex: -1 }, spec.missed ? 'No misses in the last 3 days' : "That's everything for today."),
      h('p', { class: 'muted' }, spec.missed ? 'Nothing you got wrong since ' + D8.label(D8.add(D8.today(), -3)) + '.' : `Tomorrow: ${forecast(t)} due.`),
      h('div', { class: 'b1-row-btns' }, h('a', { class: 'btn', href: '#b1/aloud' }, 'Say it aloud'), h('a', { class: 'btn', href: '#b1/teil2' }, 'Teil 2 talk'), h('a', { class: 'btn primary', href: '#b1' }, 'Done'))));
  }

  // hub
  function drawHub(el) {
    const c = ctxNow(), rd = readiness(), d = dayStore(), s = settings();
    const daysTo = D8.diff(c.today, c.exam);
    const examLabel = D8.label(c.exam).replace(/^\w+ /, '');   // "9 Oct"
    const h1 = c.phase === 'eve' ? 'Exam tomorrow' : c.phase === 'day' ? 'Exam today' : c.phase === 'after' ? 'B1 · after the exam' : `Exam ${D8.label(c.exam)} · ${plural(daysTo, 'day')}`;
    const firstTime = !Object.values(store).some(r => r && r.hist && r.hist.length);
    const seeded = load(K.seeded, {}).n || 0;
    const round = loadRound();
    const dueN = rd.dueToday, newN = newLeft();
    // week strip: exam−7 … exam
    const practiced = new Set(allDays().filter(x => x.rounds > 0).map(x => x.day));
    const week = []; for (let k = 7; k >= 0; k--) week.push(D8.add(c.exam, -k));
    const strip = h('div', { class: 'b1-week', role: 'img', 'aria-label': `Days you practised this week: ${week.filter(x => practiced.has(x)).length} of 8` },
      week.map(day => h('span', { class: 'b1-wd' + (practiced.has(day) ? ' on' : '') + (day === c.exam ? ' exam' : '') + (day === c.today ? ' today' : '') }, h('b', {}, D8.dow(day).slice(0, 2)), h('i'))));
    const label = c.phase === 'after' ? 'Would recall now' : `Ready for ${examLabel}${rd.overall.without.includes('words') ? ' (without exam words)' : ''}`;
    const explain = h('p', { class: 'small muted b1-explain', hidden: true }, `${pct(rd.overall.recall)} would recall · ${pct(rd.overall.coverage)} seen · ${rd.overall.seen} of ${rd.overall.n} exam items. ★ and trap items count double.`);
    const firstAnswers = allDays().reduce((a, x) => a + (x.firstTry?.[1] || 0), 0) + Object.values(store).filter(r => r && r.hist && r.hist.length && r.first).length;
    // pace
    const set = examSet();
    const starLeft = DATA.pool.filter(it => (it.star || it.trap) && unseen(it) && (!set || set.has(it.id))).length;
    const newDays = Math.max(1, D8.diff(c.today, D8.add(c.exam, -2)) + 1);
    const rounds = Math.ceil(Math.min(starLeft / newDays, settings().newPerDay) / 4 + dueN / ROUND);   // never more new than the daily budget
    const pace = c.phase === 'after' || c.phase === 'day' ? null : starLeft === 0 ? "You've seen every ★ item. Rounds now are mostly reviews."
      : `About ${rounds} rounds today (about ${rounds * 4} min) keeps you on pace with the new items until ${D8.label(D8.add(c.exam, -2))}.`;
    const today = firstTime
      ? h('div', { class: 'card b1-card' }, h('h2', {}, 'Your first round'),
          h('p', {}, 'Rounds are 12 questions, about 4 minutes. Type the German. The timer is a guide: late answers still count, just a little less. New items have no timer: type it if you know it, or tap Show me.'),
          h('p', { class: 'muted small' }, 'Say each answer quietly as you type.'),
          seeded ? h('p', { class: 'muted small' }, "This starts from what you've already done in Igloo Test and Drill.") : null,
          matchMedia('(pointer: coarse)').matches ? h('p', { class: 'muted small' }, 'No German keyboard? Type ae, oe, ue, ss.') : null,
          h('p', { class: 'muted small', id: 'b1-offline-ready', hidden: !navigator.serviceWorker?.controller }, 'Saved for offline use.'))
      : h('div', { class: 'card b1-card' },
          h('button', { type: 'button', class: 'b1-bar-head', 'aria-expanded': 'false', onclick: e => { explain.hidden = !explain.hidden; e.currentTarget.setAttribute('aria-expanded', String(!explain.hidden)); } },
            h('span', {}, label), h('b', { class: 'mono' }, pct(rd.overall.recall))),
          bar(rd.overall.recall, rd.overall.coverage, 'big'), explain,
          h('p', { class: 'b1-counts' }, h('b', {}, `${dueN} due`), h('span', { class: 'muted' }, ` · ${newN} new left today`)),
          firstAnswers < 30 ? h('p', { class: 'muted small' }, 'The estimate settles after about 30 answers.') : null,
          pace ? h('p', { class: 'muted small' }, pace) : null,
          honesty());
    const notices = [];
    if (c.phase === 'lastNew') notices.push(h('div', { class: 'notice' }, "Last day for new items. From tomorrow it's reviews only."));
    if (c.phase === 'eve') notices.push(h('div', { class: 'notice' }, `Exam tomorrow. Reviews only: ${dueN} due.`));
    if (c.phase === 'day') notices.push(h('div', { class: 'notice' }, 'Exam today. A 3-minute warm-up with phrases you know well. ', h('a', { href: '#b1/frames' }, 'Read your Sprechen frames')));
    if (!navigator.onLine) notices.push(h('div', { class: 'notice' }, 'Offline. Rounds work. Claude checks and word updates wait for a connection.'));
    // areas
    const areaRows = ['speaking', 'grammar', 'reading', 'words'].map(a => {
      const x = rd.areas[a];
      if (a === 'words' && !x) {
        const row = window.B1More?.wordsRow?.(api);
        if (row) return row;
        return h('a', { class: 'b1-area', href: '#b1/words' },
          h('span', { class: 'b1-area-top' }, h('span', {}, AREA_NAME.words), h('span', { class: 'mono small' }, 'not on this device yet')),
          h('span', { class: 'muted small' }, 'Open the B1 exam app on this device once.'), bar(0, 0));
      }
      return h('a', { class: 'b1-area', href: '#b1/' + AREA_ROUTE[a] },
        h('span', { class: 'b1-area-top' }, h('span', {}, AREA_NAME[a]), h('span', { class: 'mono small' }, x && x.seen ? `${pct(x.recall)} · ${x.due} due` : '0 % · not started')),
        bar(x ? x.recall : 0, x ? x.coverage : 0));
    });
    const missedN = compose({ missed: true, size: 99 }).length;
    const fc = RD.forecast(store, c.today, 8);
    const peak = fc.slice(1).filter(x => x.day < c.exam).sort((p, q) => q.n - p.n)[0];
    const fcLine = peak && peak.n >= 30 && c.phase !== 'after' ? h('p', { class: 'muted small' }, `${D8.label(peak.day)}: about ${peak.n} due. An extra round on an earlier day spreads it out.`) : null;
    const modes = [
      ['situations', 'Situations · topic match', 'Your partner says something; answer with a phrase that does the job'],
      ['aloud', 'Say it aloud', 'Speak the German and get the phrase checked'],
      ['teil2', 'Teil 2 talk', 'The full 3-minute presentation, recorded, then faster'],
    ].map(([r, t, d2]) => h('a', { class: 'b1-mode', href: '#b1/' + r }, h('span', {}, h('b', {}, t), h('span', { class: 'muted small' }, d2)), h('span', { 'aria-hidden': 'true' }, '›')));
    const startCap = round ? null : (() => {
      const ids = compose({}); const nNew = ids.filter(id => unseen(DATA.byId.get(id))).length;
      if (!ids.length) return null;
      return `${ids.length} questions · ${ids.length - nNew} due, ${nNew} new · about ${Math.max(2, Math.round(ids.length / 3))} min`;
    })();
    const left = round ? round.queue.length - round.i : 0;
    const startBtn = round ? h('a', { class: 'btn primary big b1-start', href: '#b1/round' }, `Finish round · ${left} left`)
      : startCap ? h('a', { class: 'btn primary big b1-start', href: '#b1/round' }, c.phase === 'day' ? 'Start warm-up' : 'Start round')
        : h('p', { class: 'muted' }, `That's everything for today. Tomorrow: ${forecast(D8.add(c.today, 1))} due.`);
    const mock = h('p', { class: 'small b1-mock', hidden: true });
    if (window.B1More && ghToken()) B1More.refresh(api, (n, res) => { if (location.hash === '#b1' || location.hash === '') { toast(res.added?.length ? `${res.added.length} new exam words from Tag ${Math.max(...res.added.map(w => w.day || 0))}` : `${n} exam words loaded`); drawHub(el); } });
    rep(el, h('section', { class: 'b1-wrap b1-hub' },
      h('header', { class: 'section' }, h('p', { class: 'eyebrow' }, 'B1 · German'), h('h1', { tabindex: -1 }, h1), c.phase !== 'after' ? strip : null),
      notices, today,
      missedN ? h('a', { class: 'b1-mode', href: '#b1/missed' }, h('span', {}, h('b', {}, `Missed in the last 3 days · ${missedN}`), h('span', { class: 'muted small' }, 'A round of only the ones you got wrong')), h('span', { 'aria-hidden': 'true' }, '›')) : null,
      h('h2', { class: 'b1-h2' }, 'Areas'), areaRows,
      h('h2', { class: 'b1-h2' }, 'Other ways to practise'), modes,
      fcLine, mock,
      h('p', { class: 'muted small b1-foot' }, backupLine()),
      h('div', { class: 'b1-sticky' }, startCap ? h('p', { class: 'small muted' }, startCap) : null, startBtn)));
    fillMock(mock);
    checkUpdate();
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  function honesty() {
    const d = dayStore();
    if (d.pred[1] < 20) return null;
    const exp = d.pred[0] / d.pred[1], act = d.firstTry[0] / d.firstTry[1];
    if (Math.abs(act - exp) <= 0.10) return null;
    return h('p', { class: 'muted small' }, `The estimate is running ${act < exp ? 'high' : 'low'}. Today you got ${pct(act)} on first tries; it expected ${pct(exp)}.`);
  }
  // b1-exam: the next mock day (public progress file on the same site)
  async function fillMock(el) {
    if (DEV) return;
    try {
      const r = await fetch('../b1-exam/data/progress.json', { cache: 'no-store' }); if (!r.ok) return;
      const p = await r.json();
      const next = (p.days || []).find(x => ['lesen', 'hoeren', 'schreiben', 'sprechen'].some(m => !x[m]));
      if (!next) return;
      const mod = ['lesen', 'hoeren', 'schreiben', 'sprechen'].find(m => !next[m]);
      const name = { lesen: 'Lesen', hoeren: 'Hören', schreiben: 'Schreiben', sprechen: 'Sprechen' }[mod];
      rep(el, "Today's mock exam: ", h('a', { href: `../b1-exam/app/#/tag/${next.day}` }, `Tag ${next.day} · ${name}`), ' in the b1-exam app.');
      el.hidden = false;
    } catch {}
  }

  // area page
  function drawArea(el, area) {
    const rd = readiness(), x = rd.areas[area];
    const intro = { speaking: 'Phrases from your cheatsheet for Sprechen Teil 1, 2 and 3, the opinion kit, and letter phrases for Schreiben.',
      reading: 'Rules words and paraphrase pairs for Lesen Teil 2, 3 and 5. The right answer in Lesen is usually a paraphrase, so you practise both sides.',
      grammar: 'Ranked by how much each topic counts in Sprechen and Schreiben. "Trap" marks your five sticky errors.' }[area] || '';
    if (area === 'grammar') return drawGrammar(el, rd);
    if (area === 'words' && window.B1More?.drawWords) return B1More.drawWords(el, api);
    if (area === 'words') {   // until the words module loads: how to get them onto this device
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
        h('header', { class: 'section' }, h('h1', { tabindex: -1 }, AREA_NAME.words),
          h('p', { class: 'muted' }, 'Exam words come from your B1 exam app. Open it in this browser once and connect GitHub there (Settings → Remote). Then come back here.')),
        h('a', { class: 'btn', href: '../b1-exam/app/' }, 'Open the B1 exam app')));
      el.querySelector('h1')?.focus({ preventScroll: true });
      return;
    }
    const groups = (DATA.plan.groups[area] || []).map(g => {
      const gx = rd.groups[area + '/' + g.id]; if (!gx) return null;
      return h('div', { class: 'b1-sub' }, h('span', { class: 'b1-area-top' }, h('span', {}, g.name), h('span', { class: 'mono small' }, `${pct(gx.recall)} · ${gx.due} due`)), bar(gx.recall, gx.coverage));
    });
    rep(el, h('section', { class: 'b1-wrap' },
      h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, AREA_NAME[area]), h('p', { class: 'muted' }, intro)),
      x ? h('div', { class: 'card b1-card' }, h('span', { class: 'b1-area-top' }, h('span', {}, 'Would recall on exam day'), h('b', { class: 'mono' }, pct(x.recall))), bar(x.recall, x.coverage, 'big'),
        h('p', { class: 'muted small' }, `${pct(x.coverage)} seen · ${x.seen} of ${x.n} items · fast on ${pct(x.speed)} of what you've seen.`)) : null,
      groups,
      h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big b1-start', href: `#b1/${AREA_ROUTE[area]}/round` }, `Round: ${AREA_NAME[area]} · 12`))));
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  function drawGrammar(el, rd) {
    const rows = DATA.plan.topics.filter(t => t.rank <= 20).map(t => {
      const gx = rd.groups['grammar/' + t.id];
      const items = DATA.pool.filter(it => it.area === 'grammar' && it.group === t.id);
      if (!items.length) return null;
      const due = items.filter(isDue).length, nw = items.filter(unseen).length;
      return h('a', { class: 'b1-topic', href: '#b1/grammar/' + t.id },
        h('span', { class: 'b1-area-top' }, h('span', {}, h('span', { class: 'mono muted' }, String(t.rank).padStart(2, ' ') + '  '), t.name, t.trap ? h('span', { class: 'b1-trap' }, 'Trap') : null),
          h('span', { class: 'mono small' }, gx ? `${pct(gx.recall)} · ${due ? due + ' due' : nw ? nw + ' new' : 'done for today'}` : `${nw} new`)),
        gx ? bar(gx.recall, gx.coverage) : bar(0, 0));
    });
    rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Grammar'), h('p', { class: 'muted' }, 'Ranked by how much each topic counts in Sprechen and Schreiben. "Trap" marks your five sticky errors.')),
      rows, h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big b1-start', href: '#b1/grammar/round' }, 'Round: mixed grammar · 12'))));
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  function drawTopic(el, id) {
    const t = DATA.topics.get(id); if (!t) return drawHub(el);
    const items = DATA.pool.filter(it => it.area === 'grammar' && it.group === id);
    const conf = (t.confusable || []).map(x => DATA.topics.get(x)?.name).filter(Boolean);
    const dot = it => { const r = store[it.id]; return !r || !r.reps ? 'new' : r.learn != null || r.relearn ? 'learn' : FS.Ron(r, D8.exam()) >= 0.9 ? 'ok' : 'seen'; };
    rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1/grammar' }, '← Grammar'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, t.name), conf.length ? h('p', { class: 'muted' }, `Mixed with look-alikes: ${conf.join(' · ')}.`) : null),
      h('ul', { class: 'b1-items' }, items.map(it => h('li', {}, h('i', { class: 'b1-dot ' + dot(it), 'aria-hidden': 'true' }), h('span', { lang: 'de' }, it.model)))),
      h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big b1-start', href: `#b1/grammar/${id}/round` }, 'Round: this topic · 12'))));
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  function drawSituations(el) {
    const n = DATA.pool.filter(it => it.kind === 'topic' || it.kind === 'reply').length;
    rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Situations'), h('p', { class: 'muted' }, 'Topic match: a situation from Sprechen Teil 1, 2 or 3, or something your partner says. Answer with any phrase that does the job; every fitting phrase counts.')),
      h('p', { class: 'muted small' }, `${n} situations. They join your daily rounds once you know two phrases for that job; here you can practise all of them.`),
      h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big b1-start', href: '#b1/situations/round' }, 'Round: situations · 12'))));
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  function drawFrames(el) {
    const items = DATA.pool.filter(it => it.kind === 'phrase' && it.star && ['S1', 'S2', 'S3'].includes(it.group) && !it.bank);
    const byTeil = ['S1', 'S2', 'S3'].map(t => [t, items.filter(i => i.teil === t)]);
    const since = D8.add(D8.today(), -7);
    const mistakes = DATA.pool.filter(it => (store[it.id]?.hist || []).some(x => x[0] >= since && x[1] === 1));
    rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Your Sprechen frames')),
      byTeil.map(([t, list]) => list.length ? [h('h2', { class: 'b1-h2' }, { S1: 'Teil 1 · planen', S2: 'Teil 2 · Präsentation', S3: 'Teil 3 · Rückmeldung und Frage' }[t]),
        h('ul', { class: 'b1-items' }, list.map(i => h('li', { lang: 'de' }, i.model)))] : null),
      mistakes.length ? [h('h2', { class: 'b1-h2' }, 'Your mistakes this week'), h('ul', { class: 'b1-items' }, mistakes.map(i => h('li', { lang: 'de' }, i.model)))] : null));
    el.querySelector('h1')?.focus({ preventScroll: true });
  }

  // ---------- done screen ----------
  function drawDone(el, round) {
    const firsts = round.results.filter(r => r.first);
    const right = firsts.filter(r => r.ok).length, late = firsts.filter(r => r.ok && r.g === 2).length;
    const last = round.results[round.results.length - 1];
    const fixedLast = last && !last.first && last.ok;
    // before = the same store and exam set with only this round's items rolled back, so seeding, words loaded
    // mid-round or a new day never show up as progress
    const c0 = ctxNow(), set = examSet();
    const rd = st => RD.compute({ pool: DATA.pool, store: st, today: c0.today, exam: c0.exam, phase: c0.phase, examSet: set });
    const st0 = { ...store };
    for (const [id, r] of Object.entries(round.prev || {})) { if (r) st0[id] = r; else delete st0[id]; }
    const after = rd(store), b0 = rd(st0);
    const before = { recall: b0.overall.recall, areas: Object.fromEntries(Object.entries(b0.areas).map(([a, x]) => [a, x.recall])) };
    const nIn = a => new Set(round.results.filter(r => DATA.byId.get(r.id)?.area === a).map(r => r.id)).size;
    const moved = Object.entries(after.areas).map(([a, x]) => [a, 100 * (x.recall - (before.areas[a] || 0)), nIn(a)]).filter(([, d, n]) => n && Math.abs(d) >= 0.05);
    const pts = d => `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)} points`;
    const p1 = x => (100 * (x || 0)).toFixed(1);
    const missed = new Set(round.results.filter(r => r.first && !r.ok).map(r => r.id));   // a new item's second showing is not a fix
    const fixed = [...new Set(round.results.filter(r => !r.first && r.ok && missed.has(r.id)).map(r => r.id))].map(id => DATA.byId.get(id)).filter(Boolean);
    const news = [...new Set(round.results.filter(r => r.isNew).map(r => r.id))].map(id => DATA.byId.get(id)).filter(Boolean);
    const back = [...new Set(round.results.filter(r => r.first && !r.ok).map(r => r.id))].map(id => DATA.byId.get(id)).filter(Boolean);
    const short = it => it.model || it.prompt;
    const d = dayStore(), dueN = after.dueToday, newN = newLeft();
    const more = dueN > 0 || newN > 0;
    rep(el, h('section', { class: 'b1-wrap b1-done' },
      h('p', { class: 'eyebrow' }, 'Round done'),
      h('h1', { tabindex: -1 }, `${right} of ${firsts.length} right`),
      late ? h('p', { class: 'muted' }, `${plural(late, 'was', 'were')} late.`.replace(/^(\d+) was/, '$1 was')) : null,
      fixedLast ? h('p', { class: 'muted' }, 'Last one: right this time.') : null,
      h('div', { class: 'card b1-card' },
        h('span', { class: 'b1-area-top' }, h('span', {}, ctxNow().phase === 'after' ? 'Would recall now' : `Ready for ${D8.label(D8.exam()).replace(/^\w+ /, '')}`), h('b', { class: 'mono' }, `${p1(before.recall)} → ${p1(after.overall.recall)} %`)),
        bar(after.overall.recall, after.overall.coverage, 'big', [Math.min(before.recall, after.overall.recall), after.overall.recall]),
        moved.length ? h('ul', { class: 'b1-items small' }, moved.map(([a, dd, n]) => h('li', {}, `${AREA_NAME[a]}: ${plural(n, 'item')}, ${pts(dd)}`)))
          : h('p', { class: 'muted small' }, "Repeats don't change the bars. First tries tomorrow will.")),
      fixed.length ? [h('h2', { class: 'b1-h2' }, 'Fixed this round'), h('ul', { class: 'b1-items' }, fixed.map(i => h('li', { lang: 'de' }, short(i))))] : null,
      news.length ? [h('h2', { class: 'b1-h2' }, 'New today'), h('ul', { class: 'b1-items' }, news.map(i => h('li', { lang: 'de' }, short(i))))] : null,
      back.length ? [h('h2', { class: 'b1-h2' }, 'Back tomorrow'), h('ul', { class: 'b1-items' }, back.map(i => h('li', { lang: 'de' }, short(i))))] : null,
      more ? h('p', {}, h('b', {}, `Next: ${dueN} due`), h('span', { class: 'muted' }, ` · ${newN} new left today`)) : h('p', {}, "That's everything for today. ", h('span', { class: 'muted' }, `Tomorrow: ${forecast(D8.add(D8.today(), 1))} due.`)),
      h('p', { class: 'muted small' }, `Today: ${plural(d.rounds, 'round')}`),
      h('div', { class: 'b1-sticky' }, more ? h('a', { class: 'btn primary big b1-start', href: '#b1/round', id: 'b1-again' }, 'Another round') : h('a', { class: 'btn big', href: '#b1/aloud' }, 'Say it aloud'),
        h('a', { class: 'btn big', href: '#b1' }, 'Done'))));
    const onKey = e => { if (e.key === 'Enter' && more) { e.preventDefault(); go('round'); } if (e.key === 'Escape') go(''); };
    document.addEventListener('keydown', onKey); window.__cleanup = () => document.removeEventListener('keydown', onKey);
    el.querySelector('h1')?.focus({ preventScroll: true });
    backupNow();
  }

  // ---------- backup (one way: this device → private b1-exam repo, branch igloo-state) ----------
  let backupTimer = null;
  function backupSoon() { clearTimeout(backupTimer); }
  function backupLine() {
    const b = load(K.backup, null), tok = ghToken();
    if (!tok || !settings().backup) return 'Progress is saved on this device.';
    if (b && b.error) return `Progress is saved on this device. Backup failed: ${b.error}`;
    if (b && b.at) return `Progress is saved on this device and backed up to GitHub · ${ago(b.at)}.`;
    return 'Progress is saved on this device.';
  }
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function ghToken() { try { return JSON.parse(localStorage.getItem('gh:token')); } catch { return null; } }
  function deviceId() { let d = load('doors.b1.device', null); if (!d) { d = Math.random().toString(36).slice(2, 10); save('doors.b1.device', d); } return d; }
  function b1State() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('doors.b1.') && k !== K.words && k !== K.backup) out[k] = load(k, null); }
    return out;
  }
  async function backupNow() {
    const tok = ghToken();
    if (!tok || !settings().backup || !navigator.onLine) return;
    const path = `igloo-state/${deviceId()}.json`, url = `https://api.github.com/repos/pakrasi/b1-exam/contents/${path}`;
    const headers = { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const body = { v: 1, device: deviceId(), ua: navigator.userAgent.slice(0, 120), at: new Date().toISOString(), state: b1State() };
    const b64 = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
    try {
      let sha = load(K.backup, {})?.sha;
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(api.backupBody(body, sha, b64)) });
        if (r.ok) { const j = await r.json(); save(K.backup, { at: Date.now(), sha: j.content?.sha, error: null }); return; }
        if (r.status === 409 || r.status === 422) {
          const g = await fetch(url + '?ref=igloo-state', { headers, cache: 'no-store' });
          sha = g.ok ? (await g.json()).sha : null; continue;
        }
        if (r.status === 404) { save(K.backup, { at: null, error: 'the igloo-state branch is missing' }); return; }
        throw new Error(r.status === 401 || r.status === 403 ? 'the GitHub token was refused' : `GitHub ${r.status}`);
      }
    } catch (e) { save(K.backup, { ...load(K.backup, {}), error: e.message }); }
  }
  // the PUT body; branch is always igloo-state (a missing branch would write to main and trigger Pages)
  function backupBody(body, sha, b64) {
    return { message: `igloo b1 backup ${body.device}`, content: b64(JSON.stringify(body)), branch: 'igloo-state', ...(sha ? { sha } : {}) };
  }

  // ---------- updates: version.json on the hub, never mid-round ----------
  let lastCheck = 0;
  async function checkUpdate() {
    if (Date.now() - lastCheck < 60000 || !navigator.onLine) return;
    lastCheck = Date.now();
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) return;
      const v = await r.json();
      if (v.sw === 'off') return DG.swKill?.();
      if (v.v && v.v !== DG.V && !loadRound()) {
        try { sessionStorage.setItem('b1.updated', v.v); } catch {}
        const reg = await navigator.serviceWorker?.getRegistration();
        await reg?.update();
        if (reg?.waiting) reg.waiting.postMessage('skipWaiting');
        setTimeout(() => location.reload(), 400);
      }
    } catch {}
  }
  try { const u = sessionStorage.getItem('b1.updated'); if (u) { sessionStorage.removeItem('b1.updated'); setTimeout(() => toast('Updated'), 300); } } catch {}

  // ---------- settings section ----------
  DG.settingsSections = DG.settingsSections || [];
  DG.settingsSections.push(() => {
    const s = settings();
    const date = h('input', { type: 'date', class: 'field-sel', value: D8.exam(), onchange: e => { if (e.target.value) { localStorage.setItem('examDate', JSON.stringify(e.target.value)); } } });
    const sel = (k, opts2, labels) => h('select', { class: 'field-sel', onchange: e => setSetting(k, isNaN(+e.target.value) ? e.target.value : +e.target.value) }, opts2.map((o, i) => h('option', { value: o, selected: s[k] === o }, labels ? labels[i] : String(o))));
    const chk = (k, label) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!s[k], onchange: e => setSetting(k, e.target.checked) }), label);
    return h('div', { class: 'dlg-sec' }, h('h3', {}, 'B1 exam trainer'),
      h('label', { class: 'dlg-row' }, h('span', {}, 'Exam date'), date),
      h('label', { class: 'dlg-row' }, h('span', {}, 'New items per day'), sel('newPerDay', [20, 30, 40])),
      chk('claude', '"My answer is right" asks Claude (needs an API key here or in b1-exam)'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: s.layout === 'flow', onchange: e => setSetting('layout', e.target.checked ? 'flow' : 'docked') }), 'Simple layout (if the answer field jumps around the keyboard)'),
      chk('backup', 'Back up B1 progress to the private b1-exam repo (uses its GitHub token)'));
  });

  // ---------- dev hooks (localhost only) ----------
  function autoplay(view) {
    const n = +new URLSearchParams(location.search).get('b1auto'); if (!n) return;
    let k = 0;
    const stepOnce = () => {
      const sess = view.querySelector('.b1-sess'); if (!sess || !sess._auto) return;
      const a = sess._auto, it = a.entry?.item;
      if (!it) return;
      if (a.state === 'pick') { view.querySelector('.b1-move')?.click(); return setTimeout(stepOnce, 30); }
      if (a.state === 'answer' || a.state === 'repair') {
        if (k >= n) return src_end(view);
        const wrong = k % 5 === 4;
        const m = it.kind === 'reply' ? it.moves[0].model : it.model;
        let ans = wrong ? (it.wrong?.[0] || 'weiß nicht') : m;
        if (it.prefill && ans.startsWith(it.prefill)) ans = ans.slice(it.prefill.length).trim();
        if (it.gap && !wrong) ans = it.accept[0];
        a.input.value = ans; a.onReturn(); k++;
      } else if (a.state === 'retype') { a.input.value = (a.entry._right || '').replace(it.prefill || '\u0000', '').trim(); a.onReturn(); if (a.state === 'retype') view.querySelector('.b1-below .b1-sec')?.click(); }
      else if (a.state === 'feedback') a.onReturn();
      setTimeout(stepOnce, 20);
    };
    setTimeout(stepOnce, 50);
  }
  function src_end(view) { view.querySelector('.b1-end')?.click(); }

  const api = { addItems, recordSpoken, view, ensureData, readiness, compose, gradeAnswer, getStore, settings, load, save, K, bar, AREA_NAME, plural, pct, backupNow, backupBody, b1State, toast, ctxNow, dayStore, store: () => getStore(), data: () => DATA, rep, ghToken };
  window.B1 = api;
})();
