/* Doors and Glue: static app, no build step. */
(() => {
  'use strict';

  const PORT = {
    function: 'transfers fully', door: 'inventory transfers', turn: 'table changes per language',
    glue: 'inventory transfers, forms do not', slot: 'per language', chunk: 'per language',
    lexicon: 'per language', sound: 'per language',
  };
  const LAYER_TABS = ['door', 'glue', 'chunk', 'function', 'turn', 'slot', 'lexicon', 'sound'];
  const DRILL_LAYERS = ['door', 'glue', 'chunk'];
  const BOX_DAYS = [0, 1, 3, 7, 14, 30, 60];
  const PREF_KEY = 'doors.prefs.v2';
  const DRILL_KEY = 'doors.drill.v1';
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
  let drill = load(DRILL_KEY, {}); // `${lang}|${itemId}` -> {box, due, seen, right, wrong}
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
  $('#settings-clear').addEventListener('click', () => { drill = {}; progress = {}; save(DRILL_KEY, drill); save(PROGRESS_KEY, progress); settings.hidden = true; render(); });

  // ---------- routing: #view/level/lang,lang/extra ----------
  const VIEWS = ['reference', 'drill', 'practice', 'framework'];
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
    if (!state.langs.length) state.langs = FW.languages.map(l => l.id);
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
      lp.append(h('button', { type: 'button', class: on ? 'active' : '', 'aria-pressed': on ? 'true' : 'false', onclick: () => {
        let langs = on ? state.langs.filter(x => x !== l.id) : FW.languages.map(x => x.id).filter(x => state.langs.includes(x) || x === l.id);
        if (!langs.length) langs = [l.id];
        go({ langs, scenario: null });
      } }, l.name, h('span', { class: 'nat' }, l.native)));
    }
    const vp = $('#level-picker'); vp.innerHTML = '';
    for (const lv of [...FW.levels, 'all']) vp.append(h('button', { type: 'button', role: 'tab', class: (lv === state.level ? 'active ' : '') + (lv === 'all' ? 'all' : ''), onclick: () => go({ level: lv, scenario: null }) }, lv === 'all' ? 'All' : lv));
    document.querySelectorAll('.views a').forEach(a => { a.classList.toggle('active', a.dataset.view === state.view); a.onclick = e => { e.preventDefault(); go({ view: a.dataset.view }); }; });
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
    renderPickers();
    const view = $('#view');
    view.innerHTML = '';
    view.append(h('div', { class: 'loading' }, 'Loading…'));
    await ensureLangs(state.langs);
    view.innerHTML = '';
    ({ reference: viewReference, drill: viewDrill, practice: viewPractice, framework: viewFramework })[state.view](view);
  }

  // ===== Reference: compare across languages =====
  function viewReference(view) {
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
    const missing = state.langs.filter(l => !LANG[l]);
    if (missing.length) view.append(h('p', { class: 'muted small' }, 'No content file yet for: ' + missing.map(l => meta(l).name).join(', ') + '.'));

    function draw() {
      let rows = levelItems(state.layer);
      if (starOnly) rows = rows.filter(m => state.langs.some(l => item(l, m.id)?.star));
      if (query) rows = rows.filter(m => [m.id, m.en, ...state.langs.flatMap(l => { const it = item(l, m.id); return it ? [it.target, it.translit, it.gloss, it.example?.target, it.example?.gloss] : []; })].join(' ').toLowerCase().includes(query));
      wrap.innerHTML = '';
      if (!rows.length) { wrap.append(h('div', { class: 'empty' }, 'Nothing here.')); return; }
      const cols = state.langs.length;
      const table = h('table', { class: 'cmp l-' + state.layer, style: `--cols:${cols}` });
      table.append(h('thead', {}, h('tr', {}, h('th', { class: 'en-h' }, 'English'), state.langs.map(l => h('th', {}, meta(l).name)))));
      const tbody = h('tbody');
      for (const m of rows) {
        const starred = state.langs.some(l => item(l, m.id)?.star);
        const tr = h('tr', { class: 'crow', tabindex: 0, role: 'button', 'aria-expanded': 'false' },
          h('td', { class: 'en' }, h('div', { class: 'en-main' }, starred ? h('span', { class: 'star' }, '★ ') : null, m.en), h('div', { class: 'en-sub' }, tag(m.layer, m.id), state.level === 'all' ? lvl(m.level) : null, m.slot && m.slot !== '-' ? h('span', { class: 'slot' }, 'slot ' + m.slot) : null)),
          state.langs.map(l => h('td', { class: 'cell' }, target(l, item(l, m.id)))));
        const dtr = h('tr', { class: 'drow', hidden: true }, h('td', { colspan: cols + 1 }, h('div', { class: 'dets', style: `--cols:${cols}` }, m.note ? h('div', { class: 'det det-en' }, h('div', { class: 'det-lang' }, 'Framework'), h('div', { class: 'small' }, m.note)) : null, state.langs.map(l => detail(l, item(l, m.id))))));
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

  // ===== Drill: two-step multiple choice with spaced repetition =====
  function drillKey(lang, id) { return `${lang}|${id}`; }
  function drillState(lang, id) { return drill[drillKey(lang, id)] || { box: 0, due: 0, seen: 0, right: 0, wrong: 0 }; }
  function recordDrill(lang, id, correct) {
    const s = drillState(lang, id);
    s.seen++; correct ? s.right++ : s.wrong++;
    s.box = correct ? Math.min(s.box + 1, BOX_DAYS.length - 1) : 0;
    s.due = dayNow() + BOX_DAYS[s.box];
    drill[drillKey(lang, id)] = s; save(DRILL_KEY, drill);
  }
  function scenarioFor(id) { return FW.scenarios.filter(s => s.recipe.includes(id)); }
  function promptFor(m, langs) {
    // Prefer a scenario whose recipe uses this item; otherwise the example gloss from the first language that has one.
    const scs = scenarioFor(m.id).filter(s => state.level === 'all' || s.level === m.level || true);
    if (scs.length) { const s = scs[Math.floor(Math.random() * scs.length)]; return { kind: 'scenario', text: s.situation + ' ' + s.task, sub: 'Which ' + (m.layer === 'door' ? 'door' : m.layer) + ' does this need?' }; }
    for (const l of langs) { const it = item(l, m.id); if (it?.example?.gloss) return { kind: 'say', text: '“' + it.example.gloss + '”', sub: 'You want to say this. Which ' + (m.layer === 'door' ? 'door' : m.layer) + ' opens it?' }; }
    return { kind: 'say', text: m.en, sub: 'Which one is this?' };
  }

  function viewDrill(view) {
    const langs = state.langs.filter(l => LANG[l]);
    const layers = prefs.drillLayers?.length ? prefs.drillLayers.filter(l => DRILL_LAYERS.includes(l)) : ['door'];
    const size = prefs.drillSize || 10;
    view.append(h('header', { class: 'section' },
      h('div', { class: 'eyebrow' }, 'Drill · ' + (state.level === 'all' ? 'all levels' : state.level) + ' · ' + langs.map(l => meta(l).name).join(', ')),
      h('h1', {}, 'Pick the door'),
      h('p', { class: 'lede' }, 'A situation, then the right door in English, then that door\'s form in each of your languages. Cards you miss come back sooner.')));
    if (!langs.length) { view.append(h('div', { class: 'empty' }, 'None of the selected languages has a content file yet.')); return; }

    // pool
    const pool = FW.items.filter(m => layers.includes(m.layer) && (state.level === 'all' || m.level === state.level) && langs.some(l => item(l, m.id)));
    const today = dayNow();
    const due = pool.filter(m => langs.some(l => { const s = drillState(l, m.id); return s.seen && s.due <= today; }));
    const fresh = pool.filter(m => langs.every(l => !drillState(l, m.id).seen));
    const mastered = pool.filter(m => langs.every(l => drillState(l, m.id).box >= 3)).length;

    // setup panel
    const setup = h('div', { class: 'panel setup' });
    const layerChips = DRILL_LAYERS.map(l => h('button', { type: 'button', class: 'chip l-' + l + (layers.includes(l) ? ' active' : ''), onclick: e => { const set = new Set(layers); set.has(l) ? set.delete(l) : set.add(l); if (!set.size) set.add('door'); prefs.drillLayers = [...set]; save(PREF_KEY, prefs); render(); } }, layerName(l)));
    const sizeSel = h('select', { id: 'drill-size', onchange: e => { prefs.drillSize = +e.target.value; save(PREF_KEY, prefs); } }, [5, 10, 15, 20].map(n => h('option', { value: n, selected: n === size }, n + ' cards')));
    setup.append(
      h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, 'What to drill'), layerChips),
      h('div', { class: 'setup-row' }, h('span', { class: 'eyebrow' }, 'Session'), sizeSel),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, pool.length), h('span', {}, 'in pool')),
        h('div', { class: 'stat' }, h('b', {}, due.length), h('span', {}, 'due today')),
        h('div', { class: 'stat' }, h('b', {}, fresh.length), h('span', {}, 'never seen')),
        h('div', { class: 'stat' }, h('b', {}, mastered), h('span', {}, 'mastered'))),
      h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', id: 'drill-start', onclick: start }, due.length ? `Start: ${Math.min(size, due.length)} due` + (due.length < size ? ` + ${Math.min(size - due.length, fresh.length)} new` : '') : `Start: ${Math.min(size, pool.length)} cards`)));
    const perLang = h('div', { class: 'perlang' }, langs.map(l => {
      const seen = pool.filter(m => drillState(l, m.id).seen).length;
      const ok = pool.filter(m => drillState(l, m.id).box >= 3).length;
      return h('div', { class: 'pl' }, h('b', {}, meta(l).name), h('div', { class: 'bar' }, h('i', { style: `width:${pool.length ? 100 * ok / pool.length : 0}%` }), h('i', { class: 'seen', style: `width:${pool.length ? 100 * seen / pool.length : 0}%` })), h('span', { class: 'small muted' }, `${ok} solid · ${seen} seen · ${pool.length} total`));
    }));
    const stage = h('div', { class: 'stage' });
    view.append(h('div', { class: 'drill-layout' }, h('div', {}, setup, perLang), stage));
    stage.append(h('div', { class: 'card-intro' }, h('h3', {}, 'How a card works'),
      h('ol', {}, h('li', {}, 'Read the situation. Pick the door in English (4 options).'), h('li', {}, 'For each language, pick that door\'s form (4 options). Wrong answers show the right one with its example.'), h('li', {}, 'Each language keeps its own score for each door. Right answers push it out 1, 3, 7, 14, 30 days; a wrong answer brings it back tomorrow.'))));

    if (location.search.includes('autostart')) setTimeout(start, 0);
    function start() {
      let cards = shuffle(due).slice(0, size);
      if (cards.length < size) cards = cards.concat(shuffle(fresh).slice(0, size - cards.length));
      if (cards.length < size) cards = cards.concat(shuffle(pool.filter(m => !cards.includes(m))).slice(0, size - cards.length));
      if (!cards.length) return;
      const results = [];
      let idx = 0;
      next();
      function next() {
        if (idx >= cards.length) return summary();
        showCard(cards[idx], idx, cards.length, r => { results.push(r); idx++; next(); });
      }
      function summary() {
        stage.innerHTML = '';
        const byLang = langs.map(l => ({ l, ok: results.filter(r => r.byLang[l] === true).length, n: results.filter(r => l in r.byLang).length }));
        stage.append(h('div', { class: 'card summary' },
          h('div', { class: 'eyebrow' }, 'Session done'),
          h('h2', {}, `${results.filter(r => r.step1).length} of ${results.length} doors recognised`),
          h('div', { class: 'sum-grid' }, byLang.map(x => h('div', { class: 'stat' }, h('b', {}, `${x.ok}/${x.n}`), h('span', {}, meta(x.l).name)))),
          h('div', { class: 'sum-list' }, results.map(r => h('div', { class: 'sum-row' }, tag(r.m.layer, r.m.id), h('span', {}, r.m.en), h('span', { class: 'muted small' }, langs.map(l => (r.byLang[l] === true ? '✓' : r.byLang[l] === false ? '✗' : '·') + ' ' + meta(l).name.slice(0, 2)).join('  '))))),
          h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => render() }, 'Back to setup'))));
      }
    }

    function showCard(m, i, n, done) {
      stage.innerHTML = '';
      const result = { m, step1: null, byLang: {} };
      const card = h('div', { class: 'card drill-card l-' + m.layer });
      const prog = h('div', { class: 'card-prog' }, h('span', { class: 'mono' }, `${i + 1} / ${n}`), lvl(m.level), tag(m.layer, layerName(m.layer)));
      card.append(prog);
      const p = promptFor(m, langs);
      card.append(h('div', { class: 'prompt' }, h('div', { class: 'prompt-text' }, p.text), h('div', { class: 'prompt-sub' }, p.sub)));
      // step 1: english options
      const sameLevel = FW.items.filter(x => x.layer === m.layer && x.id !== m.id);
      const near = shuffle(sameLevel.filter(x => x.level === m.level)).concat(shuffle(sameLevel.filter(x => x.level !== m.level)));
      const opts1 = shuffle([m, ...near.slice(0, 3)]);
      const step1 = h('div', { class: 'step' }, h('div', { class: 'eyebrow' }, 'Step 1 · in English'));
      const btns1 = h('div', { class: 'opts' });
      for (const o of opts1) {
        const b = h('button', { type: 'button', class: 'opt', onclick: () => {
          if (result.step1 !== null) return;
          result.step1 = o.id === m.id;
          btns1.querySelectorAll('.opt').forEach(x => { x.disabled = true; x.classList.toggle('right', x.dataset.id === m.id); x.classList.toggle('wrong', x === b && o.id !== m.id); });
          step2();
        }, dataset: { id: o.id } }, o.en);
        btns1.append(b);
      }
      step1.append(btns1);
      card.append(step1);
      stage.append(card);

      function step2() {
        const langsWith = langs.filter(l => item(l, m.id));
        let remaining = langsWith.length;
        for (const l of langsWith) {
          const it = item(l, m.id);
          const others = shuffle(FW.items.filter(x => x.layer === m.layer && x.id !== m.id && item(l, x.id)?.target && item(l, x.id).target !== it.target));
          const opts = shuffle([it, ...others.slice(0, 3).map(x => item(l, x.id))]);
          const block = h('div', { class: 'step lang-step' }, h('div', { class: 'eyebrow' }, 'Step 2 · ' + meta(l).name));
          const btns = h('div', { class: 'opts' });
          const fb = h('div', { class: 'fb', hidden: true });
          for (const o of opts) {
            btns.append(h('button', { type: 'button', class: 'opt', onclick: e => {
              if (l in result.byLang) return;
              const ok = o === it; result.byLang[l] = ok; recordDrill(l, m.id, ok);
              btns.querySelectorAll('.opt').forEach(x => { x.disabled = true; });
              e.currentTarget.classList.add(ok ? 'right' : 'wrong');
              if (!ok) [...btns.children].find(x => x._it === it)?.classList.add('right');
              fb.hidden = false;
              fb.append(h('div', { class: 'fb-head' }, ok ? 'Right.' : 'Not quite.'), it.example?.target ? h('div', { class: 'det-ex' }, T(l, it.example.target), it.example.translit ? h('div', { class: 'tr' }, it.example.translit) : null, h('div', { class: 'gl' }, it.example.gloss)) : null, it.note ? h('div', { class: 'det-note' }, it.note) : null);
              if (--remaining === 0) card.append(h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn primary', onclick: () => done(result) }, i + 1 < n ? 'Next card →' : 'Finish')));
            } }, T(l, o.target), o.translit ? h('span', { class: 'tr' }, o.translit) : null));
            btns.lastChild._it = o;
          }
          block.append(btns, fb);
          card.append(block);
        }
        if (!langsWith.length) card.append(h('div', { class: 'row end' }, h('button', { type: 'button', class: 'btn primary', onclick: () => done(result) }, 'Next →')));
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
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
