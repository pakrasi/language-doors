/* Doors and Glue: static app, no build step. */
(() => {
  'use strict';

  const PORT = {
    function: 'transfers fully', door: 'inventory transfers', turn: 'table changes per language',
    glue: 'inventory transfers, forms do not', slot: 'per language', chunk: 'per language',
    lexicon: 'per language', sound: 'per language',
  };
  const LAYER_TABS = ['door', 'glue', 'chunk', 'function', 'turn', 'slot', 'lexicon', 'sound'];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const PREF_KEY = 'doors.prefs.v2';
  const PROGRESS_KEY = 'doors.progress.v1';
  const KEY_KEY = 'doors.apikey';

  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return el;
  };
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const dayNow = () => Math.floor(Date.now() / 86400000);

  // ---------- state ----------
  let FW = null;
  const LANG = {};                 // id -> language json | null (missing)
  let prefs = load(PREF_KEY, {});
  let progress = load(PROGRESS_KEY, {});
  let state = { view: 'reference', level: 'A1', langs: [], layer: 'door', scenario: null, plang: null };

  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ } }

  // ---------- theme & settings ----------
  function applyTheme() {
    const t = prefs.theme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
  }
  $('#theme-btn').addEventListener('click', () => { prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; save(PREF_KEY, prefs); applyTheme(); });
  applyTheme();
  const settings = $('#settings');
  $('#settings-btn').addEventListener('click', () => { $('#api-key').value = localStorage.getItem(KEY_KEY) || ''; settings.hidden = false; $('#api-key').focus(); });
  $('#settings-close').addEventListener('click', () => settings.hidden = true);
  settings.addEventListener('click', e => { if (e.target === settings) settings.hidden = true; });
  $('#settings-save').addEventListener('click', () => {
    const v = $('#api-key').value.trim();
    try { v ? localStorage.setItem(KEY_KEY, v) : localStorage.removeItem(KEY_KEY); } catch {}
    settings.hidden = true; render();
  });
  $('#settings-clear').addEventListener('click', () => { srs = {}; progress = {}; save(SRS_KEY, srs); save(PROGRESS_KEY, progress); settings.hidden = true; render(); });

  // ---------- routing: #view/level/lang,lang/extra ----------
  const VIEWS = ['reference', 'chunks', 'drill', 'practice', 'framework'];
  function parseHash() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const next = { ...state };
    if (VIEWS.includes(p[0])) next.view = p[0];
    if (p[1] && (FW.levels.includes(p[1]) || p[1] === 'all')) next.level = p[1];
    if (p[2]) { const ids = p[2].split(',').filter(id => FW.languages.some(l => l.id === id)); if (ids.length) next.langs = ids; }
    if (p[3]) { if (LAYER_TABS.includes(p[3])) next.layer = p[3]; else if (/^SC-/.test(p[3])) next.scenario = p[3]; }
    return next;
  }
  function go(patch = {}) {
    state = { ...state, ...patch };
    if (!state.langs.length) state.langs = FW.languages.filter(l => l.full).map(l => l.id);
    const parts = [state.view, state.level, state.langs.join(',')];
    if (state.view === 'reference') parts.push(state.layer);
    if (state.view === 'practice' && state.scenario) parts.push(state.scenario);
    const hash = '#' + parts.join('/');
    if (location.hash !== hash) history.replaceState(null, '', hash);
    Object.assign(prefs, { view: state.view, level: state.level, langs: state.langs, layer: state.layer });
    save(PREF_KEY, prefs);
    render();
  }
  window.addEventListener('hashchange', () => { state = parseHash(); render(); });

  // ---------- data ----------
  async function getJSON(path) { const r = await fetch(path, { cache: 'no-cache' }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }
  async function ensureLangs(ids) {
    await Promise.all(ids.map(async id => {
      if (id in LANG) return;
      try { const L = await getJSON(`data/${id}.json`); L._byId = Object.fromEntries((L.items || []).map(i => [i.id, i])); L._sc = Object.fromEntries((L.scenarios || []).map(s => [s.id, s])); LANG[id] = L; }
      catch { LANG[id] = null; }
    }));
  }
  const meta = id => FW.languages.find(l => l.id === id);
  const master = () => FW._master || (FW._master = Object.fromEntries(FW.items.map(i => [i.id, i])));
  const layerName = id => FW.layers.find(l => l.id === id)?.name || id;
  const levelItems = (layer) => FW.items.filter(i => i.layer === layer && (state.level === 'all' || i.level === state.level));
  const item = (lang, id) => LANG[lang]?._byId[id];

  // ---------- pickers ----------
  function renderPickers() {
    const lp = $('#lang-picker'); lp.innerHTML = '';
    for (const l of FW.languages) {
      const on = state.langs.includes(l.id);
      lp.append(h('button', { type: 'button', title: l.full ? '' : 'Chunk bank only (no door framework yet)', class: (on ? 'active' : '') + (l.full ? '' : ' partial'), 'aria-pressed': on ? 'true' : 'false', onclick: () => {
        let langs = on ? state.langs.filter(x => x !== l.id) : FW.languages.map(x => x.id).filter(x => state.langs.includes(x) || x === l.id);
        if (!langs.length) langs = [l.id];
        go({ langs, scenario: null });
      } }, l.name, h('span', { class: 'nat' }, l.native)));
    }
    const vp = $('#level-picker'); vp.innerHTML = '';
    for (const lv of [...FW.levels, 'all']) vp.append(h('button', { type: 'button', role: 'tab', class: (lv === state.level ? 'active ' : '') + (lv === 'all' ? 'all' : ''), onclick: () => go({ level: lv, scenario: null }) }, lv === 'all' ? 'All' : lv));
    document.querySelectorAll('.views a[data-view]').forEach(a => { a.classList.toggle('active', a.dataset.view === state.view); a.onclick = e => { e.preventDefault(); go({ view: a.dataset.view }); }; });
    $('#brand').onclick = e => { e.preventDefault(); go({ view: 'reference' }); };
  }

  // ---------- shared ----------
  function T(lang, text, cls = '') { return h('span', { class: 't ' + cls, lang, dataset: { script: meta(lang).script } }, text); }
  function target(lang, it, big = false) {
    if (!it) return h('span', { class: 'missing' }, '—');
    return h('div', { class: 'tt' + (big ? ' big' : '') }, T(lang, it.target), it.translit ? h('div', { class: 'tr' }, it.translit) : null);
  }
  function detail(lang, it) {
    const m = meta(lang);
    if (!it) return h('div', { class: 'det' }, h('div', { class: 'det-lang' }, m.name), h('div', { class: 'muted small' }, 'Not written yet.'));
    return h('div', { class: 'det' },
      h('div', { class: 'det-lang' }, m.name),
      h('div', { class: 'det-target' }, T(lang, it.target), it.translit ? h('span', { class: 'tr' }, ' ' + it.translit) : null),
      it.gloss ? h('div', { class: 'gl' }, it.gloss) : null,
      it.example?.target ? h('div', { class: 'det-ex' }, T(lang, it.example.target), it.example.translit ? h('div', { class: 'tr' }, it.example.translit) : null, h('div', { class: 'gl' }, it.example.gloss)) : null,
      it.note ? h('div', { class: 'det-note' }, it.note) : null);
  }
  const tag = (layer, text) => h('span', { class: `tag l-${layer}` }, text);
  const lvl = t => h('span', { class: 'lvl' }, t);

  // ---------- render ----------
  async function render() {
    if (!FW) return;
    if (window.__cleanup) { window.__cleanup(); window.__cleanup = null; }
    document.body.classList.remove('focus');
    renderPickers();
    const view = $('#view');
    view.innerHTML = '';
    view.append(h('div', { class: 'loading' }, 'Loading…'));
    await ensureLangs(state.langs);
    view.innerHTML = '';
    ({ reference: viewReference, chunks: viewChunks, drill: viewDrill, practice: viewPractice, framework: viewFramework })[state.view](view);
  }

  // ===== Reference: compare across languages =====
  function viewReference(view) {
    const RL = state.langs.filter(l => meta(l).full);
    const partial = state.langs.filter(l => !meta(l).full);
    let query = '';
    let starOnly = !!prefs.starOnly;
    view.append(h('header', { class: 'section' },
      h('div', { class: 'eyebrow' }, 'Reference · ' + (state.level === 'all' ? 'all levels' : state.level)),
      h('h1', {}, 'Same door, every language'),
      h('p', { class: 'lede' }, 'One row per item, your languages side by side. Tap a row for the example and the rule. ★ marks what to learn first.')));
    const tabs = h('div', { class: 'tabs' }, LAYER_TABS.map(l => h('button', { type: 'button', class: 'tab l-' + l + (l === state.layer ? ' active' : ''), onclick: () => go({ layer: l }) }, layerName(l), h('span', { class: 'n' }, levelItems(l).length))));
    const search = h('input', { type: 'search', placeholder: 'Search English, target, or ID…', 'aria-label': 'Search', id: 'ref-search' });
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });
    const starChip = h('button', { type: 'button', class: 'chip star' + (starOnly ? ' active' : ''), onclick: () => { starOnly = !starOnly; prefs.starOnly = starOnly; save(PREF_KEY, prefs); starChip.classList.toggle('active', starOnly); draw(); } }, '★ Starred only');
    view.append(tabs, h('div', { class: 'toolbar' }, search, starChip));
    const wrap = h('div', { class: 'scroll-x' });
    view.append(wrap);
    if (partial.length) view.append(h('p', { class: 'muted small' }, partial.map(l => meta(l).name).join(', ') + ' have the chunk bank only so far; see the Chunks tab.'));
    const missing = RL.filter(l => !LANG[l]);
    if (missing.length) view.append(h('p', { class: 'muted small' }, 'No content file yet for: ' + missing.map(l => meta(l).name).join(', ') + '.'));

    function draw() {
      let rows = levelItems(state.layer);
      if (starOnly) rows = rows.filter(m => RL.some(l => item(l, m.id)?.star));
      if (query) rows = rows.filter(m => [m.id, m.en, ...RL.flatMap(l => { const it = item(l, m.id); return it ? [it.target, it.translit, it.gloss, it.example?.target, it.example?.gloss] : []; })].join(' ').toLowerCase().includes(query));
      wrap.innerHTML = '';
      if (!rows.length) { wrap.append(h('div', { class: 'empty' }, 'Nothing here.')); return; }
      const cols = RL.length;
      const table = h('table', { class: 'cmp l-' + state.layer, style: `--cols:${cols}` });
      table.append(h('thead', {}, h('tr', {}, h('th', { class: 'en-h' }, 'English'), RL.map(l => h('th', {}, meta(l).name)))));
      const tbody = h('tbody');
      for (const m of rows) {
        const starred = RL.some(l => item(l, m.id)?.star);
        const tr = h('tr', { class: 'crow', tabindex: 0, role: 'button', 'aria-expanded': 'false' },
          h('td', { class: 'en' }, h('div', { class: 'en-main' }, starred ? h('span', { class: 'star' }, '★ ') : null, m.en), h('div', { class: 'en-sub' }, tag(m.layer, m.id), state.level === 'all' ? lvl(m.level) : null, m.slot && m.slot !== '-' ? h('span', { class: 'slot' }, 'slot ' + m.slot) : null)),
          RL.map(l => h('td', { class: 'cell' }, target(l, item(l, m.id)))));
        const dtr = h('tr', { class: 'drow', hidden: true }, h('td', { colspan: cols + 1 }, h('div', { class: 'dets', style: `--cols:${cols}` }, m.note ? h('div', { class: 'det det-en' }, h('div', { class: 'det-lang' }, 'Framework'), h('div', { class: 'small' }, m.note)) : null, RL.map(l => detail(l, item(l, m.id))))));
        const toggle = () => { const open = dtr.hidden; dtr.hidden = !open; tr.classList.toggle('open', open); tr.setAttribute('aria-expanded', open ? 'true' : 'false'); };
        tr.addEventListener('click', toggle);
        tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
        tbody.append(tr, dtr);
      }
      table.append(tbody);
      wrap.append(table);
    }
    draw();
  }

  // ===== Chunk bank: data + static list =====
  let CHUNK_EN = null; const CHUNK = {};
  const CHUNK_CATS = [['sentence_frame', 'Frames'], ['collocation', 'Collocations'], ['gambit_filler', 'Gambits and fillers'], ['fixed_formula', 'Fixed formulas'], ['discourse_connector', 'Connectors']];
  async function ensureChunks(langs) {
    if (!CHUNK_EN) { try { CHUNK_EN = await getJSON('data/chunks/en.json'); CHUNK_EN.forEach((c, i) => { c._i = i; }); } catch { CHUNK_EN = []; } }
    await Promise.all(langs.map(async l => { if (l in CHUNK) return; try { CHUNK[l] = (await getJSON(`data/chunks/${l}.json`)).chunks; } catch { CHUNK[l] = null; } }));
  }
  const chunkLevelOK = c => state.level === 'all' || c.cefr_level === state.level;
  function chunkLine(lang, r, open) {
    const m = meta(lang);
    return h('div', { class: 'ck-line' },
      h('div', { class: 'ck-lang' }, m.name),
      h('div', { class: 'ck-t' },
        r ? [T(lang, r.t), r.tr ? h('div', { class: 'tr' }, r.tr) : null] : h('span', { class: 'missing' }, 'not translated yet'),
        r && open ? h('div', { class: 'ck-ex' }, T(lang, r.ex), r.extr ? h('div', { class: 'tr' }, r.extr) : null) : null,
        r && open && r.n ? h('div', { class: 'ck-n' }, r.n) : null));
  }
  function viewChunks(view) {
    const langs = state.langs;
    const cat = prefs.chunkCat || 'all';
    let query = '';
    let expandAll = !!prefs.chunkExpand;
    view.append(h('header', { class: 'section' },
      h('div', { class: 'eyebrow' }, 'Chunk bank · ' + (state.level === 'all' ? 'all levels' : state.level)),
      h('h1', {}, 'Chunk bank'),
      h('p', { class: 'lede' }, 'The phrases fluent speakers reach for without thinking: frames, collocations, gambits, formulas and connectors. English on top, each of your languages underneath. Tap a chunk for its example sentence and notes.')));
    const catChips = h('div', { class: 'subtabs' }, [['all', 'All']].concat(CHUNK_CATS).map(([k, l]) => h('button', { type: 'button', class: 'chip' + (k === cat ? ' active dark' : ''), onclick: () => { prefs.chunkCat = k; save(PREF_KEY, prefs); render(); } }, l)));
    const search = h('input', { type: 'search', placeholder: 'Search English, target, or function…', 'aria-label': 'Search chunks', id: 'chunk-search' });
    const expBtn = h('button', { type: 'button', class: 'chip' + (expandAll ? ' active dark' : ''), onclick: () => { expandAll = !expandAll; prefs.chunkExpand = expandAll; save(PREF_KEY, prefs); expBtn.classList.toggle('active', expandAll); expBtn.classList.toggle('dark', expandAll); draw(); } }, 'Show examples');
    const count = h('span', { class: 'muted small' });
    view.append(catChips, h('div', { class: 'toolbar' }, search, expBtn), count);
    const list = h('div', { class: 'ck-list' }); view.append(list);
    const more = h('button', { type: 'button', class: 'btn', onclick: () => { shown += 60; paint(); } }, 'Show more');
    view.append(more);
    let rows = [], shown = 60;
    search.addEventListener('input', () => { query = search.value.trim().toLowerCase(); draw(); });
    list.append(h('div', { class: 'loading' }, 'Loading chunks…'));
    ensureChunks(langs).then(draw);
    function draw() {
      rows = (CHUNK_EN || []).filter(c => chunkLevelOK(c) && (cat === 'all' || c.category === cat));
      if (query) rows = rows.filter(c => [c.chunk, c.pragmatic_function, c.natural_example, c.id, ...langs.flatMap(l => { const r = CHUNK[l]?.[c.id]; return r ? [r.t, r.tr, r.ex] : []; })].join(' ').toLowerCase().includes(query));
      const missing = langs.filter(l => !CHUNK[l]);
      count.textContent = `${rows.length} chunk${rows.length === 1 ? '' : 's'}` + (missing.length ? ` · not yet translated: ${missing.map(l => meta(l).name).join(', ')}` : '');
      shown = 60; paint();
    }
    function paint() {
      list.innerHTML = '';
      if (!rows.length) {
        const lv = (CHUNK_EN || []).length && !query && !(CHUNK_EN || []).some(c => c.cefr_level === state.level);
        list.append(lv ? h('div', { class: 'empty' }, `The chunk bank has no ${state.level} chunks yet; it covers B1 and B2. `, h('button', { type: 'button', class: 'btn small-btn', onclick: () => go({ level: 'B1' }) }, 'Show B1'), ' ', h('button', { type: 'button', class: 'btn small-btn', onclick: () => go({ level: 'B2' }) }, 'Show B2')) : h('div', { class: 'empty' }, 'Nothing matches.'));
        more.hidden = true; return;
      }
      for (const c of rows.slice(0, shown)) {
        let open = expandAll;
        const entry = h('article', { class: 'ck', tabindex: 0 });
        const fill = () => {
          entry.replaceChildren(...[
            h('div', { class: 'ck-head' },
              h('div', { class: 'ck-en' }, c.chunk),
              h('div', { class: 'ck-meta' }, h('span', { class: 'lvl' }, c.cefr_level), h('span', { class: 'ck-cat' }, (CHUNK_CATS.find(x => x[0] === c.category) || [, c.category])[1]), h('span', {}, c.pragmatic_function), c.register !== 'neutral' ? h('span', { class: 'ck-reg' }, c.register) : null)),
            open ? h('div', { class: 'ck-enex' }, c.natural_example) : null,
            h('div', { class: 'ck-lines' }, langs.map(l => chunkLine(l, CHUNK[l]?.[c.id], open)))].filter(Boolean));
          entry.classList.toggle('open', open);
        };
        const toggle = () => { open = !open; fill(); };
        entry.addEventListener('click', e => { if (!window.getSelection()?.toString()) toggle(); });
        entry.addEventListener('keydown', e => { if (e.key === 'Enter') toggle(); });
        fill(); list.append(entry);
      }
      more.hidden = shown >= rows.length;
      more.textContent = `Show more (${rows.length - shown} left)`;
    }
  }

  // ===== Drill: keyboard-paced production practice with spaced repetition =====
  const SRS_KEY = 'doors.srs.v1';
  let srs = load(SRS_KEY, {});            // `${lang}|${cardId}` -> {ease, ivl, due, reps, lapses, last, hist}
  let SENT_EN = null; const SENT = {};     // sentence bank
  const VOICE_LANG = { german: 'de-DE', french: 'fr-FR', hindi: 'hi-IN', swissgerman: 'de-CH', khasi: null, bengali: 'bn-IN', spanish: 'es-MX', italian: 'it-IT', portuguese: 'pt-BR', arabic: 'ar-SA' };
  const BANK_LEVEL = { want: 'A1', like: 'A1', go: 'A1', decline: 'A2', live: 'B1', if: 'B1' };
  const app = (el, ...k) => el.append(...k.flat(Infinity).filter(x => x != null && x !== false));
  const rep = (el, ...k) => el.replaceChildren(...k.flat(Infinity).filter(x => x != null && x !== false));
  const GRADES = [[1, 'Again', 'r1'], [2, 'Hard', 'r2'], [3, 'Good', 'r3'], [4, 'Easy', 'r4']];

  async function ensureSentences(langs) {
    if (!SENT_EN) { try { SENT_EN = await getJSON('data/sentences/en.json'); } catch { SENT_EN = { meanings: [] }; } }
    await Promise.all(langs.map(async l => { if (l in SENT) return; try { SENT[l] = await getJSON(`data/sentences/${l}.json`); } catch { SENT[l] = null; } }));
  }
  const srsKey = (lang, id) => `${lang}|${id}`;
  const srsGet = (lang, id) => srs[srsKey(lang, id)] || { ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, last: 0, hist: '' };
  function srsGrade(lang, id, g) {
    const s = srsGet(lang, id); const today = dayNow();
    if (g === 1) { s.ivl = 0; s.lapses++; s.ease = Math.max(1.3, s.ease - 0.2); }
    else if (s.reps === 0 || s.ivl === 0) { s.ivl = g === 2 ? 1 : g === 3 ? 1 : 3; }
    else { const f = g === 2 ? 1.2 : g === 3 ? s.ease : s.ease * 1.3; s.ivl = Math.max(s.ivl + 1, Math.round(s.ivl * f)); }
    if (g === 2) s.ease = Math.max(1.3, s.ease - 0.15); if (g === 4) s.ease += 0.15;
    s.reps++; s.last = today; s.due = today + s.ivl; s.hist = (s.hist + g).slice(-12);
    srs[srsKey(lang, id)] = s; save(SRS_KEY, srs);
  }
  function srsUndo(lang, id, prev) { if (prev) srs[srsKey(lang, id)] = prev; else delete srs[srsKey(lang, id)]; save(SRS_KEY, srs); }

  // Build the card pool: one card = one meaning with an answer per language that has it.
  function buildCards(langs, types) {
    const M = master(); const cards = [];
    const lvOK = lv => state.level === 'all' || lv === state.level;
    if (types.includes('chunk')) for (const m of FW.items) {
      if (!['door', 'glue', 'chunk'].includes(m.layer) || !lvOK(m.level)) continue;
      const per = {}; for (const l of langs) { const it = item(l, m.id); if (it?.target) per[l] = { target: it.target, translit: it.translit, note: it.note, hint: null }; }
      if (Object.keys(per).length) cards.push({ id: 'I:' + m.id, type: 'chunk', level: m.level, en: m.en, sub: layerName(m.layer) + ' · ' + m.id, prio: (langs.some(l => item(l, m.id)?.star) ? 0 : 1), per });
    }
    if (types.includes('sentence')) {
      for (const m of FW.items) {
        if (!['door', 'glue', 'chunk'].includes(m.layer) || !lvOK(m.level)) continue;
        const per = {}; for (const l of langs) { const it = item(l, m.id); if (it?.example?.target && it.example.gloss) per[l] = { target: it.example.target, translit: it.example.translit, note: it.note, hint: it.target, gloss: it.example.gloss }; }
        // use the first language's gloss as the prompt; glosses differ slightly per language, so prefer the most common one
        const glosses = Object.values(per).map(p => p.gloss); if (!glosses.length) continue;
        const en = glosses.sort((a, b) => glosses.filter(x => x === b).length - glosses.filter(x => x === a).length)[0];
        for (const l of Object.keys(per)) if (per[l].gloss !== en) per[l].altGloss = per[l].gloss;
        cards.push({ id: 'X:' + m.id, type: 'sentence', level: m.level, en, sub: 'uses ' + m.id, prio: 1, per });
      }
      if (SENT_EN) for (const mn of SENT_EN.meanings) for (const v of mn.variants) {
        if (!lvOK(BANK_LEVEL[mn.id] || 'A2')) continue;
        const per = {}; for (const l of langs) { const s = SENT[l]?.variants?.[`${mn.id}.${v.id}`]; if (s) per[l] = { target: s.tokens.map(t => t[0]).join(' '), translit: s.tokens.some(t => t[2]) ? s.tokens.map(t => t[2] || '').join(' ') : '', note: s.why, hint: null, blocks: s.tokens }; }
        if (Object.keys(per).length) cards.push({ id: 'S:' + mn.id + '.' + v.id, type: 'sentence', level: BANK_LEVEL[mn.id] || 'A2', en: v.tokens.map(t => t[0]).join(' '), sub: mn.recipe.join(' · ') + ' · ' + v.label, prio: 0, per, enBlocks: v.tokens });
      }
    }
    if (types.includes('bank') && CHUNK_EN) for (const k of CHUNK_EN) {
      if (!chunkLevelOK(k)) continue;
      const per = {}; for (const l of langs) { const r = CHUNK[l]?.[k.id]; if (r) per[l] = { target: r.ex, translit: r.extr, note: r.n, hint: r.t, chunk: r.t, chunkTr: r.tr }; }
      if (Object.keys(per).length) cards.push({ id: 'K:' + k.id, type: 'chunk bank', level: k.cefr_level, en: k.natural_example, sub: k.chunk + '  ·  ' + k.pragmatic_function + (k.register !== 'neutral' ? '  ·  ' + k.register : ''), prio: 0.5 + k._i / 10000, per });
    }
    if (types.includes('scenario')) for (const sc of FW.scenarios) {
      if (!lvOK(sc.level)) continue;
      const per = {}; for (const l of langs) { const d = LANG[l]?._sc?.[sc.id]; if (d?.model?.target) per[l] = { target: d.model.target, translit: d.model.translit, note: d.tip, hint: sc.recipe.map(id => item(l, id)?.target).filter(Boolean).join('  ·  '), blocks: (d.breakdown || []).map(b => [b.text, b.layer === 'door' ? 'door' : b.layer === 'glue' ? 'glue' : b.layer === 'chunk' ? 'chunk' : b.layer === 'turn' ? 'aux' : 'x']), alt: d.alt, gloss: d.model.gloss }; }
      if (Object.keys(per).length) cards.push({ id: 'C:' + sc.id, type: 'scenario', level: sc.level, en: sc.task, sub: sc.situation, prio: 0, per });
    }
    return cards;
  }

  function speak(lang, text) {
    const code = VOICE_LANG[lang]; if (!code || !('speechSynthesis' in window)) return false;
    const voices = speechSynthesis.getVoices(); const v = voices.find(x => x.lang.replace('_', '-') === code) || voices.find(x => x.lang.startsWith(code.slice(0, 2)));
    if (!v) return false;
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\s*\/\s*.*$/, '')); u.voice = v; u.lang = v.lang; u.rate = 0.9; speechSynthesis.speak(u); return true;
  }
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  const ROLE_CLS = { door: 'door', door2: 'door', glue: 'glue', aux: 'turn', neg: 'slot', q: 'function', x: 'filler', chunk: 'chunk' };
  function blockRow(lang, blocks) {
    return h('div', { class: 'blocks' }, blocks.map(b => { const roles = String(b[1]).split('|'); const cls = ROLE_CLS[roles.find(r => ROLE_CLS[r])] || 'filler'; return h('div', { class: `blk l-${cls}` }, h('div', { class: 'w' }, lang === 'en' ? b[0] : T(lang, b[0])), b[2] ? h('div', { class: 'lb' }, b[2]) : null); }));
  }

  function viewDrill(view) {
    let langs = state.langs.slice();
    const types = prefs.drillTypes?.length ? prefs.drillTypes : ['bank', 'sentence'];
    const size = prefs.drillSize || 25;
    const order = prefs.drillOrder || 'grouped';
    const autoplay = prefs.drillAudio !== false;
    view.append(h('header', { class: 'section' },
      h('div', { class: 'eyebrow' }, 'Drill · ' + (state.level === 'all' ? 'all levels' : state.level) + ' · ' + langs.map(l => meta(l).name).join(', ')),
      h('h1', {}, 'Say it.'),
      h('p', { class: 'lede' }, 'Read the meaning, say it out loud in the language shown, then press Space to check. Grade yourself honestly; the schedule does the rest.')));
    const stage = h('div', { class: 'drill-stage' }); view.append(stage);
    window.__cleanup = () => stage._cleanup?.();
    stage.append(h('div', { class: 'loading' }, 'Loading…'));
    Promise.all([ensureSentences(langs), ensureChunks(langs)]).then(() => { langs = langs.filter(l => LANG[l] || CHUNK[l]); if (!langs.length) { stage.replaceChildren(h('div', { class: 'empty' }, 'None of the selected languages has content yet.')); return; } setup(); });

    function setup() {
      stage.innerHTML = '';
      const cards = buildCards(langs, types);
      const today = dayNow();
      const prompts = cards.flatMap(c => Object.keys(c.per).map(l => ({ c, l, s: srsGet(l, c.id) })));
      const due = prompts.filter(p => p.s.reps && p.s.due <= today), fresh = prompts.filter(p => !p.s.reps);
      const streak = computeStreak();
      const panel = h('div', { class: 'panel setup' });
      const typeChips = [['bank', 'Chunk bank'], ['chunk', 'Door chunks'], ['sentence', 'Sentences'], ['scenario', 'Scenarios']].map(([t, l]) => h('button', { type: 'button', class: 'chip' + (types.includes(t) ? ' active dark' : ''), onclick: () => { const s = new Set(types); s.has(t) ? s.delete(t) : s.add(t); if (!s.size) s.add('sentence'); prefs.drillTypes = [...s]; save(PREF_KEY, prefs); render(); } }, l));
      const sizeSel = h('select', { onchange: e => { prefs.drillSize = +e.target.value; save(PREF_KEY, prefs); } }, [10, 25, 50, 100].map(n => h('option', { value: n, selected: n === size }, n + ' prompts')));
      const orderSel = h('select', { onchange: e => { prefs.drillOrder = e.target.value; save(PREF_KEY, prefs); } }, [['grouped', 'Same meaning across languages'], ['mixed', 'Shuffled']].map(([v, l]) => h('option', { value: v, selected: v === order }, l)));
      const audioChk = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: autoplay, onchange: e => { prefs.drillAudio = e.target.checked; save(PREF_KEY, prefs); } }), ' Play the answer aloud where a voice exists');
      panel.append(
        h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, 'Cards'), ...typeChips),
        h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, 'Session'), sizeSel, orderSel),
        audioChk,
        h('div', { class: 'stats' },
          h('div', { class: 'stat' }, h('b', {}, due.length), h('span', {}, 'due today')),
          h('div', { class: 'stat' }, h('b', {}, fresh.length), h('span', {}, 'new')),
          h('div', { class: 'stat' }, h('b', {}, cards.length), h('span', {}, 'meanings in pool')),
          h('div', { class: 'stat' }, h('b', {}, streak), h('span', {}, 'day streak'))),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary big', id: 'drill-start', onclick: () => start(cards) }, due.length ? `Start · ${Math.min(size, due.length)} due` + (due.length < size && fresh.length ? ` + ${Math.min(size - due.length, fresh.length)} new` : '') : `Start · ${Math.min(size, prompts.length)} prompts`), h('span', { class: 'muted small hint-space' }, 'or press Space')));
      const perLang = h('div', { class: 'perlang' }, langs.map(l => {
        const mine = prompts.filter(p => p.l === l); const seen = mine.filter(p => p.s.reps).length; const solid = mine.filter(p => p.s.ivl >= 7).length; const dueL = mine.filter(p => p.s.reps && p.s.due <= today).length;
        return h('div', { class: 'pl' }, h('b', {}, meta(l).name), h('div', { class: 'bar' }, h('i', { style: `width:${mine.length ? 100 * solid / mine.length : 0}%` }), h('i', { class: 'seen', style: `width:${mine.length ? 100 * seen / mine.length : 0}%` })), h('span', { class: 'small muted' }, `${dueL} due · ${solid} solid · ${seen} seen · ${mine.length} total`));
      }));
      const keys = h('div', { class: 'keys-help' }, h('div', { class: 'eyebrow' }, 'Keys'),
        ...[['Space', 'show answer, then Good + next'], ['1 2 3 4', 'Again · Hard · Good · Easy'], ['H', 'hint: the door chunk'], ['P', 'hear it'], ['U', 'undo last grade'], ['Esc', 'end session']].map(([k, d]) => h('div', { class: 'key-row' }, h('kbd', {}, k), h('span', {}, d))));
      stage.append(h('div', { class: 'drill-layout' }, h('div', {}, panel, perLang), h('div', { class: 'panel' }, keys, h('p', { class: 'small muted' }, 'On a phone, tap the card to reveal and tap a grade. A prompt is one meaning in one language. Same meaning across languages means you say it in each of your languages back to back, which makes the differences between them stick.'))));
      const onKey = e => { if (e.code === 'Space' && !e.target.matches('input,select,textarea,button')) { e.preventDefault(); document.removeEventListener('keydown', onKey); start(cards); } };
      document.addEventListener('keydown', onKey);
      stage._cleanup = () => document.removeEventListener('keydown', onKey);
      if (location.search.includes('autostart')) setTimeout(() => start(cards), 0);
    }

    function computeStreak() {
      const days = new Set(Object.values(srs).map(s => s.last).filter(Boolean)); let d = dayNow(); if (!days.has(d)) d--; let n = 0; while (days.has(d)) { n++; d--; } return n;
    }

    function start(cards) {
      stage._cleanup?.();
      const today = dayNow();
      const byCard = c => Object.keys(c.per).filter(l => langs.includes(l));
      // choose cards: due first (any language due), then new by priority
      const dueCards = cards.filter(c => byCard(c).some(l => { const s = srsGet(l, c.id); return s.reps && s.due <= today; }));
      const newCards = cards.filter(c => byCard(c).every(l => !srsGet(l, c.id).reps)).sort((a, b) => a.prio - b.prio || FW.levels.indexOf(a.level) - FW.levels.indexOf(b.level));
      const rest = cards.filter(c => !dueCards.includes(c) && !newCards.includes(c));
      let queue = [];
      const push = (list, sh = true) => { for (const c of (sh ? shuffle(list) : list)) { if (queue.length >= size) break; for (const l of byCard(c)) { const s = srsGet(l, c.id); const isDue = s.reps && s.due <= today; if (list === dueCards && !isDue && s.reps) continue; queue.push({ c, l }); } } };
      push(dueCards); if (queue.length < size) push(newCards, false); if (queue.length < size) push(rest);
      queue = queue.slice(0, size);
      if (order === 'mixed') queue = shuffle(queue);
      if (!queue.length) { stage.replaceChildren(h('div', { class: 'empty' }, 'Nothing to drill with these settings.')); return; }
      const total = queue.length; const done = []; let i = 0; let revealed = false; let hinted = false; let lastUndo = null;
      const session = h('div', { class: 'session' }); stage.replaceChildren(session); document.body.classList.add('focus');
      const escBtn = h('button', { type: 'button', class: 'btn small-btn', onclick: end }, 'End · Esc');
      const bar = h('div', { class: 'sess-bar' }, h('div', { class: 'sess-prog' }, h('i')), h('span', { class: 'mono sess-n' }), escBtn);
      const cardEl = h('div', { class: 'card sess-card', onclick: e => { if (!revealed && !e.target.closest('button')) reveal(); } });
      const foot = h('div', { class: 'sess-foot' });
      session.append(bar, cardEl, foot);

      function show() {
        if (i >= queue.length) return summary();
        revealed = false; hinted = false;
        const { c, l } = queue[i]; const a = c.per[l]; const m = meta(l);
        bar.querySelector('.sess-prog i').style.width = (100 * i / total) + '%'; bar.querySelector('.sess-n').textContent = `${i + 1} / ${total}`;
        cardEl.innerHTML = ''; cardEl.className = 'card sess-card';
        app(cardEl, 
          h('div', { class: 'sess-lang' }, h('span', { class: 'say' }, 'Say it in'), h('b', { class: 'lang-name' }, m.name), h('span', { class: 'lvl' }, c.level), h('span', { class: 'lvl' }, c.type)),
          c.type === 'scenario' ? h('div', { class: 'sess-sub' }, c.sub) : null,
          h('div', { class: 'sess-prompt' }, c.enBlocks ? blockRow('en', c.enBlocks) : c.en),
          c.type !== 'scenario' ? h('div', { class: 'sess-sub mono' }, c.sub) : null,
          h('div', { class: 'sess-hint', hidden: true }),
          h('div', { class: 'sess-answer', hidden: true }));
        rep(foot, h('button', { type: 'button', class: 'btn primary big', onclick: reveal }, 'Show answer', h('kbd', {}, 'Space')), a.hint ? h('button', { type: 'button', class: 'btn', onclick: hint }, 'Hint', h('kbd', {}, 'H')) : null);
        if (!reduce) cardEl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'ease-out' });
        if (i === 0 && location.search.includes('reveal')) setTimeout(reveal, 0);
      }
      function hint() { if (revealed || hinted) return; hinted = true; const { c, l } = queue[i]; const a = c.per[l]; const el = cardEl.querySelector('.sess-hint'); el.hidden = false; el.replaceChildren(h('span', { class: 'eyebrow' }, 'hint '), T(l, a.hint)); }
      function reveal() {
        if (revealed) return; revealed = true;
        const { c, l } = queue[i]; const a = c.per[l];
        const el = cardEl.querySelector('.sess-answer'); el.hidden = false; el.innerHTML = '';
        app(el, h('div', { class: 'ans-main' }, T(l, a.target)), a.translit ? h('div', { class: 'tr big-tr' }, a.translit) : null);
        if (a.chunk) app(el, h('div', { class: 'ans-chunk' }, h('span', { class: 'eyebrow' }, 'chunk'), T(l, a.chunk), a.chunkTr ? h('span', { class: 'tr' }, a.chunkTr) : null));
        if (a.blocks) app(el, blockRow(l, a.blocks));
        if (a.altGloss) app(el, h('div', { class: 'gl' }, 'literally: ' + a.altGloss));
        if (a.alt) app(el, h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Also natural: '), T(l, a.alt)));
        if (a.note) app(el, h('div', { class: 'ans-note' }, a.note));
        const canSpeak = !!VOICE_LANG[l];
        rep(foot, 
          h('div', { class: 'grades' }, GRADES.map(([g, label, cls]) => h('button', { type: 'button', class: 'btn grade ' + cls, onclick: () => grade(g) }, label, h('kbd', {}, g === 3 ? 'Space' : String(g))))),
          h('div', { class: 'row' }, canSpeak ? h('button', { type: 'button', class: 'btn', onclick: () => speak(l, a.target) }, 'Hear it', h('kbd', {}, 'P')) : h('span', { class: 'muted small' }, 'no voice for ' + meta(l).name + ' on this device'), lastUndo ? h('button', { type: 'button', class: 'btn', onclick: undo }, 'Undo', h('kbd', {}, 'U')) : null));
        cardEl.classList.add('revealed');
        if (autoplay && canSpeak) speak(l, a.target);
        if (!reduce) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
      }
      function grade(g) {
        if (!revealed) return;
        const { c, l } = queue[i]; const prev = srs[srsKey(l, c.id)] ? { ...srs[srsKey(l, c.id)] } : null;
        srsGrade(l, c.id, g); lastUndo = { i, l, id: c.id, prev };
        done.push({ c, l, g });
        if (g === 1 && !queue[i].requeued) queue.push({ c, l, requeued: true });
        i++; show();
      }
      function undo() { if (!lastUndo) return; srsUndo(lastUndo.l, lastUndo.id, lastUndo.prev); done.pop(); if (queue[queue.length - 1]?.requeued && queue[queue.length - 1].c.id === lastUndo.id) queue.pop(); i = lastUndo.i; lastUndo = null; show(); }
      function onKey(e) {
        if (e.target.matches('input,select,textarea')) return;
        if (e.code === 'Space') { e.preventDefault(); revealed ? grade(3) : reveal(); }
        else if (['1', '2', '3', '4'].includes(e.key) && revealed) grade(+e.key);
        else if (e.key === 'h' || e.key === 'H') hint();
        else if (e.key === 'p' || e.key === 'P') { const { c, l } = queue[i] || {}; if (c && revealed) speak(l, c.per[l].target); }
        else if (e.key === 'u' || e.key === 'U') undo();
        else if (e.key === 'Escape') end();
      }
      document.addEventListener('keydown', onKey);
      stage._cleanup = () => document.removeEventListener('keydown', onKey);
      function end() { stage._cleanup?.(); window.speechSynthesis?.cancel(); summary(); }
      function summary() {
        stage._cleanup?.(); document.body.classList.remove('focus');
        bar.querySelector('.sess-prog i').style.width = '100%';
        const byLang = langs.map(l => { const mine = done.filter(d => d.l === l); return { l, n: mine.length, good: mine.filter(d => d.g >= 3).length, again: mine.filter(d => d.g === 1).length }; }).filter(x => x.n);
        const hard = done.filter(d => d.g <= 2);
        const seenIds = new Set(); const hardRows = hard.filter(d => { const k = d.l + d.c.id; if (seenIds.has(k)) return false; seenIds.add(k); return true; });
        const dueTomorrow = Object.values(srs).filter(s => s.due === dayNow() + 1).length;
        cardEl.innerHTML = ''; cardEl.className = 'card sess-card summary';
        app(cardEl, 
          h('div', { class: 'eyebrow' }, 'Session done'),
          h('h2', {}, done.length ? `${done.filter(d => d.g >= 3).length} of ${done.length} said well` : 'Nothing graded'),
          h('div', { class: 'sum-grid' }, byLang.map(x => h('div', { class: 'stat' }, h('b', {}, `${x.good}/${x.n}`), h('span', {}, meta(x.l).name + (x.again ? ` · ${x.again} again` : ''))))),
          hardRows.length ? h('div', { class: 'section' }, h('div', { class: 'eyebrow' }, 'Worth another look'), h('div', { class: 'sum-list' }, hardRows.map(d => h('div', { class: 'sum-row three' }, h('span', { class: 'lvl' }, meta(d.l).name), h('span', {}, d.c.en), T(d.l, d.c.per[d.l].target))))) : h('p', { class: 'muted' }, 'Nothing marked Again or Hard. Consider a harder level or scenarios.'),
          h('p', { class: 'small muted' }, `${dueTomorrow} prompt${dueTomorrow === 1 ? '' : 's'} come back tomorrow.`));
        rep(foot, h('button', { type: 'button', class: 'btn primary big', onclick: () => render() }, 'Back to setup', h('kbd', {}, 'Space')));
        const k = e => { if (e.code === 'Space') { e.preventDefault(); document.removeEventListener('keydown', k); render(); } }; document.addEventListener('keydown', k); stage._cleanup = () => document.removeEventListener('keydown', k);
      }
      show();
    }
  }

  // ===== Practice: write the sentence, one language at a time =====
  function viewPractice(view) {
    const langs = state.langs.filter(l => LANG[l]);
    if (!langs.length) { view.append(h('div', { class: 'empty' }, 'None of the selected languages has a content file yet.')); return; }
    const plang = langs.includes(state.plang) ? state.plang : langs[0];
    state.plang = plang;
    const L = LANG[plang]; const m = meta(plang); const M = master();
    const scenarios = FW.scenarios.filter(s => state.level === 'all' || s.level === state.level);
    const prog = progress[plang] = progress[plang] || {};
    let current = scenarios.find(s => s.id === state.scenario) || scenarios.find(s => !prog[s.id]) || scenarios[0];
    state.scenario = current.id;

    view.append(h('header', { class: 'section' },
      h('div', { class: 'eyebrow' }, 'Practice · ' + (state.level === 'all' ? 'all levels' : state.level)),
      h('h1', {}, 'Say it in ' + m.name),
      h('div', { class: 'subtabs' }, langs.map(l => h('button', { type: 'button', class: 'chip' + (l === plang ? ' active dark' : ''), onclick: () => { state.plang = l; render(); } }, meta(l).name)))));
    const main = h('div', { class: 'scenario' });
    const side = h('aside', { class: 'side' });
    view.append(h('div', { class: 'practice' }, main, side));

    function drawSide() {
      side.innerHTML = '';
      const done = scenarios.filter(s => prog[s.id]).length;
      side.append(h('div', { class: 'panel' },
        h('div', { class: 'eyebrow' }, `${m.name} · ${done} of ${scenarios.length}`),
        h('div', { class: 'progress' }, scenarios.map(s => h('i', { class: prog[s.id] ? 'r' + prog[s.id].rating : '' }))),
        h('div', { class: 'sc-list' }, scenarios.map(s => h('button', { type: 'button', class: s.id === current.id ? 'active' : '', onclick: () => { current = s; go({ scenario: s.id }); } },
          h('span', { class: 'dot ' + (prog[s.id] ? 'r' + prog[s.id].rating : '') }), h('span', { class: 'mono' }, s.id.replace('SC-', '')), h('span', { class: 'ellip' }, s.task))))));
    }
    function drawMain() {
      main.innerHTML = '';
      const sc = current; const data = L._sc[sc.id];
      main.append(h('div', { class: 'sc-head' }, lvl(sc.level), h('span', { class: 'mono muted' }, sc.id), tag('function', sc.function), h('span', { class: 'muted small' }, M[sc.function]?.en)));
      const body = h('div', { class: 'sc-body' }); main.append(body);
      body.append(h('div', { class: 'situation' }, sc.situation), h('div', { class: 'task' }, sc.task));
      const hintRow = h('div', { class: 'hint-row' });
      for (const id of [...sc.recipe, sc.turn]) { const mm = M[id]; if (!mm) continue; const it = item(plang, id); hintRow.append(h('div', { class: `hint l-${mm.layer}` }, h('span', { class: 'id' }, id), it ? T(plang, it.target) : h('span', { class: 't' }, mm.en))); }
      let open = !!prefs.hintsOpen; hintRow.hidden = !open;
      const hintBtn = h('button', { type: 'button', class: 'btn small-btn', onclick: () => { open = !open; prefs.hintsOpen = open; save(PREF_KEY, prefs); hintRow.hidden = !open; hintBtn.textContent = open ? 'Hide recipe' : 'Show recipe'; } }, open ? 'Hide recipe' : 'Show recipe');
      body.append(h('div', { class: 'row' }, hintBtn, h('span', { class: 'muted small' }, 'The doors, glue and chunks the model answer uses.')), hintRow);
      const ta = h('textarea', { id: 'attempt', placeholder: `Write it in ${m.name}…`, lang: plang, dataset: { script: m.script } });
      if (prog[sc.id]?.attempt) ta.value = prog[sc.id].attempt;
      const hasKey = !!localStorage.getItem(KEY_KEY);
      const aiBtn = h('button', { type: 'button', class: 'btn', onclick: aiCheck, title: hasKey ? '' : 'Add an API key in settings to enable' }, 'Check with Claude'); aiBtn.disabled = !hasKey;
      const nextBtn = h('button', { type: 'button', class: 'btn', onclick: () => { const i = scenarios.indexOf(current); current = scenarios[(i + 1) % scenarios.length]; go({ scenario: current.id }); } }, 'Next →');
      body.append(ta, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: check }, 'Check'), h('button', { type: 'button', class: 'btn', onclick: () => reveal() }, 'Show model'), aiBtn, h('span', { style: 'flex:1' }), nextBtn));
      const result = h('div', { class: 'result' }); body.append(result);
      if (prog[sc.id]) reveal(false);

      const norm = s => (s || '').normalize('NFC').toLowerCase().replace(/[.,!?;:"'’“”()\-]/g, ' ').replace(/\s+/g, ' ').trim();
      function check() {
        if (!data) return reveal();
        const a = norm(ta.value); if (!a) return ta.focus();
        const hits = (data.keys || []).map(k => ({ k, hit: a.includes(norm(k)) }));
        result.replaceChildren(h('div', { class: 'row' }, h('b', {}, `${hits.filter(x => x.hit).length} of ${hits.length} key pieces found`), h('span', { class: 'muted small' }, 'Key-word check only; a different correct phrasing can score low.')), h('div', { class: 'keys' }, hits.map(x => h('span', { class: 'key ' + (x.hit ? 'hit' : 'miss') }, T(plang, x.k)))));
        reveal(true);
      }
      function reveal(keep = true) {
        if (!data) { result.replaceChildren(h('div', { class: 'empty' }, 'No model answer written yet.')); return; }
        result.replaceChildren(...(keep ? [...result.children].filter(el => !el.classList.contains('model')) : []));
        const blocks = h('div', { class: 'blocks' }, (data.breakdown || []).map(b => h('div', { class: `blk l-${b.layer || 'filler'}` }, h('div', { class: 'w' }, T(plang, b.text)), h('div', { class: 'lb' }, b.label || b.id || (b.layer === 'filler' ? 'slot' : b.layer)))));
        result.append(h('div', { class: 'model' }, h('div', { class: 'eyebrow' }, 'Model answer'), blocks,
          data.model.translit ? h('div', { class: 'tr' }, data.model.translit) : null, h('div', { class: 'gl' }, data.model.gloss),
          data.alt ? h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Also natural: '), T(plang, data.alt)) : null,
          data.tip ? h('div', { class: 'small' }, h('b', {}, 'Watch out: '), data.tip) : null,
          h('div', { class: 'rate' }, [[3, 'Got it'], [2, 'Almost'], [1, 'Missed it']].map(([r, label]) => h('button', { type: 'button', class: `btn r${r}` + (prog[sc.id]?.rating === r ? ' active' : ''), onclick: () => rate(r) }, label)))));
      }
      function rate(r) { prog[sc.id] = { rating: r, attempt: ta.value, at: new Date().toISOString() }; save(PROGRESS_KEY, progress); drawSide(); main.querySelectorAll('.rate button').forEach(b => b.classList.toggle('active', b.classList.contains('r' + r))); }
      async function aiCheck() {
        const key = localStorage.getItem(KEY_KEY); const attempt = ta.value.trim(); if (!key || !attempt) return ta.focus();
        aiBtn.disabled = true; aiBtn.textContent = 'Checking…';
        const box = h('div', { class: 'ai' }, h('span', { class: 'muted' }, 'Asking Claude…')); result.prepend(box);
        try {
          const recipe = sc.recipe.map(id => `${id}: ${item(plang, id)?.target || M[id]?.en}`).join('\n');
          const prompt = `You are a ${m.name} tutor (${m.variety}). The learner is at CEFR ${sc.level}.\nSituation: ${sc.situation}\nTask: ${sc.task}\nRecipe the model answer uses:\n${recipe}\nModel answer: ${data?.model?.target || '(none)'}\n\nLearner's attempt:\n${attempt}\n\nJudge the attempt on its own merits; it need not match the model. Reply with JSON only:\n{"score": 0-3, "corrected": "the attempt with minimal corrections, in ${m.name}", "feedback": "2-3 sentences in English: what was right, the one most important fix, whether the recipe pieces were used", "natural": "how a native speaker would most likely say it"}`;
          const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'anthropic-beta': 'server-side-fallback-2026-07-01' }, body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 1024, fallbacks: 'default', messages: [{ role: 'user', content: prompt }] }) });
          const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status);
          const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          let parsed = null; try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch {}
          box.replaceChildren(h('div', { class: 'score' }, parsed ? `Claude: ${parsed.score} / 3` : 'Claude'), parsed ? h('div', {}, h('span', { class: 'muted' }, 'Corrected: '), T(plang, parsed.corrected)) : null, h('div', {}, parsed ? parsed.feedback : text), parsed?.natural ? h('div', {}, h('span', { class: 'muted' }, 'Native version: '), T(plang, parsed.natural)) : null);
          if (parsed && typeof parsed.score === 'number') rate(Math.max(1, Math.min(3, Math.round(parsed.score))));
        } catch (e) { box.replaceChildren(h('div', {}, 'Could not reach Claude: ' + e.message)); }
        finally { aiBtn.disabled = false; aiBtn.textContent = 'Check with Claude'; }
      }
    }
    drawSide(); drawMain();
  }

  // ===== Framework =====
  function viewFramework(view) {
    view.append(h('header', { class: 'section' },
      h('div', { class: 'eyebrow' }, 'The framework'),
      h('h1', {}, 'Doors and Glue'),
      h('p', { class: 'lede' }, 'A door is a verb frame with one open slot. A turn rotates it through time. Glue joins clauses and sets word order. Slots hold the words. Functions decide which of these you reach for. A level is a slice through all of it.')));
    view.append(h('section', { class: 'section' }, h('h2', {}, 'The stack'), h('div', { class: 'stack' }, FW.layers.map(layer => h('div', { class: `band l-${layer.id}` }, h('b', {}, layer.name), h('span', {}, layer.desc), h('span', { class: 'port' }, PORT[layer.id]))))));
    const langs = state.langs.filter(l => LANG[l]);
    if (!langs.length) return;
    let cur = langs.includes(state.plang) ? state.plang : langs[0];
    const tabs = h('div', { class: 'subtabs' });
    const body = h('div', { class: 'section' });
    view.append(h('section', { class: 'section' }, h('h2', {}, 'Each language in six notes'), tabs, body));
    function draw() {
      tabs.replaceChildren(...langs.map(l => h('button', { type: 'button', class: 'chip' + (l === cur ? ' active dark' : ''), onclick: () => { cur = l; state.plang = l; draw(); } }, meta(l).name)));
      const L = LANG[cur]; const notes = L.notes || {};
      body.innerHTML = '';
      body.append(h('p', { class: 'muted' }, meta(cur).variety));
      body.append(h('div', { class: 'grid-2' }, [['variety', 'Variety and register taught'], ['turns', 'How this language carries time'], ['wordOrder', 'Word order'], ['slotGrammar', 'Slot grammar'], ['sound', 'Sound and script'], ['register', 'Formal and informal address']].map(([k, t]) => h('div', { class: 'note-card' }, h('h4', {}, t), h('p', {}, notes[k] || '—')))));
      const grid = h('div', { class: 'turn-grid' }, h('div'), ...['simple', 'progressive', 'perfect'].map(a => h('div', { class: 'h' }, a)));
      for (const t of ['past', 'present', 'future']) { grid.append(h('div', { class: 'rh' }, t)); for (const a of ['simple', 'progressive', 'perfect']) { const c = (L.turnGrid || []).find(x => x.time === t && x.aspect === a) || {}; grid.append(h('div', { class: 'turn-cell' }, T(cur, c.form || '—'), c.translit ? h('div', { class: 'tr' }, c.translit) : null, h('div', { class: 'gl' }, c.gloss || ''), c.note ? h('div', { class: 'note' }, c.note) : null)); } }
      body.append(h('h3', {}, 'The turn table for GO'), h('div', { class: 'scroll-x' }, grid));
    }
    draw();
  }

  // ---------- boot ----------
  (async () => {
    try { FW = await getJSON('data/framework.json'); }
    catch (e) { $('#view').replaceChildren(h('div', { class: 'empty' }, 'Could not load the framework: ' + e.message)); return; }
    state.view = prefs.view || 'reference'; state.level = prefs.level || 'A1'; state.layer = prefs.layer || 'door';
    state.langs = (prefs.langs || []).filter(id => FW.languages.some(l => l.id === id));
    if (location.hash.length > 1) state = parseHash();
    go({});
  })();
})();
