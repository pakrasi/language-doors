/* B1 trainer: readiness ("would recall on exam morning"), due counts and the 7-day forecast. Pure.
   recall = Σ w·R(exam) / Σ w over the EXAM SET (the items he will have met by exam−2 at the daily new quota; review
   M10), coverage = Σ w·seen / Σ w, w = 2 for ★ and trap items. Items outside the exam set are "extra" and don't count
   until after the exam. Area bars are rescaled to the areas that have items. */
(function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const D8 = isNode ? require('./b1day.js') : root.B1Day;
  const FS = isNode ? require('./fsrs.js') : root.FSRS;
  const AREAS = ['speaking', 'grammar', 'reading', 'words'];
  const WEIGHTS = { speaking: 0.40, grammar: 0.30, reading: 0.15, words: 0.15 };
  const w = it => (it.star || it.trap ? 2 : 1);
  const seenRec = rec => !!(rec && rec.reps);
  // due today: due ≤ today, or still learning / relearning, and not already answered today unless it's in a step
  function isDue(rec, today) {
    if (!seenRec(rec)) return false;
    if (rec.learn != null || rec.relearn) return true;
    return rec.due <= today && rec.last !== today;
  }
  function bucket() { return { sw: 0, rw: 0, cw: 0, n: 0, seen: 0, due: 0, fast: 0 }; }
  function add(b, it, rec, day, today) {
    const ww = w(it), seen = seenRec(rec);
    b.sw += ww; b.n++;
    if (seen) { b.cw += ww; b.seen++; b.rw += ww * FS.Ron(rec, day); if ((rec.stage || 0) >= 2) b.fast++; }
    if (isDue(rec, today)) b.due++;
  }
  const fin = b => ({ recall: b.sw ? b.rw / b.sw : 0, coverage: b.sw ? b.cw / b.sw : 0, n: b.n, seen: b.seen, due: b.due, speed: b.seen ? b.fast / b.seen : 0, empty: !b.n });
  // ctx: {pool: [items], store, today, exam, phase, examSet: Set|null, weights?}
  function compute(ctx) {
    const { pool, store, today, exam, phase } = ctx;
    const day = phase === 'after' ? today : exam;
    const weights = ctx.weights || WEIGHTS;
    const areas = {}, groups = {};
    let dueAll = 0;
    for (const it of pool) {
      const rec = store[it.id];
      if (isDue(rec, today)) dueAll++;
      if (ctx.examSet && phase !== 'after' && !ctx.examSet.has(it.id)) continue;
      const a = areas[it.area] || (areas[it.area] = bucket());
      add(a, it, rec, day, today);
      const gk = it.area + '/' + it.group;
      add(groups[gk] || (groups[gk] = bucket()), it, rec, day, today);
    }
    const out = { areas: {}, groups: {}, overall: null, dueToday: dueAll };
    let tw = 0, r = 0, c = 0, n = 0, seen = 0;
    for (const a of AREAS) {
      if (!areas[a]) continue;
      const f = fin(areas[a]); out.areas[a] = f;
      tw += weights[a]; r += weights[a] * f.recall; c += weights[a] * f.coverage; n += f.n; seen += f.seen;
    }
    for (const [k, b] of Object.entries(groups)) out.groups[k] = fin(b);
    out.overall = { recall: tw ? r / tw : 0, coverage: tw ? c / tw : 0, n, seen, without: AREAS.filter(a => !areas[a]) };
    return out;
  }
  // due counts for the next n days (today first), from the stored due dates
  function forecast(store, today, n = 7) {
    const out = Array.from({ length: n }, (_, i) => ({ day: D8.add(today, i), n: 0 }));
    for (const rec of Object.values(store)) {
      if (!seenRec(rec)) continue;
      const d = isDue(rec, today) ? today : rec.due;
      const i = D8.diff(today, d);
      if (i >= 0 && i < n) out[i].n++;
    }
    return out;
  }
  const api = { compute, forecast, isDue, WEIGHTS, AREAS, weightOf: w };
  root.B1Ready = api;
  if (isNode && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
