/* Igloo app: Drill, Test, Look up, Write. Static, no build step. Shared helpers come from site.js (window.DG). */
(() => {
  'use strict';
  const { h, $, getJSON, framework, load, save, KEYS, dayNow } = DG;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrow = matchMedia('(max-width: 640px)');
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const app = (el, ...k) => el.append(...k.flat(Infinity).filter(x => x != null && x !== false));
  const rep = (el, ...k) => el.replaceChildren(...k.flat(Infinity).filter(x => x != null && x !== false));
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  const fmt = n => n.toLocaleString('en');

  // ---------- state ----------
  let FW = null;
  const prefs = DG.prefs;
  let progress = load(KEYS.progress, {});
  const srs = DG.srs;
  const VIEWS = ['drill', 'test', 'lookup', 'write'];
  const TABS = ['phrases', 'frames', 'linking', 'grammar', 'notes'];
  const OLD_VIEW = { reference: 'lookup', chunks: 'lookup', practice: 'write' };
  const OLD_LAYER_TAB = { door: 'frames', glue: 'linking' };
  const GRAMMAR = [['turn', 'Tense, "not" and questions'], ['slot', 'Nouns, articles and cases'], ['chunk', 'Set phrases'], ['lexicon', 'Vocabulary'], ['sound', 'Pronunciation'], ['function', 'Tasks']];
  let state = { view: 'drill', level: 'A1', tab: 'phrases', gl: 'turn', scenario: null, plang: null, sub: null, tlevel: null };
  let firstRender = true;

  // ---------- routing ----------
  // New hashes: #drill, #drill/start, #drill/try, #test, #test/placement, #test/sweep/<level>, #lookup/<tab>, #write/<SC-id>.
  // Old hashes (#reference/A1/khasi,german/door, #chunks/B1/…, #practice/A2/…/SC-…) are mapped on the way in.
  function parseHash() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(x => x !== '');
    const next = { ...state, sub: null };
    let v = p[0]; const old = v in OLD_VIEW || (p[1] && (FW.levels.includes(p[1]) || p[1] === 'all'));
    if (v in OLD_VIEW) v = OLD_VIEW[v];
    if (VIEWS.includes(v)) next.view = v;
    if (old) {
      if (p[1] && (FW.levels.includes(p[1]) || p[1] === 'all')) next.level = p[1];
      if (p[2]) {
        const ids = p[2].split(',').filter(id => FW.languages.some(l => l.id === id));
        if (ids.length) { const mine = DG.langs(); DG.setLangs([...mine.filter(l => ids.includes(l)), ...ids.filter(l => !mine.includes(l))]); }
      }
      if (p[0] === 'chunks') next.tab = 'phrases';
      if (p[0] === 'reference') { const layer = p[3] || 'door'; if (OLD_LAYER_TAB[layer]) next.tab = OLD_LAYER_TAB[layer]; else { next.tab = 'grammar'; if (GRAMMAR.some(g => g[0] === layer)) next.gl = layer; } }
      if (p[0] === 'practice' && /^SC-/.test(p[3] || '')) next.scenario = p[3];
    } else {
      if (next.view === 'lookup' && TABS.includes(p[1])) next.tab = p[1];
      if (next.view === 'write' && /^SC-/.test(p[1] || '')) next.scenario = p[1];
      if (next.view === 'drill' && ['start', 'try'].includes(p[1])) next.sub = p[1];
      if (next.view === 'test' && p[1] === 'placement') next.sub = 'placement';
      if (next.view === 'test' && p[1] === 'sweep' && Readiness.LEVELS.includes(p[2])) { next.sub = 'sweep'; next.tlevel = p[2]; }
    }
    return next;
  }
  function hashFor(s) {
    if (s.view === 'lookup') return '#lookup/' + s.tab;
    if (s.view === 'write') return '#write' + (s.scenario ? '/' + s.scenario : '');
    if (s.view === 'test') return '#test';
    return '#drill';
  }
  function go(patch = {}, opts = {}) {
    state = { ...state, ...patch };
    const hash = hashFor(state);
    if (location.hash !== hash) history.replaceState(null, '', hash);
    Object.assign(prefs, { view: state.view, level: state.level, lookTab: state.tab, grammarLayer: state.gl });
    DG.savePrefs();
    render(opts);
  }
  window.addEventListener('hashchange', () => {
    if (/^#\/?(framework|how)\b/.test(location.hash)) { location.replace('index.html#how'); return; }
    state = parseHash(); render();
  });

  // ---------- data ----------
  const LANG = {}; const CHUNK = {}; const SENT = {}; let CHUNK_EN = null; let SENT_EN = null;
  const FAILED = new Map();   // path -> label
  function fail(path, label) { FAILED.set(path, label); drawBanner(); }
  function drawBanner() {
    const b = $('#banner');
    if (!FAILED.size) { b.replaceChildren(); return; }
    b.replaceChildren(h('div', { class: 'banner', role: 'alert' }, `Couldn't load ${[...new Set(FAILED.values())].join(', ')}.`,
      h('button', { type: 'button', class: 'btn small-btn', onclick: () => {
        for (const p of FAILED.keys()) {
          const m = p.match(/^data\/(?:(chunks|sentences)\/)?([a-z_]+)\.json$/);
          if (!m) continue;
          const [, dir, id] = m;
          if (dir === 'chunks') { if (id === 'en') CHUNK_EN = null; else delete CHUNK[id]; }
          else if (dir === 'sentences') { if (id === 'en') SENT_EN = null; else delete SENT[id]; }
          else delete LANG[id];
        }
        FAILED.clear(); drawBanner(); render();
      } }, 'Retry')));
  }
  async function ensureLangs(ids) {
    await Promise.all(ids.filter(id => meta(id)?.full).map(async id => {
      if (id in LANG) return;
      try { const L = await getJSON(`data/${id}.json`); L._byId = Object.fromEntries((L.items || []).map(i => [i.id, i])); L._sc = Object.fromEntries((L.scenarios || []).map(s => [s.id, s])); LANG[id] = L; }
      catch { LANG[id] = null; fail(`data/${id}.json`, `${meta(id).name} (frames and writing tasks)`); }
    }));
  }
  async function ensureChunks(langs) {
    if (!CHUNK_EN) { try { CHUNK_EN = await getJSON('data/chunks/en.json'); CHUNK_EN.forEach((c, i) => { c._i = i; }); } catch { CHUNK_EN = []; fail('data/chunks/en.json', 'the phrase list'); } }
    await Promise.all(langs.map(async l => { if (l in CHUNK) return; try { CHUNK[l] = (await getJSON(`data/chunks/${l}.json`)).chunks; } catch { CHUNK[l] = null; fail(`data/chunks/${l}.json`, `${meta(l).name} phrases`); } }));
  }
  async function ensureSentences(langs) {
    if (!SENT_EN) { try { SENT_EN = await getJSON('data/sentences/en.json'); } catch { SENT_EN = { meanings: [] }; fail('data/sentences/en.json', 'the sentence bank'); } }
    await Promise.all(langs.filter(l => meta(l)?.full).map(async l => { if (l in SENT) return; try { SENT[l] = await getJSON(`data/sentences/${l}.json`); } catch { SENT[l] = null; fail(`data/sentences/${l}.json`, `${meta(l).name} sentences`); } }));
  }
  let TURNS = null;
  async function ensureTurns() { if (!TURNS) { try { TURNS = await getJSON('data/turns.json'); } catch { TURNS = { languages: {} }; fail('data/turns.json', 'the tense table'); } } }
  const meta = id => FW.languages.find(l => l.id === id);
  const master = () => FW._master || (FW._master = Object.fromEntries(FW.items.map(i => [i.id, i])));
  const item = (lang, id) => LANG[lang]?._byId[id];
  const levelOK = (lv, level = state.level) => level === 'all' || lv === level;
  const levelLabel = () => state.level === 'all' ? 'all levels' : state.level;
  const names = ids => ids.map(l => meta(l).name).join(', ');
  // "I have to ___" -> "have to": a readable name for a framework item
  const shortEn = id => { const m = master()[id]; if (!m) return id; return m.en.split(' / ')[0].replace(/_+(-ing)?/g, '').replace(/^(I'm|I) /, '').replace(/\s+/g, ' ').trim().replace(/,$/, ''); };

  // ---------- pickers (languages, level) ----------
  function renderPickers() {
    const bar = $('#bar-pick'), row = $('#pick-row');
    bar.replaceChildren(); row.replaceChildren();
    const inSession = document.body.classList.contains('focus');
    if (inSession) return;
    const showLevel = !(state.view === 'lookup' && state.tab === 'notes') && state.view !== 'test';
    const target = narrow.matches ? row : bar;
    const kids = [DG.langButton()];
    if (showLevel) {
      const levels = [...FW.levels, 'all'];
      if (narrow.matches) {
        kids.push(h('label', { class: 'lvl-wrap' }, h('span', { class: 'sr-only' }, 'Level'),
          h('select', { class: 'level-sel', 'aria-label': 'Level', onchange: e => go({ level: e.target.value, scenario: null }) },
            levels.map(lv => h('option', { value: lv, selected: lv === state.level }, lv === 'all' ? 'All levels' : 'Level ' + lv)))));
      } else {
        kids.push(h('div', { class: 'seg mono', role: 'group', 'aria-label': 'Level' },
          levels.map(lv => h('button', { type: 'button', 'aria-pressed': lv === state.level ? 'true' : 'false', onclick: () => go({ level: lv, scenario: null }) }, lv === 'all' ? 'All' : lv))));
      }
    }
    app(target, ...kids);
  }
  narrow.addEventListener?.('change', () => { renderPickers(); if (state.view === 'lookup') render({ keepScroll: true }); });

  // ---------- shared bits ----------
  function T(lang, text, cls = '') { return h('span', { class: 't ' + cls, lang, dataset: { script: meta(lang).script } }, text); }
  function target(lang, it) {
    if (!it) return h('span', { class: 'missing' }, 'not written yet');
    return h('div', { class: 'tt' }, T(lang, it.target), it.translit ? h('div', { class: 'tr' }, it.translit) : null);
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
  const lvl = t => h('span', { class: 'lvl' }, t);
  function queueForDrill(ids) {
    const q = new Set(prefs.queueNext || []); ids.forEach(id => q.add(id)); prefs.queueNext = [...q]; DG.savePrefs();
    DG.announce(`${plural(ids.length, 'card')} added to your next drill`);
  }
  function header(eyebrow, title, lede) {
    return h('header', { class: 'section' }, h('div', { class: 'eyebrow' }, eyebrow), h('h1', { tabindex: -1 }, title), lede ? h('p', { class: 'lede' }, lede) : null);
  }
  const skeleton = () => h('div', { class: 'skeleton', 'aria-busy': 'true', 'aria-label': 'Loading' }, h('i'), h('i'), h('i'));

  // ---------- render ----------
  async function render(opts = {}) {
    if (!FW) return;
    if (window.__cleanup) { window.__cleanup(); window.__cleanup = null; }
    document.body.classList.remove('focus');
    document.body.dataset.view = state.view;
    DG.initBar(state.view);
    renderPickers();
    todayStrip();
    const view = $('#view');
    const y = scrollY;
    view.replaceChildren(skeleton());
    const langs = DG.langs();
    await ensureLangs(langs);
    view.replaceChildren();
    ({ lookup: viewLookup, drill: viewDrill, test: viewTest, write: viewWrite })[state.view](view, langs);
    if (opts.keepScroll) scrollTo(0, y);
    else if (!firstRender && !opts.quiet) { scrollTo(0, 0); view.querySelector('h1')?.focus({ preventScroll: true }); }
    firstRender = false;
  }
  DG.on(what => {
    if (what === 'langs-closed' || what === 'reset' || what === 'newPerDay') { if (what === 'reset') progress = {}; render({ keepScroll: true }); }
    if (what === 'langs') renderPickers();
    if (what === 'apikey' && state.view === 'write') render({ keepScroll: true });
    if (what === 'test' && state.view === 'test' && !document.body.classList.contains('focus')) render({ keepScroll: true, quiet: true });
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.target.matches?.('input,textarea,select') && !document.body.classList.contains('focus')) {
      e.preventDefault();
      if (state.view !== 'lookup') { go({ view: 'lookup' }); setTimeout(() => $('#look-search')?.focus(), 50); } else $('#look-search')?.focus();
    }
  });

  // ---------- Today strip: one slim line above Look up and Write (Drill's setup shows the same numbers) ----------
  function todayStrip() {
    const box = $('#today-strip');
    const hide = () => { box.hidden = true; box.replaceChildren(); };
    if (state.view === 'drill' || load(KEYS.todayStrip, null) === dayNow()) return hide();
    const list = DG.langs();
    const due = DG.dueByLang(list);
    const dueLangs = list.filter(l => due[l]);
    const newTotal = list.reduce((a, l) => a + DG.newLeft(l), 0);
    // the readiness line needs the test data; draw without it first, then again once it's loaded
    if (state.view !== 'test' && list.includes(TEST_LANG) && !TD) ensureTestData().then(() => { if (TD && state.view !== 'drill' && !box.querySelector('.ready-line')) todayStrip(); }).catch(() => {});
    const ready = state.view !== 'test' && readySummary() ? readyLine() : null;
    if (!dueLangs.length && !newTotal && !ready) return hide();
    const parts = dueLangs.map((l, i) => h('span', { class: 'ts-part' }, meta(l)?.name || l, ' ', h('b', {}, fmt(due[l])), i === dueLangs.length - 1 ? ' due' : null));
    if (newTotal) parts.push(h('span', { class: 'ts-part' }, h('b', {}, fmt(newTotal)), ' new'));
    if (ready) parts.push(h('span', { class: 'ts-part' }, ready));
    const line = h('p', { class: 'ts-line' }, h('span', { class: 'ts-label' }, 'Today'), parts);
    const close = h('button', { type: 'button', class: 'icon-btn ts-x', 'aria-label': 'Hide until tomorrow', title: 'Hide until tomorrow', html: DG.ICON.close, onclick: () => {
      save(KEYS.todayStrip, dayNow()); hide(); DG.announce("Today's drill hidden until tomorrow");
      $('#view h1')?.focus({ preventScroll: true });
    } });
    rep(box, line, dueLangs.length || newTotal ? h('a', { class: 'btn primary small-btn ts-start', href: '#drill/start' }, 'Start') : null, close);
    box.hidden = false;
  }

  // ===== Look up: phrases, verb frames, linking words, grammar, notes =====
  const CHUNK_CATS = [['sentence_frame', 'Sentence starters'], ['collocation', 'Word pairs'], ['gambit_filler', 'Fillers and reactions'], ['fixed_formula', 'Set phrases'], ['discourse_connector', 'Linking words']];
  const chunkLevel = c => c.level || c.cefr_level;
  let lookQuery = ''; let searchTab = 'all';
  function viewLookup(view, langs) {
    const full = langs.filter(l => meta(l).full), partial = langs.filter(l => !meta(l).full);
    const searching = () => lookQuery.length >= 2;
    app(view, header('Look up · ' + levelLabel(), 'Look up', 'Each row is one phrase in your languages. Tap a row for an example and a note. ★ = learn these first.'));
    const search = h('input', { type: 'search', id: 'look-search', placeholder: 'Search in English or your languages', 'aria-label': 'Search everything in Look up', value: lookQuery, autocomplete: 'off' });
    const count = h('span', { class: 'search-count', 'aria-live': 'polite' });
    app(view, h('div', { class: 'search-wrap' }, search, count, h('kbd', { class: 'keys-only search-kbd', title: 'Press / to search' }, '/')));
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sections' });
    const notice = h('div');
    const body = h('div', { class: 'look-body', role: 'tabpanel' });
    app(view, tabs, notice, body);
    let t;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { const was = searching(); lookQuery = search.value.trim(); if (!was) searchTab = 'all'; draw(); }, 120); });
    search.addEventListener('keydown', e => { if (e.key === 'Escape' && search.value) { search.value = ''; lookQuery = ''; draw(); } });

    const TAB_LABEL = { phrases: 'Phrases', frames: 'Verb frames', linking: 'Linking words', grammar: 'Grammar', notes: 'Notes' };
    const q = () => lookQuery.toLowerCase();
    const itemsFor = tab => {
      let rows = FW.items.filter(i => tab === 'frames' ? i.layer === 'door' : tab === 'linking' ? i.layer === 'glue' : tab === 'grammar' ? GRAMMAR.some(g => g[0] === i.layer) : false);
      if (searching()) rows = rows.filter(m => [m.id, m.en, m.note, ...full.flatMap(l => { const it = item(l, m.id); return it ? [it.target, it.translit, it.gloss, it.example?.target, it.example?.gloss] : []; })].join(' ').toLowerCase().includes(q()));
      else rows = rows.filter(i => levelOK(i.level) && (tab !== 'grammar' || i.layer === state.gl));
      return rows;
    };
    const phrasesFor = (cat = 'all') => {
      let rows = (CHUNK_EN || []).filter(c => cat === 'all' || c.category === cat);
      if (searching()) rows = rows.filter(c => [c.chunk, c.pragmatic_function, c.natural_example, ...langs.flatMap(l => { const r = CHUNK[l]?.[c.id]; return r ? [r.t, r.tr, r.ex] : []; })].join(' ').toLowerCase().includes(q()));
      else rows = rows.filter(c => levelOK(chunkLevel(c)));
      return rows;
    };

    function drawTabs() {
      const n = { phrases: CHUNK_EN ? phrasesFor().length : null, frames: itemsFor('frames').length, linking: itemsFor('linking').length, grammar: itemsFor('grammar').length };
      if (searching()) {
        n.all = ['phrases', 'frames', 'linking', 'grammar'].reduce((a, k) => a + (n[k] || 0), 0);
        tabs.replaceChildren(...['all', 'phrases', 'frames', 'linking', 'grammar'].map(k => h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': k === searchTab ? 'true' : 'false', onclick: () => { searchTab = k; draw(); } },
          k === 'all' ? 'All results' : TAB_LABEL[k], h('span', { class: 'n' }, fmt(n[k] || 0)))));
        return;
      }
      tabs.replaceChildren(...TABS.map(k => h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': k === state.tab ? 'true' : 'false', onclick: () => { state.tab = k; go({ tab: k }, { quiet: true, keepScroll: true }); } },
        TAB_LABEL[k], n[k] != null ? h('span', { class: 'n' }, fmt(n[k])) : null)));
    }
    function drawNotice() {
      notice.replaceChildren(); notice.hidden = true;
      if (partial.length && state.tab !== 'phrases') (notice.hidden = false, app(notice, h('div', { class: 'notice' }, `${names(partial)} ${partial.length === 1 ? 'only has' : 'only have'} phrases so far.`, h('button', { type: 'button', class: 'linkish', onclick: () => go({ tab: 'phrases' }, { keepScroll: true }) }, 'Show phrases'))));
    }
    async function draw() {
      drawNotice();
      if (state.tab === 'phrases' || searching()) {
        if (!CHUNK_EN || langs.some(l => !(l in CHUNK))) { body.replaceChildren(skeleton()); await ensureChunks(langs); }
      }
      if (state.tab === 'notes') await ensureTurns();
      drawTabs();
      count.textContent = searching() ? 'all levels' : ''; search.classList.toggle('has-count', searching());
      if (searching()) {
        if (searchTab === 'all') drawAll(body);
        else if (searchTab === 'phrases') drawPhrases(body);
        else drawItems(body, searchTab);
      }
      else if (state.tab === 'phrases') drawPhrases(body);
      else if (state.tab === 'notes') drawNotes(body);
      else drawItems(body, state.tab);
    }
    function drawAll(el) {
      const secs = [];
      for (const k of ['frames', 'linking', 'grammar', 'phrases']) {
        const n = k === 'phrases' ? phrasesFor().length : itemsFor(k).length;
        if (!n) continue;
        const box = h('div', { class: 'look-body' });
        if (k === 'phrases') drawPhrases(box, 5); else drawItems(box, k, 5);
        secs.push(h('section', { class: 'result-sec' }, h('h2', { class: 'result-h' }, TAB_LABEL[k], h('span', { class: 'n' }, fmt(n))), box,
          n > 5 ? h('button', { type: 'button', class: 'btn small-btn', onclick: () => { searchTab = k; draw(); scrollTo(0, 0); } }, `Show all ${fmt(n)} ${TAB_LABEL[k].toLowerCase()}`) : null));
      }
      el.replaceChildren(...(secs.length ? secs : [h('div', { class: 'empty' }, `Nothing matches "${lookQuery}".`)]));
    }

    // --- framework items: table on desktop, cards on phones ---
    function drawItems(el, tab, limit = 0) {
      let starOnly = !!prefs.starOnly;
      const top = h('div', { class: 'toolbar' });
      if (tab === 'grammar' && !searching()) app(top, h('div', { class: 'chips', role: 'group', 'aria-label': 'Grammar topic' }, GRAMMAR.map(([id, label]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': id === state.gl ? 'true' : 'false', onclick: () => go({ gl: id }, { keepScroll: true, quiet: true }) }, label))));
      const starChip = h('button', { type: 'button', class: 'chip', 'aria-pressed': starOnly ? 'true' : 'false', onclick: () => { starOnly = !starOnly; prefs.starOnly = starOnly; DG.savePrefs(); starChip.setAttribute('aria-pressed', starOnly ? 'true' : 'false'); paint(); } }, '★ Learn first');
      app(top, starChip);
      const wrap = h('div', { class: 'items' });
      el.replaceChildren(...(limit ? [wrap] : [top, wrap])); if (limit) starOnly = false;
      if (!full.length) { app(wrap, h('div', { class: 'empty' }, `${names(partial)} ${partial.length === 1 ? 'only has' : 'only have'} phrases so far. `, h('button', { type: 'button', class: 'linkish', onclick: () => go({ tab: 'phrases' }) }, 'Show phrases'))); return; }
      function paint() {
        let rows = itemsFor(tab); if (limit) rows = rows.slice(0, limit);
        if (starOnly) rows = rows.filter(m => full.some(l => item(l, m.id)?.star));
        wrap.replaceChildren();
        if (!rows.length) {
          app(wrap, searching() ? h('div', { class: 'empty' }, `Nothing matches "${lookQuery}" here.`) : h('div', { class: 'empty' }, `Nothing at ${state.level} in this tab. `, h('button', { type: 'button', class: 'linkish', onclick: () => go({ level: 'all' }, { keepScroll: true }) }, 'Show all levels')));
          return;
        }
        if (narrow.matches) app(wrap, h('div', { class: 'ck-list' }, rows.map(m => itemCard(m))));
        else app(wrap, itemTable(rows));
      }
      function toggleDetails(m, open) {
        return h('div', { class: 'dets', style: `--cols:${Math.min(full.length, 3)}` },
          m.note ? h('div', { class: 'det det-en' }, h('div', { class: 'det-lang' }, 'About this'), h('div', { class: 'small' }, m.note)) : null,
          full.map(l => detail(l, item(l, m.id))),
          ['door', 'glue', 'chunk'].includes(m.layer) ? h('div', { class: 'det-actions' }, h('button', { type: 'button', class: 'btn small-btn', onclick: e => { e.stopPropagation(); queueForDrill(['I:' + m.id]); e.currentTarget.textContent = 'Added to your next drill'; e.currentTarget.disabled = true; } }, 'Drill this')) : null);
      }
      function itemTable(rows) {
        const table = h('table', { class: 'cmp', style: `--cols:${full.length}` });
        app(table, h('thead', {}, h('tr', {}, h('th', { class: 'en-h', scope: 'col' }, 'English'), full.map(l => h('th', { scope: 'col' }, meta(l).name)))));
        const tbody = h('tbody');
        for (const m of rows) {
          const starred = full.some(l => item(l, m.id)?.star);
          const btn = h('button', { type: 'button', class: 'row-btn', 'aria-expanded': 'false' }, h('span', { class: 'en-main' }, m.en, starred ? h('span', { class: 'star', title: 'Learn this first' }, ' ★') : null));
          const tr = h('tr', { class: 'crow' },
            h('td', { class: 'en' }, btn, h('div', { class: 'en-sub' }, h('span', { class: 'lvl' }, m.id), (state.level === 'all' || searching()) ? lvl(m.level) : null, m.slot && m.slot !== '-' ? h('span', { class: 'slot' }, 'gap: ' + m.slot) : null)),
            full.map(l => h('td', { class: 'cell' }, target(l, item(l, m.id)))));
          const dtr = h('tr', { class: 'drow', hidden: true }, h('td', { colspan: full.length + 1 }, toggleDetails(m)));
          const toggle = () => { const open = dtr.hidden; dtr.hidden = !open; tr.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
          tr.addEventListener('click', e => { if (!window.getSelection()?.toString() && !e.target.closest('.det-actions')) { if (e.target !== btn) btn.focus(); toggle(); } });
          btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
          app(tbody, tr, dtr);
        }
        app(table, tbody);
        return table;
      }
      function itemCard(m) {
        const starred = full.some(l => item(l, m.id)?.star);
        let open = false;
        const card = h('article', { class: 'ck' });
        const fill = () => {
          rep(card,
            h('button', { type: 'button', class: 'ck-head', 'aria-expanded': open ? 'true' : 'false', onclick: () => { open = !open; fill(); card.querySelector('.ck-head').focus(); } },
              h('span', { class: 'ck-en' }, m.en, starred ? h('span', { class: 'star' }, ' ★') : null),
              h('span', { class: 'ck-meta' }, h('span', { class: 'lvl' }, m.id), (state.level === 'all' || searching()) ? lvl(m.level) : null)),
            h('div', { class: 'ck-lines' }, full.map(l => { const it = item(l, m.id); return h('div', { class: 'ck-line' }, h('div', { class: 'ck-lang' }, meta(l).name), h('div', { class: 'ck-t' }, it ? [T(l, it.target), it.translit ? h('div', { class: 'tr' }, it.translit) : null] : h('span', { class: 'missing' }, 'Not written yet.'),
              open && it?.example?.target ? h('div', { class: 'ck-ex' }, T(l, it.example.target), it.example.translit ? h('div', { class: 'tr' }, it.example.translit) : null, h('div', { class: 'gl' }, it.example.gloss)) : null,
              open && it?.note ? h('div', { class: 'ck-n' }, it.note) : null)); })),
            open && m.note ? h('div', { class: 'ck-n' }, m.note) : null,
            open && ['door', 'glue', 'chunk'].includes(m.layer) ? h('div', {}, h('button', { type: 'button', class: 'btn small-btn', onclick: e => { queueForDrill(['I:' + m.id]); e.currentTarget.textContent = 'Added to your next drill'; e.currentTarget.disabled = true; } }, 'Drill this')) : null);
          card.classList.toggle('open', open);
        };
        fill();
        return card;
      }
      paint();
    }

    // --- phrases (chunk bank) ---
    function drawPhrases(el, limit = 0) {
      const cat = limit ? 'all' : prefs.chunkCat || 'all';
      let expandAll = !!prefs.chunkExpand;
      const catChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Kind of phrase' }, [['all', 'All']].concat(CHUNK_CATS).map(([k, l]) => h('button', { type: 'button', class: 'chip', 'aria-pressed': k === cat ? 'true' : 'false', onclick: () => { prefs.chunkCat = k; DG.savePrefs(); drawPhrases(el); drawTabs(); } }, l)));
      const expBtn = h('button', { type: 'button', class: 'chip', 'aria-pressed': expandAll ? 'true' : 'false', onclick: () => { expandAll = !expandAll; prefs.chunkExpand = expandAll; DG.savePrefs(); expBtn.setAttribute('aria-pressed', expandAll ? 'true' : 'false'); paint(); } }, 'Show all examples');
      const cnt = h('span', { class: 'muted small' });
      const drillAll = h('button', { type: 'button', class: 'btn small-btn' });
      const list = h('div', { class: 'ck-list' });
      const more = h('button', { type: 'button', class: 'btn', onclick: () => { shown += 60; paint(); } });
      el.replaceChildren(...(limit ? [list] : [h('div', { class: 'toolbar' }, catChips, expBtn), h('div', { class: 'toolbar' }, cnt, drillAll), list, more]));
      const rows = phrasesFor(cat);
      let shown = limit || 60;
      const missing = langs.filter(l => CHUNK[l] === null);
      cnt.textContent = `${fmt(rows.length)} phrase${rows.length === 1 ? '' : 's'}` + (missing.length ? ` · no phrases yet in ${names(missing)}` : '');
      const toQueue = rows.slice(0, 40);
      drillAll.hidden = !(cat !== 'all' || searching()) || !rows.length;
      drillAll.textContent = `Drill these ${toQueue.length}`;
      drillAll.onclick = () => { queueForDrill(toQueue.map(c => 'K:' + c.id)); drillAll.textContent = `Added ${toQueue.length} to your next drill`; drillAll.disabled = true; };
      function paint() {
        list.replaceChildren();
        if (!rows.length) {
          const none = !searching() && (CHUNK_EN || []).length && !(CHUNK_EN || []).some(c => chunkLevel(c) === state.level);
          app(list, none ? h('div', { class: 'empty' }, `No ${state.level} phrases yet. Try: `, h('button', { type: 'button', class: 'btn small-btn', onclick: () => go({ level: 'B1' }, { keepScroll: true }) }, 'B1'), ' ', h('button', { type: 'button', class: 'btn small-btn', onclick: () => go({ level: 'B2' }, { keepScroll: true }) }, 'B2'))
            : h('div', { class: 'empty' }, searching() ? `No phrases match "${lookQuery}".` : 'No phrases here.'));
          more.hidden = true; return;
        }
        for (const c of rows.slice(0, shown)) app(list, phraseCard(c, expandAll));
        more.hidden = !!limit || shown >= rows.length;
        more.textContent = `Show ${Math.min(60, rows.length - shown)} more (${fmt(rows.length - shown)} left)`;
      }
      paint();
    }
    function phraseCard(c, startOpen) {
      let open = startOpen;
      const card = h('article', { class: 'ck' });
      const fill = () => {
        rep(card,
          h('button', { type: 'button', class: 'ck-head', 'aria-expanded': open ? 'true' : 'false', onclick: () => { open = !open; fill(); card.querySelector('.ck-head').focus(); } },
            h('span', { class: 'ck-en' }, c.chunk),
            h('span', { class: 'ck-meta' }, h('span', { class: 'lvl' }, chunkLevel(c)), h('span', { class: 'ck-cat' }, (CHUNK_CATS.find(x => x[0] === c.category) || [, c.category])[1]), h('span', {}, c.pragmatic_function), c.register !== 'neutral' ? h('span', { class: 'ck-reg' }, c.register) : null)),
          open ? h('div', { class: 'ck-enex' }, c.natural_example) : null,
          h('div', { class: 'ck-lines' }, DG.langs().map(l => chunkLine(l, CHUNK[l]?.[c.id], open))),
          open ? h('div', {}, h('button', { type: 'button', class: 'btn small-btn', onclick: e => { queueForDrill(['K:' + c.id]); e.currentTarget.textContent = 'Added to your next drill'; e.currentTarget.disabled = true; } }, 'Drill this')) : null);
        card.classList.toggle('open', open);
      };
      fill();
      return card;
    }
    function chunkLine(lang, r, open) {
      return h('div', { class: 'ck-line' },
        h('div', { class: 'ck-lang' }, meta(lang).name),
        h('div', { class: 'ck-t' },
          r ? [T(lang, r.t), r.tr ? h('div', { class: 'tr' }, r.tr) : null] : h('span', { class: 'missing' }, 'not translated yet'),
          r && open ? h('div', { class: 'ck-ex' }, T(lang, r.ex), r.extr ? h('div', { class: 'tr' }, r.extr) : null) : null,
          r && open && r.n ? h('div', { class: 'ck-n' }, r.n) : null));
    }

    // --- per-language notes, with "go" in nine tenses ---
    function drawNotes(el) {
      const ls = full.filter(l => LANG[l]);
      if (!ls.length) { el.replaceChildren(h('div', { class: 'empty' }, 'Grammar notes exist for Khasi, German, Hindi, French and Swiss German.')); return; }
      let cur = ls.includes(state.plang) ? state.plang : ls[0];
      const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Language' });
      const out = h('div', { class: 'notes' });
      rep(el, ls.length > 1 ? chips : null, out);
      const paint = () => {
        chips.replaceChildren(...ls.map(l => h('button', { type: 'button', class: 'chip', 'aria-pressed': l === cur ? 'true' : 'false', onclick: () => { cur = l; state.plang = l; paint(); } }, meta(l).name)));
        const notes = LANG[cur].notes || {};
        const card = (title, text) => {
          const p = h('p', { class: 'note-text' }, text || 'Not written yet.');
          const more = h('button', { type: 'button', class: 'linkish', 'aria-expanded': 'false', onclick: () => { const o = p.classList.toggle('open'); more.textContent = o ? 'Less' : 'More'; more.setAttribute('aria-expanded', o ? 'true' : 'false'); } }, 'More');
          const c = h('div', { class: 'note-card' }, h('h3', {}, title), p, more);
          requestAnimationFrame(() => { if (p.scrollHeight <= p.clientHeight + 2) more.hidden = true; });
          return c;
        };
        rep(out, h('h2', { class: 'notes-title' }, `Grammar notes: ${meta(cur).name}`),
          h('p', { class: 'muted small' }, meta(cur).variety),
          h('div', { class: 'notes-grid' }, [['variety', 'Which variety'], ['turns', 'Tenses'], ['wordOrder', 'Word order'], ['slotGrammar', 'Nouns, articles and cases'], ['sound', 'Sound and spelling'], ['register', 'Formal and informal']].map(([k, t]) => card(t, notes[k]))),
          goTable(cur));
      };
      paint();
    }
    function goTable(lang) {
      const L = TURNS?.languages?.[lang]; if (!L) return null;
      const T3 = ['past', 'present', 'future'], A3 = ['simple', 'progressive', 'perfect'];
      const grid = h('div', { class: 'go-grid' }, h('div'), T3.map(t => h('div', { class: 'go-h' }, t === 'present' ? 'Now' : t[0].toUpperCase() + t.slice(1))));
      for (const a of A3) {
        app(grid, h('div', { class: 'go-rh' }, a));
        for (const t of T3) {
          const c = L.cells[`${t}.${a}`]; const k = `${t}.${a}`;
          const w = c.form.split(/\s+/); const mask = w.map(() => false);
          if (k !== 'present.simple') for (const m of c.marker) { const mw = m.split(/\s+/); for (let i = 0; i + mw.length <= w.length; i++) if (mw.every((x, j) => w[i + j] === x)) { for (let j = 0; j < mw.length; j++) mask[i + j] = true; break; } }
          const sent = h('div', { class: 't go-f', lang, dataset: { script: meta(lang).script } });
          w.forEach((x, i) => { app(sent, mask[i] ? h('mark', {}, x) : x); if (i < w.length - 1) app(sent, ' '); });
          app(grid, h('div', { class: 'go-cell' }, sent, c.translit ? h('div', { class: 'tr' }, c.translit) : null, h('div', { class: 'gl' }, TURNS.english[k].form),
            c.status !== 'form' ? h('span', { class: 'badge' + (c.status === 'none' ? ' none' : '') }, c.status === 'none' ? 'no such form' : 'workaround') : null));
        }
      }
      return h('section', { class: 'section' }, h('h3', {}, '"Go" in nine tenses'), h('p', { class: 'small muted' }, 'Highlighted words carry the tense. ', h('a', { href: 'index.html#time' }, 'Compare all ten languages')), h('div', { class: 'go-scroll' }, grid));
    }
    draw();
  }

  // ===== Drill: say it out loud, spaced repetition =====
  const VOICE_LANG = { german: 'de-DE', french: 'fr-FR', hindi: 'hi-IN', swissgerman: 'de-CH', khasi: null, bengali: 'bn-IN', spanish: 'es-MX', italian: 'it-IT', portuguese: 'pt-BR', arabic: 'ar-SA' };
  // fallback levels for sentence-bank meanings without a "level" field in data/sentences/en.json
  const BANK_LEVEL = { want: 'A1', like: 'A1', go: 'A1', decline: 'A2', live: 'B1', if: 'B1' };
  const ALL_TYPES = ['bank', 'chunk', 'sentence', 'scenario'];
  const TYPE_LABEL = { bank: 'Phrases', chunk: 'Verb frames', sentence: 'Sentences', scenario: 'Situations' };
  const TYPE_BADGE = { bank: 'phrase', chunk: 'verb frame', sentence: 'sentence', scenario: 'situation' };
  const srsKey = (lang, id) => `${lang}|${id}`;
  const srsGet = (lang, id) => srs[srsKey(lang, id)] || { ease: 2.5, ivl: 0, due: 0, reps: 0, lapses: 0, last: 0, hist: '' };
  function srsGrade(lang, id, g) {
    const s = { ...srsGet(lang, id) }; const today = dayNow();
    if (g === 1) { s.ivl = 0; s.lapses++; s.ease = Math.max(1.3, s.ease - 0.2); }
    else if (s.reps === 0 || s.ivl === 0) { s.ivl = g === 2 ? 1 : g === 3 ? 1 : 3; }
    else { const f = g === 2 ? 1.2 : g === 3 ? s.ease : s.ease * 1.3; s.ivl = Math.max(s.ivl + 1, Math.round(s.ivl * f)); }
    if (g === 2) s.ease = Math.max(1.3, s.ease - 0.15); if (g === 4) s.ease += 0.15;
    s.reps++; s.last = today; s.due = today + s.ivl; s.hist = (s.hist + g).slice(-12);
    srs[srsKey(lang, id)] = s; DG.saveSrs(); DG.logDay();
    DG.knowFromGrade(lang, id, g, s.ivl);
  }
  function srsUndo(lang, id, prev) { if (prev) srs[srsKey(lang, id)] = prev; else delete srs[srsKey(lang, id)]; DG.saveSrs(); }

  // One card = one meaning with an answer per language that has it. level: a CEFR level or 'all'.
  function buildCards(langs, types, level) {
    const cards = [];
    const ok = lv => levelOK(lv, level);
    if (types.includes('chunk')) for (const m of FW.items) {
      if (!['door', 'glue', 'chunk'].includes(m.layer) || !ok(m.level)) continue;
      const per = {}; for (const l of langs) { const it = item(l, m.id); if (it?.target) per[l] = { target: it.target, translit: it.translit, note: it.note, hint: null }; }
      if (Object.keys(per).length) cards.push({ id: 'I:' + m.id, type: 'chunk', level: m.level, en: m.en, uses: [], prio: (langs.some(l => item(l, m.id)?.star) ? 0 : 1), per });
    }
    if (types.includes('sentence')) {
      for (const m of FW.items) {
        if (!['door', 'glue', 'chunk'].includes(m.layer) || !ok(m.level)) continue;
        const per = {}; for (const l of langs) { const it = item(l, m.id); if (it?.example?.target && it.example.gloss) per[l] = { target: it.example.target, translit: it.example.translit, note: it.note, hint: it.target, gloss: it.example.gloss }; }
        const glosses = Object.values(per).map(p => p.gloss); if (!glosses.length) continue;
        const en = glosses.slice().sort((a, b) => glosses.filter(x => x === b).length - glosses.filter(x => x === a).length)[0];
        for (const l of Object.keys(per)) if (per[l].gloss !== en) per[l].altGloss = per[l].gloss;
        cards.push({ id: 'X:' + m.id, type: 'sentence', level: m.level, en, uses: [shortEn(m.id)], ids: [m.id], prio: 1, per });
      }
      if (SENT_EN) for (const mn of SENT_EN.meanings) for (const v of mn.variants) {
        const lv = (FW.levels.includes(mn.level) && mn.level) || BANK_LEVEL[mn.id] || 'A2'; if (!ok(lv)) continue;
        const per = {}; for (const l of langs) { const s = SENT[l]?.variants?.[`${mn.id}.${v.id}`]; if (s) per[l] = { target: s.tokens.map(t => t[0]).join(' '), translit: s.tokens.some(t => t[2]) ? s.tokens.map(t => t[2] || '').join(' ') : '', note: s.why, hint: null, blocks: s.tokens }; }
        if (Object.keys(per).length) cards.push({ id: 'S:' + mn.id + '.' + v.id, type: 'sentence', level: lv, en: v.tokens.map(t => t[0]).join(' '), uses: mn.recipe.filter(id => !id.startsWith('T-')).map(shortEn), ids: mn.recipe, prio: 0, per });
      }
    }
    if (types.includes('bank') && CHUNK_EN) for (const k of CHUNK_EN) {
      if (!ok(chunkLevel(k))) continue;
      const per = {}; for (const l of langs) { const r = CHUNK[l]?.[k.id]; if (r) per[l] = { target: r.ex, translit: r.extr, note: r.n, hint: r.t, chunk: r.t, chunkTr: r.tr }; }
      if (Object.keys(per).length) cards.push({ id: 'K:' + k.id, type: 'bank', level: chunkLevel(k), en: k.natural_example, uses: [k.chunk], ids: [k.id], prio: 0.5 + k._i / 10000, per });
    }
    if (types.includes('scenario')) for (const sc of FW.scenarios) {
      if (!ok(sc.level)) continue;
      const per = {}; for (const l of langs) { const d = LANG[l]?._sc?.[sc.id]; if (d?.model?.target) per[l] = { target: d.model.target, translit: d.model.translit, note: d.tip, hint: sc.recipe.map(id => item(l, id)?.target).filter(Boolean).join('  ·  '), blocks: (d.breakdown || []).map(b => [b.text, b.layer === 'door' ? 'door' : b.layer === 'glue' ? 'glue' : b.layer === 'chunk' ? 'chunk' : b.layer === 'turn' ? 'aux' : 'x']), alt: d.alt, gloss: d.model.gloss }; }
      if (Object.keys(per).length) cards.push({ id: 'C:' + sc.id, type: 'scenario', level: sc.level, en: sc.task, situation: sc.situation, uses: sc.recipe.map(shortEn), ids: sc.recipe, prio: 0, per });
    }
    return cards;
  }

  function voiceFor(lang) {
    const code = VOICE_LANG[lang]; if (!code || !('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices();
    return voices.find(x => x.lang.replace('_', '-') === code) || voices.find(x => x.lang.startsWith(code.slice(0, 2))) || null;
  }
  function speak(lang, text) {
    const v = voiceFor(lang); if (!v) return false;
    speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\s*\/\s*.*$/, '')); u.voice = v; u.lang = v.lang; u.rate = 0.9; speechSynthesis.speak(u); return true;
  }
  if ('speechSynthesis' in window) speechSynthesis.getVoices();

  const ROLE_CLS = { door: 'r-door', door2: 'r-door', glue: 'r-glue', aux: 'r-turn', neg: 'r-turn', q: 'r-turn', x: '', chunk: '' };
  function blockRow(lang, blocks) {
    return h('div', { class: 'tiles-row sm' }, blocks.map(b => { const roles = String(b[1]).split('|'); const cls = ROLE_CLS[roles.find(r => r in ROLE_CLS)] || ''; return h('span', { class: `tile ${cls}`, lang, dataset: { script: meta(lang).script } }, b[0]); }));
  }

  function viewDrill(view, allLangs) {
    const langs0 = allLangs.slice();
    const types = (prefs.drillTypes?.length ? prefs.drillTypes : ['bank', 'sentence']).filter(t => ALL_TYPES.includes(t));
    const size = prefs.drillSize || 25;
    const order = prefs.drillOrder || 'grouped';
    const autoplay = prefs.drillAudio !== false;
    const sub = state.sub; state.sub = null;
    if (sub) history.replaceState(null, '', '#drill');
    app(view, header('Drill · ' + names(langs0), 'Drill', 'Say the English sentence out loud in the language shown, then check the answer and mark how it went. Misses come back sooner.'));
    const stage = h('div', { class: 'drill-stage' }); app(view, stage);
    window.__cleanup = () => stage._cleanup?.();
    app(stage, skeleton());
    let langs = langs0;
    Promise.all([ensureSentences(langs0), ensureChunks(langs0)]).then(() => {
      langs = langs0.filter(l => LANG[l] || CHUNK[l]);
      if (!langs.length) { rep(stage, h('div', { class: 'empty' }, "Couldn't load any of your languages. ", h('button', { type: 'button', class: 'btn small-btn', onclick: () => render() }, 'Retry'))); return; }
      if (sub === 'try') return start(plan({ langs: [langs[0]], level: 'A2', types: ['sentence', 'bank'], size: 10, dueFirst: false, newOnly: true }));
      if (sub === 'start') { const p = plan(); if (p.queue.length) return start(p); }
      setup();
    });

    // Everything the setup screen and a session need, from the saved settings.
    function plan(o = {}) {
      const L = o.langs || langs; const lv = o.level || state.level; const ty = o.types || types; const sz = o.size || size;
      const today = dayNow();
      const index = new Map(buildCards(L, ALL_TYPES, 'all').map(c => [c.id, c]));
      const pool = buildCards(L, ty, lv);
      const poolIds = new Set(pool.map(c => c.id));
      // due reviews come straight from srs keys, whatever level or type they came from
      const due = [];
      if (!o.newOnly) for (const [k, s] of Object.entries(srs)) {
        if (!s?.reps || s.due > today) continue;
        const i = k.indexOf('|'); const l = k.slice(0, i), id = k.slice(i + 1);
        if (!L.includes(l)) continue;
        const c = index.get(id); if (!c || !c.per[l]) continue;
        due.push({ c, l, s });
      }
      const outside = due.filter(d => !poolIds.has(d.c.id));
      const outsideLevels = [...new Set(outside.map(d => d.c.level))].sort();
      // new cards: explicitly queued ones first, then the pool in priority order; a per-language daily limit
      const quota = Object.fromEntries(L.map(l => [l, o.extra ? DG.newLeft(l) + o.extra : o.newOnly ? sz : DG.newLeft(l)]));
      const queued = (prefs.queueNext || []).map(id => index.get(id)).filter(Boolean);
      const byPrio = pool.filter(c => !queued.includes(c)).sort((a, b) => a.prio - b.prio || FW.levels.indexOf(a.level) - FW.levels.indexOf(b.level));
      const fresh = [];
      const q = { ...quota };
      for (const c of queued) for (const l of L) if (c.per[l] && !srsGet(l, c.id).reps) fresh.push({ c, l, queued: true });
      for (const c of byPrio) for (const l of L) if (c.per[l] && !srsGet(l, c.id).reps && q[l] > 0) { fresh.push({ c, l }); q[l]--; }
      const newAvail = pool.reduce((n, c) => n + L.filter(l => c.per[l] && !srsGet(l, c.id).reps).length, 0);
      // queue: due first (grouped by card, languages in the user's order), then new
      const group = list => {
        const by = new Map(); for (const p of list) { if (!by.has(p.c.id)) by.set(p.c.id, []); by.get(p.c.id).push(p); }
        return [...by.values()].map(g => g.sort((a, b) => L.indexOf(a.l) - L.indexOf(b.l)));
      };
      let queue = [];
      for (const g of shuffle(group(due))) { if (queue.length >= sz) break; queue.push(...g); }
      for (const g of group(fresh)) { if (queue.length >= sz) break; queue.push(...g); }
      queue = queue.slice(0, sz).map(p => ({ c: p.c, l: p.l, isNew: !srsGet(p.l, p.c.id).reps }));
      if (order === 'mixed' && !o.newOnly) queue = shuffle(queue);
      return { L, lv, ty, due, outside, outsideLevels, fresh, newAvail, pool, queue, quota, queued };
    }

    function setup() {
      stage._cleanup?.();
      const p = plan();
      const nDue = p.queue.filter(x => !x.isNew).length, nNew = p.queue.filter(x => x.isNew).length;
      const known = p.L.reduce((n, l) => n + Object.entries(srs).filter(([k, s]) => k.startsWith(l + '|') && s.ivl >= 7).length, 0);
      const streak = DG.streak();
      const startLabel = nDue && nNew ? `Start: ${plural(nDue, 'review')} + ${nNew} new` : nDue ? `Start: ${plural(nDue, 'review')}` : `Start: ${nNew} new`;
      const panel = h('div', { class: 'setup' });
      const startBtn = h('button', { type: 'button', class: 'btn primary big', id: 'drill-start', disabled: !p.queue.length, onclick: () => start(p) }, p.queue.length ? startLabel : 'Nothing to start');
      app(panel, h('div', { class: 'start-row' }, startBtn,
        h('span', { class: 'muted small' }, p.queue.length ? (p.queue.length >= size ? `${size} cards is your session length; change it in Options.` : `${plural(p.queue.length, 'card')}.`) : '')));
      if (!p.queue.length) {
        const why = h('div', { class: 'notice' });
        if (!p.due.length && p.newAvail === 0) {
          app(why, `No cards at ${levelLabel()} for ${names(p.L)} with these card types.`,
            state.level !== 'all' ? h('button', { type: 'button', class: 'btn small-btn', onclick: () => go({ level: 'all' }) }, 'Use all levels') : null);
        } else {
          app(why, `Nothing due, and today's new cards are used up (${DG.newPerDay()} per language).`,
            h('button', { type: 'button', class: 'btn small-btn', onclick: () => start(plan({ extra: 10 })) }, '10 more new cards'));
        }
        app(panel, why);
      }
      app(panel, h('p', { class: 'stats-line' },
        h('span', {}, h('b', {}, fmt(p.due.length)), ' due today'), h('span', {}, h('b', {}, fmt(p.fresh.length)), ' new today'),
        h('span', {}, h('b', {}, fmt(known)), ' known'), h('span', {}, h('b', {}, streak), streak === 1 ? ' day in a row' : ' days in a row')));
      if (p.outside.length) app(panel, h('p', { class: 'small muted' }, `Includes ${plural(p.outside.length, 'review')} from ${p.outsideLevels.join(', ')} or other card types, so nothing due gets skipped.`));
      const queued = p.queued.length;
      if (queued) app(panel, h('p', { class: 'small muted' }, `${plural(queued, 'card')} you picked in Look up or missed in Test come first. `, h('button', { type: 'button', class: 'linkish', onclick: () => { prefs.queueNext = []; DG.savePrefs(); setup(); } }, 'Clear')));
      const noVoice = p.L.filter(l => !voiceFor(l));
      if (autoplay && noVoice.length && 'speechSynthesis' in window && speechSynthesis.getVoices().length) app(panel, h('p', { class: 'small muted' }, `No voice on this device for: ${names(noVoice)}.`));
      const perLang = h('div', { class: 'perlang' }, p.L.map(l => {
        const dueL = p.due.filter(d => d.l === l).length;
        const knownL = Object.entries(srs).filter(([k, s]) => k.startsWith(l + '|') && s.ivl >= 7).length;
        const inPool = p.pool.filter(c => c.per[l]); const seen = inPool.filter(c => srsGet(l, c.id).reps).length;
        return h('div', { class: 'pl' }, h('div', { class: 'pl-head' }, h('b', {}, meta(l).name), h('span', { class: 'small muted' }, `${fmt(dueL)} due · ${fmt(knownL)} known · ${fmt(inPool.length - seen)} not started at ${levelLabel()}`)),
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${inPool.length ? 100 * seen / inPool.length : 0}%` })));
      }));
      const typeTogs = ALL_TYPES.map(t => h('button', { type: 'button', class: 'tog', 'aria-pressed': types.includes(t) ? 'true' : 'false', onclick: () => { const s = new Set(types); s.has(t) ? s.delete(t) : s.add(t); if (!s.size) s.add('sentence'); prefs.drillTypes = [...s]; DG.savePrefs(); prefs._optsOpen = true; render({ keepScroll: true, quiet: true }); } }, TYPE_LABEL[t]));
      const sizeSel = h('select', { class: 'field-sel', onchange: e => { prefs.drillSize = +e.target.value; DG.savePrefs(); render({ keepScroll: true, quiet: true }); } }, [10, 25, 50, 100].map(n => h('option', { value: n, selected: n === size }, n + ' cards')));
      const orderSel = h('select', { class: 'field-sel', onchange: e => { prefs.drillOrder = e.target.value; DG.savePrefs(); } }, [['grouped', 'One sentence, all languages in a row'], ['mixed', 'Mixed']].map(([v, l]) => h('option', { value: v, selected: v === order }, l)));
      const audioChk = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: autoplay, onchange: e => { prefs.drillAudio = e.target.checked; DG.savePrefs(); } }), 'Read the answer aloud');
      const opts = h('details', { class: 'options', open: !!prefs._optsOpen, ontoggle: e => { prefs._optsOpen = e.target.open; DG.savePrefs(); } }, h('summary', {}, 'Options'),
        h('div', { class: 'opt-body' },
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Practise'), h('div', { class: 'chips' }, typeTogs)),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Length'), sizeSel),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Order'), orderSel),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'New cards'), h('span', { class: 'small' }, `From ${levelLabel()} (the level control above), ${DG.newPerDay()} per language per day. `, h('button', { type: 'button', class: 'linkish', onclick: DG.openSettings }, 'Change'))),
          audioChk));
      const keys = h('p', { class: 'keys-line keys-only' }, [['Space', 'show answer, then Good'], ['1–4', 'Again, Hard, Good, Easy'], ['H', 'hint'], ['P', 'hear it'], ['U', 'undo'], ['Esc', 'end']].map(([k, d]) => h('span', {}, h('kbd', {}, k), ' ', d)));
      const touch = h('p', { class: 'small muted touch-only' }, 'Tap the card to see the answer, then tap a grade. "All languages in a row" asks for the same sentence in each of your languages one after another.');
      rep(stage, panel, readyLine('drill'), perLang, opts, keys, touch);
      if (!firstRender || location.hash.startsWith('#drill')) requestAnimationFrame(() => { if (!startBtn.disabled && document.activeElement?.tagName !== 'H1') startBtn.focus({ preventScroll: true }); });
      const onKey = e => { if (e.repeat) return; if (e.code === 'Space' && !e.target.matches?.('input,select,textarea,button,summary,a') && p.queue.length) { e.preventDefault(); start(p); } };
      document.addEventListener('keydown', onKey);
      stage._cleanup = () => document.removeEventListener('keydown', onKey);
      if (location.search.includes('autostart') && p.queue.length) setTimeout(() => start(p), 0);
    }

    function start(p, practiceOnly = false) {
      stage._cleanup?.();
      let queue = p.queue.slice();
      if (!queue.length) { setup(); return; }
      const total = queue.length; const done = []; let i = 0; let revealed = false; let revealedAt = 0; let hinted = false; let lastUndo = null;
      const session = h('div', { class: 'session' }); stage.replaceChildren(session); document.body.classList.add('focus'); renderPickers();
      $('#view > header')?.setAttribute('hidden', '');
      const undoBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Undo last grade', title: 'Undo last grade (U)', disabled: true, html: DG.ICON.undo, onclick: () => undo() });
      const bar = h('div', { class: 'sess-bar' }, h('div', { class: 'sess-prog', 'aria-hidden': 'true' }, h('i')), h('span', { class: 'mono sess-n' }), undoBtn, h('button', { type: 'button', class: 'btn small-btn', onclick: end }, 'End', h('kbd', {}, 'Esc')));
      const cardEl = h('div', { class: 'card sess-card', onclick: e => { if (!revealed && !e.target.closest('button')) reveal(); } });
      const foot = h('div', { class: 'sess-foot' });
      app(session, bar, cardEl, foot);

      function show() {
        if (i >= queue.length) return summary();
        revealed = false; hinted = false;
        const { c, l } = queue[i]; const a = c.per[l]; const m = meta(l);
        bar.querySelector('.sess-prog i').style.width = (100 * i / total) + '%'; bar.querySelector('.sess-n').textContent = `${Math.min(i + 1, total)} / ${total}`;
        undoBtn.disabled = !lastUndo;
        cardEl.className = 'card sess-card';
        rep(cardEl,
          h('div', { class: 'sess-lang' }, h('b', { class: 'lang-name' }, m.name), h('span', { class: 'lvl' }, c.level), h('span', { class: 'lvl' }, TYPE_BADGE[c.type]), queue[i].again ? h('span', { class: 'lvl' }, 'again') : null, practiceOnly ? h('span', { class: 'lvl' }, 'practice, not graded') : null),
          c.situation ? h('div', { class: 'sess-sit' }, c.situation) : null,
          h('div', { class: 'sess-prompt', lang: 'en' }, c.en),
          h('div', { class: 'sess-hint', hidden: true }),
          h('div', { class: 'sess-answer', hidden: true }));
        rep(foot, h('div', { class: 'foot-row' }, h('button', { type: 'button', class: 'btn primary big show-btn', onclick: reveal }, 'Show answer', h('kbd', {}, 'Space')), a.hint ? h('button', { type: 'button', class: 'btn big', onclick: hint }, 'Hint', h('kbd', {}, 'H')) : null));
        if (!reduce) cardEl.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
        DG.announce(`Card ${i + 1} of ${total}. Say it in ${m.name}: ${c.en}`);
        if (i === 0 && location.search.includes('reveal')) setTimeout(reveal, 0);
      }
      function hint() { if (revealed || hinted) return; const { c, l } = queue[i]; const a = c.per[l]; if (!a.hint) return; hinted = true; const el = cardEl.querySelector('.sess-hint'); el.hidden = false; el.replaceChildren(h('span', { class: 'eyebrow' }, 'Hint'), ' ', T(l, a.hint)); }
      function reveal() {
        if (revealed) return; revealed = true; revealedAt = performance.now();
        const { c, l } = queue[i]; const a = c.per[l];
        const el = cardEl.querySelector('.sess-answer'); el.hidden = false; el.replaceChildren();
        app(el, h('div', { class: 'ans-main' }, T(l, a.target)), a.translit ? h('div', { class: 'tr big-tr' }, a.translit) : null);
        if (a.altGloss) app(el, h('div', { class: 'gl' }, 'This version means: ' + a.altGloss));
        if (a.chunk) app(el, h('div', { class: 'ans-chunk' }, h('span', { class: 'eyebrow' }, 'Key phrase'), T(l, a.chunk), a.chunkTr ? h('span', { class: 'tr' }, a.chunkTr) : null));
        if (a.alt) app(el, h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Also natural: '), T(l, a.alt)));
        if (a.note) app(el, h('div', { class: 'ans-note' }, a.note));
        if (c.uses?.length && c.type !== 'bank') app(el, h('div', { class: 'ans-uses', title: (c.ids || []).join(' · ') }, 'Uses: ' + c.uses.join(' · ')));
        if (a.blocks) {
          const br = h('div', { class: 'breakdown' }, h('span', { class: 'eyebrow' }, 'Breakdown'), blockRow(l, a.blocks));
          if (narrow.matches) { br.hidden = true; app(el, h('button', { type: 'button', class: 'linkish small', onclick: e => { br.hidden = false; e.currentTarget.remove(); } }, 'Show breakdown'), br); }
          else app(el, br);
        }
        const canSpeak = !!voiceFor(l);
        rep(foot,
          h('div', { class: 'grades', role: 'group', 'aria-label': 'How did it go?' }, [[1, 'Again', 'r1'], [2, 'Hard', 'r2'], [3, 'Good', 'r3'], [4, 'Easy', 'r4']].map(([g, label, cls]) => h('button', { type: 'button', class: 'btn grade ' + cls + (g === 3 ? ' primary' : ''), onclick: () => grade(g) }, label, h('kbd', {}, g === 3 ? 'Space' : String(g))))),
          canSpeak ? h('div', { class: 'foot-row' }, h('button', { type: 'button', class: 'btn small-btn', onclick: () => speak(l, a.target) }, 'Hear it', h('kbd', {}, 'P'))) : null);
        cardEl.classList.add('revealed');
        if (autoplay && canSpeak) speak(l, a.target);
        DG.announce('Answer shown');
        if (!reduce) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'ease-out' });
      }
      function grade(g) {
        if (!revealed) return;
        const cur = queue[i]; const { c, l } = cur;
        if (!practiceOnly) {
          const prev = srs[srsKey(l, c.id)] ? { ...srs[srsKey(l, c.id)] } : null;
          const wasNew = !prev?.reps;
          srsGrade(l, c.id, g); lastUndo = { i, l, id: c.id, prev, wasNew, requeued: false, queuedLen: prefs.queueNext?.length };
          if (wasNew && !cur.again) DG.countNew(l, 1);
          if (prefs.queueNext?.includes(c.id) && queue.slice(i + 1).every(x => x.c.id !== c.id)) { prefs.queueNext = prefs.queueNext.filter(x => x !== c.id); DG.savePrefs(); }
        } else lastUndo = { i, practice: true };
        done.push({ c, l, g });
        if (g === 1 && !cur.again && !practiceOnly) { queue.push({ c, l, again: true }); lastUndo.requeued = true; }
        i++; show();
      }
      function undo() {
        if (!lastUndo) return;
        if (!lastUndo.practice) { srsUndo(lastUndo.l, lastUndo.id, lastUndo.prev); if (lastUndo.wasNew) DG.countNew(lastUndo.l, -1); if (lastUndo.requeued) queue.pop(); }
        done.pop(); i = lastUndo.i; lastUndo = null; show(); DG.announce('Last grade undone');
      }
      function onKey(e) {
        if (e.target.matches?.('input,select,textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
        if (e.code === 'Space') { e.preventDefault(); if (!revealed) reveal(); else if (performance.now() - revealedAt > 300) grade(3); }
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
        stage._cleanup?.(); document.body.classList.remove('focus'); renderPickers();
        bar.querySelector('.sess-prog i').style.width = '100%';
        undoBtn.hidden = true; bar.querySelector('.btn.small-btn').hidden = true; bar.querySelector('.sess-n').hidden = true;
        const byLang = p.L.map(l => { const mine = done.filter(d => d.l === l); return { l, n: mine.length, good: mine.filter(d => d.g >= 3).length, again: mine.filter(d => d.g === 1).length }; }).filter(x => x.n);
        const seen = new Set(); const missed = done.filter(d => d.g <= 2).filter(d => { const k = d.l + d.c.id; if (seen.has(k)) return false; seen.add(k); return true; });
        const tomorrow = Object.values(DG.dueByLang(p.L, dayNow() + 1)).reduce((a, b) => a + b, 0);
        const streak = DG.streak();
        cardEl.className = 'card sess-card summary';
        rep(cardEl,
          h('div', { class: 'eyebrow' }, practiceOnly ? 'Practice round done' : 'Done'),
          h('h2', { tabindex: -1 }, done.length ? `${done.filter(d => d.g >= 3).length} of ${done.length} right` : 'You stopped before grading any cards'),
          byLang.length ? h('div', { class: 'sum-grid' }, byLang.map(x => h('div', { class: 'stat' }, h('b', {}, `${x.good}/${x.n}`), h('span', {}, meta(x.l).name + (x.again ? ` · ${x.again} again` : ''))))) : null,
          missed.length ? h('div', { class: 'section' }, h('div', { class: 'eyebrow' }, 'Missed or hard'), h('div', { class: 'sum-list' }, missed.map(d => h('div', { class: 'sum-row' }, h('span', { class: 'lvl' }, meta(d.l).name), h('span', {}, d.c.en), T(d.l, d.c.per[d.l].target)))))
            : done.length ? h('p', { class: 'muted' }, 'No misses. If that felt easy, add the next level in Options.') : null,
          practiceOnly ? null : h('p', { class: 'small muted' }, `Tomorrow: ${tomorrow} due` + (streak ? ` · ${streak} ${streak === 1 ? 'day' : 'days'} in a row` : '') + '.'));
        const again = missed.length ? h('button', { type: 'button', class: 'btn big', onclick: () => start({ ...p, queue: missed.map(d => ({ c: d.c, l: d.l })) }, true) }, `Again: ${missed.length} missed`) : null;
        const doneBtn = h('a', { class: 'btn primary big', href: 'index.html' }, 'Done');
        rep(foot, h('div', { class: 'foot-row' }, again, doneBtn));
        cardEl.querySelector('h2').focus({ preventScroll: true });
        DG.announce('Session done');
      }
      show();
    }
  }

  // ===== Test: typed answers that mark words, phrases and grammar as known (German only for now) =====
  const TEST_LANG = 'german';
  const LEVELS6 = Readiness.LEVELS;
  const POOL_LABEL = { words: 'Words', chunks: 'Phrases', grammar: 'Grammar' };
  const STATE_LABEL = { known: 'Known', shaky: 'Shaky', unknown: 'Not yet' };
  const pct = x => Math.round(100 * x) + '%';
  let TD = null, TD_P = null;
  // Loads the word list, grammar concepts and items, and the phrase priorities. Missing files are fine (null).
  function ensureTestData() {
    if (TD) return Promise.resolve(TD);
    if (!TD_P) TD_P = (async () => {
      await ensureChunks([TEST_LANG]);
      const opt = path => getJSON(path).catch(() => null);
      const [words, themes, concepts, items, priority] = await Promise.all([opt('data/words/de.json'), opt('data/words/themes.json'), opt('data/grammar/concepts_de.json'), opt('data/grammar/items_de.json'), opt('data/chunks/priority_de.json')]);
      const d = {
        words: Array.isArray(words) && words.length ? words : null,
        themes: Array.isArray(themes) ? themes.slice().sort((a, b) => (a.order || 0) - (b.order || 0)) : [],
        concepts: Array.isArray(concepts) ? concepts : [],
        items: Array.isArray(items) && items.length ? items : null,
        priority: priority && typeof priority === 'object' ? priority : null,
      };
      d.pools = Readiness.pools({ words: d.words || [], chunksEn: CHUNK_EN || [], chunksDe: CHUNK[TEST_LANG] || {}, priority: d.priority, concepts: d.concepts, items: d.items || [] });
      d.themeById = new Map(d.themes.map(t => [t.id, t]));
      d.conceptById = new Map(d.concepts.map(c => [c.id, c]));
      d.chunkById = new Map((CHUNK_EN || []).map(c => [c.id, c]));
      d.fnOf = Readiness.functionMap(d.priority);
      TD = d; return d;
    })().catch(e => { TD_P = null; throw e; });
    return TD_P;
  }
  const testCtx = () => ({ know: DG.knowAll(), srs, lang: TEST_LANG, today: dayNow() });
  const readyLevel = () => LEVELS6.includes(state.level) ? state.level : LEVELS6.includes(prefs.testLevel) ? prefs.testLevel : 'B1';
  function readySummary(L = readyLevel()) {
    if (!TD || !DG.langs().includes(TEST_LANG)) return null;
    const lv = Readiness.level(TD.pools, L, testCtx());
    return lv.empty ? null : { L, lv };
  }
  // "B1 · 64% ready · 40% tested", a link to #test. Fills itself in once the test data is loaded.
  function readyLine() {
    if (!DG.langs().includes(TEST_LANG)) return null;
    const el = h('a', { class: 'ready-line', href: '#test' });
    const fill = () => {
      const r = readySummary(); if (!r) { el.hidden = true; return; }
      el.hidden = false;
      el.replaceChildren(h('b', {}, r.L), ` · ${pct(r.lv.score)} ready · ${pct(r.lv.coverage)} tested`);
      el.title = `${meta(TEST_LANG).name} ${r.L}: open Test for the breakdown`;
    };
    if (TD) fill(); else { el.hidden = true; ensureTestData().then(fill).catch(() => {}); }
    return el;
  }

  // --- test items: one shape for words, phrases and grammar ---
  function wordItem(w) {
    const th = TD.themeById.get(w.theme);
    return { id: 'W:' + w.id, kind: 'words', level: w.level, group: w.theme, prompt: (w.en || [])[0] || w.w, meta: [w.pos, th?.en || w.theme].filter(Boolean),
      accepted: Match.acceptedForWord(w), opts: { pos: w.pos }, answer: Match.acceptedForWord(w)[0],
      extra: [w.pos === 'noun' && w.pl ? `Plural: ${w.pl}` : null, (w.en || []).length > 1 ? 'Also means: ' + w.en.slice(1).join(', ') : null].filter(Boolean),
      ex: w.ex, exen: w.exen };
  }
  function chunkItem(c) {
    const r = CHUNK[TEST_LANG]?.[c.id]; if (!r) return null;
    return { id: 'K:' + c.id, kind: 'chunks', level: chunkLevel(c), group: TD.fnOf[c.id] || c.category, prompt: c.natural_example, meta: ['phrase', c.pragmatic_function].filter(Boolean),
      accepted: Match.acceptedForChunk(r.t, r.ex), opts: {}, answer: r.ex, key: r.t, note: r.n };
  }
  function grammarItem(it) {
    const c = TD.conceptById.get(it.concept);
    const ans = Array.isArray(it.answer) ? it.answer : [it.answer];
    return { id: 'G:' + it.id, kind: 'grammar', level: c?.level || it.level, group: it.concept, task: it.task, prompt: it.prompt, meta: ['grammar', c?.name || it.concept].filter(Boolean),
      accepted: ans, opts: { strictCase: !!it.strict_case }, answer: ans[0], note: it.note };
  }
  const tested = id => !!DG.know(TEST_LANG, id);
  const untestedFirst = list => [...list.filter(x => !tested(x.id)), ...list.filter(x => tested(x.id))];
  function wordsAt(L, themes) {
    if (!TD.words) return [];
    return TD.words.filter(w => w.level === L && (!themes || !themes.length || themes.includes(w.theme))).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || String(a.id).localeCompare(b.id)).map(wordItem);
  }
  function chunksAt(L) {
    const prio = new Map(TD.pools.chunks.map(c => [c.id, c.prio]));
    return (CHUNK_EN || []).filter(c => chunkLevel(c) === L && CHUNK[TEST_LANG]?.[c.id]).sort((a, b) => (prio.get('K:' + a.id) || 3) - (prio.get('K:' + b.id) || 3) || a._i - b._i).map(chunkItem).filter(Boolean);
  }
  // grammar items at L, spread across concepts (sticky concepts first), one item per concept per round
  function grammarAt(L, onlyConcept) {
    if (!TD.items) return [];
    const concepts = TD.concepts.filter(c => c.level === L && (!onlyConcept || c.id === onlyConcept)).sort((a, b) => (b.sticky ? 1 : 0) - (a.sticky ? 1 : 0));
    const lists = concepts.map(c => untestedFirst(TD.items.filter(it => it.concept === c.id).map(grammarItem)));
    const out = [];
    for (let round = 0; lists.some(l => l.length > round); round++) for (const l of lists) if (l[round]) out.push(l[round]);
    return out;
  }
  // merge lists so each kind is spread through the session
  function interleave(lists) {
    lists = lists.filter(l => l.length).map(l => ({ l, i: 0 }));
    const out = [];
    while (lists.some(x => x.i < x.l.length)) {
      const x = lists.filter(x => x.i < x.l.length).sort((a, b) => a.i / a.l.length - b.i / b.l.length)[0];
      out.push(x.l[x.i++]);
    }
    return out;
  }
  const levelHasItems = L => TD.pools.words.some(x => x.level === L) || TD.pools.chunks.some(x => x.level === L) || grammarAt(L).length > 0;
  function placementBlock(L) {
    const pick = (list, n) => untestedFirst(list).slice(0, n);
    return interleave([pick(wordsAt(L), 10), pick(chunksAt(L), 6), grammarAt(L).slice(0, 4)]).map(it => ({ ...it, block: L }));
  }
  function sweepItems({ level, pools, themes, retest }) {
    const lists = [];
    const want = x => retest ? tested(x.id) && !['known', 'solid'].includes(DG.knowState(TEST_LANG, x.id)) : !tested(x.id);
    if (pools.includes('words')) lists.push(wordsAt(level, themes).filter(want));
    if (pools.includes('chunks')) lists.push(chunksAt(level).filter(want));
    if (pools.includes('grammar')) lists.push(grammarAt(level).filter(want));
    return interleave(lists).slice(0, 20);
  }
  function gapItems(gap, L) {
    let list = gap.kind === 'words' ? wordsAt(L, [gap.id]) : gap.kind === 'grammar' ? grammarAt(L, gap.id) : chunksAt(L).filter(x => x.group === gap.id);
    const notKnown = x => !['known', 'solid'].includes(DG.knowState(TEST_LANG, x.id));
    return [...list.filter(x => !tested(x.id)), ...list.filter(x => tested(x.id) && notKnown(x))].slice(0, 20);
  }
  function placementEstimate(pcts) {
    const done = LEVELS6.filter(L => L in pcts);
    if (!done.length) return null;
    const x = done.find(L => pcts[L] < 0.8);
    if (!x) return done[done.length - 1];
    const i = done.indexOf(x);
    return pcts[x] >= 0.5 || i === 0 ? x : done[i - 1];
  }

  function viewTest(view, allLangs) {
    const sub = state.sub; const tlevel = state.tlevel; state.sub = null; state.tlevel = null;
    app(view, header('Test · German', 'Test', `Type the German for each English prompt. Right on the first try within ${DG.testSecs()} seconds counts as known.`));
    const stage = h('div', { class: 'test-stage' }); app(view, stage);
    window.__cleanup = () => stage._cleanup?.();
    if (!allLangs.includes(TEST_LANG)) {
      app(stage, h('div', { class: 'notice' }, 'The test is German only for now. German is not in your languages.',
        h('button', { type: 'button', class: 'btn small-btn', onclick: () => { DG.setLangs([...DG.langs(), TEST_LANG]); render(); } }, 'Add German')));
      return;
    }
    app(stage, skeleton());
    ensureTestData().then(() => {
      if (sub === 'placement') return runPlacement();
      if (sub === 'sweep') { const opts = sweepOpts(tlevel); const items = sweepItems(opts); if (items.length) return runSweep(opts, items); }
      setup();
    }).catch(() => rep(stage, h('div', { class: 'empty' }, "Couldn't load the test data. ", h('button', { type: 'button', class: 'btn small-btn', onclick: () => render() }, 'Retry'))));

    function sweepOpts(level) {
      const L = LEVELS6.includes(level) ? level : LEVELS6.includes(prefs.testLevel) ? prefs.testLevel : 'B1';
      const pools = (prefs.testPools || ['words', 'chunks', 'grammar']).filter(p => POOL_LABEL[p]);
      return { level: L, pools: pools.length ? pools : ['words', 'chunks', 'grammar'], themes: (prefs.testThemes || []).filter(t => TD.themeById.has(t)) };
    }

    function setup() {
      stage._cleanup?.(); stage._cleanup = null;
      document.body.classList.remove('focus'); $('#view > header')?.removeAttribute('hidden');
      if (location.hash !== '#test') history.replaceState(null, '', '#test');
      const ctx = testCtx();
      const all = Readiness.all(TD.pools, ctx);
      const levels = LEVELS6.filter(L => !all[L].empty);
      const opts = sweepOpts();
      const missing = [];
      if (!TD.words) missing.push('No word list yet, so the test covers phrases and grammar only.');
      if (!TD.items) missing.push('No grammar items yet.');

      // placement
      const place = h('section', { class: 'panel test-card' },
        h('h2', {}, 'Placement'),
        h('p', { class: 'small muted' }, 'Up to 20 questions per level (10 words, 6 phrases, 4 grammar), starting at A1. You move up a level while you know 80% or more of it.'),
        h('div', {}, h('button', { type: 'button', class: 'btn primary', id: 'test-place', onclick: () => runPlacement() }, 'Start placement')));

      // sweep
      const sw = h('section', { class: 'panel test-card' });
      const drawSweep = () => {
        const o = sweepOpts();
        const counts = o.pools.map(pl => {
          const list = pl === 'words' ? wordsAt(o.level, o.themes) : pl === 'chunks' ? chunksAt(o.level) : grammarAt(o.level);
          return { pl, total: list.length, done: list.filter(x => tested(x.id)).length };
        });
        const next = sweepItems(o), retest = next.length ? null : sweepItems({ ...o, retest: true });
        const lvBtns = h('div', { class: 'seg mono', role: 'group', 'aria-label': 'Level' }, levels.map(L => h('button', { type: 'button', 'aria-pressed': L === o.level ? 'true' : 'false', onclick: () => { prefs.testLevel = L; DG.savePrefs(); drawSweep(); } }, L)));
        const poolTogs = h('div', { class: 'chips', role: 'group', 'aria-label': 'What to test' }, Object.keys(POOL_LABEL).map(pl => h('button', { type: 'button', class: 'tog', 'aria-pressed': o.pools.includes(pl) ? 'true' : 'false', onclick: () => {
          const set = new Set(o.pools); set.has(pl) ? set.delete(pl) : set.add(pl); if (!set.size) set.add(pl); prefs.testPools = [...set]; DG.savePrefs(); drawSweep();
        } }, POOL_LABEL[pl])));
        const themesHere = TD.words ? TD.themes.filter(t => TD.words.some(w => w.level === o.level && w.theme === t.id)) : [];
        const themeChips = o.pools.includes('words') && themesHere.length ? h('div', { class: 'chips theme-chips', role: 'group', 'aria-label': 'Themes' },
          h('button', { type: 'button', class: 'chip', 'aria-pressed': o.themes.length ? 'false' : 'true', onclick: () => { prefs.testThemes = []; DG.savePrefs(); drawSweep(); } }, 'All themes'),
          themesHere.map(t => h('button', { type: 'button', class: 'chip', 'aria-pressed': o.themes.includes(t.id) ? 'true' : 'false', onclick: () => {
            const set = new Set(o.themes); set.has(t.id) ? set.delete(t.id) : set.add(t.id); prefs.testThemes = [...set]; DG.savePrefs(); drawSweep();
          } }, t.en))) : null;
        rep(sw,
          h('h2', {}, 'Sweep'),
          h('p', { class: 'small muted' }, 'Goes through every item of one level, 20 untested items at a time. Stop whenever you like; the next sweep carries on where you left off.'),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Level'), lvBtns),
          h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Test'), poolTogs),
          themeChips ? h('div', { class: 'opt-row' }, h('span', { class: 'opt-label' }, 'Themes'), themeChips) : null,
          h('div', { class: 'sweep-counts' }, counts.map(c => h('div', { class: 'pl' },
            h('div', { class: 'pl-head small' }, h('span', {}, `${o.level} ${POOL_LABEL[c.pl].toLowerCase()} · `, h('b', {}, `${fmt(c.done)} / ${fmt(c.total)}`), ' tested'),
              !c.total ? h('span', { class: 'muted' }, c.pl === 'words' && !TD.words ? 'No word list yet' : c.pl === 'grammar' && !TD.items ? 'No grammar items yet' : 'None at this level') : null),
            h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${c.total ? 100 * c.done / c.total : 0}%` }))))),
          h('div', { class: 'row' },
            next.length ? h('button', { type: 'button', class: 'btn primary', id: 'test-sweep', onclick: () => runSweep(o, next) }, `Start: ${next.length} untested`)
              : retest.length ? h('button', { type: 'button', class: 'btn primary', onclick: () => runSweep(o, retest) }, `Everything here is tested. Retest ${plural(retest.length, 'shaky or missed item')}`)
                : h('span', { class: 'muted small' }, 'Nothing left to test here.')));
      };
      drawSweep();

      // readiness per level
      const bars = h('section', { class: 'panel test-card' }, h('h2', {}, 'Levels'),
        h('p', { class: 'small muted' }, 'Ready = share of the level you know (words 35%, phrases 35%, grammar 30%). Untested items count as not known; the estimate range guesses them from what you have tested.'),
        h('div', { class: 'ready-list' }, levels.map(L => {
          const lv = all[L];
          return h('div', { class: 'ready-row' },
            h('div', { class: 'ready-head' }, h('b', { class: 'mono' }, L),
              h('span', { class: 'small' }, `${pct(lv.score)} ready · ${pct(lv.coverage)} tested`, lv.coverage > 0 && lv.coverage < 1 ? ` · est. ${pct(lv.estimate.lo)}–${pct(lv.estimate.hi)}` : ''),
              L !== LEVELS6[0] && lv.reachable ? h('span', { class: 'lvl' }, 'reachable') : null),
            h('div', { class: 'rbar', 'aria-hidden': 'true' },
              lv.coverage > 0 ? h('span', { class: 'rbar-est', style: `left:${100 * lv.estimate.lo}%;width:${Math.max(0.5, 100 * (lv.estimate.hi - lv.estimate.lo))}%` }) : null,
              h('i', { style: `width:${100 * lv.score}%` })));
        })));
      // biggest gaps at the sweep level
      const gaps = Readiness.gaps(TD.pools, opts.level, ctx);
      const gapBox = gaps.length ? h('section', { class: 'panel test-card' }, h('h2', {}, `Gaps at ${opts.level}`),
        h('div', { class: 'gap-list' }, gaps.map(g => {
          const name = g.kind === 'words' ? (TD.themeById.get(g.id)?.en || g.id) : g.kind === 'grammar' ? (g.name || g.id) : (CHUNK_CATS.find(x => x[0] === g.id)?.[1] || g.id);
          const items = gapItems(g, opts.level);
          return h('div', { class: 'gap-row' }, h('span', {}, h('b', {}, name), h('span', { class: 'muted small' }, ` · ${POOL_LABEL[g.kind].toLowerCase()} · ${pct(g.score)} · ${g.tested} of ${g.n} tested`)),
            items.length ? h('button', { type: 'button', class: 'btn small-btn', onclick: () => runSweep({ ...opts, gap: g }, items) }, 'Test these') : null);
        }))) : null;

      rep(stage, missing.length ? h('div', { class: 'notice' }, missing.join(' ')) : null, place, sw, bars, gapBox);
      const firstBtn = $('#test-place');
      if (!firstRender && document.activeElement?.tagName !== 'H1') requestAnimationFrame(() => firstBtn?.focus({ preventScroll: true }));
      const auto = new URLSearchParams(location.search).get('autotest');
      if (auto && !stage._autoRan) { stage._autoRan = true; setTimeout(runPlacement, 0); }
    }

    // --- placement: level by level from A1 while 80%+ is known ---
    function runPlacement() {
      const levels = LEVELS6.filter(levelHasItems);
      let li = 0; let block = []; const pcts = {};
      const score = (results, L) => { const rs = results.filter(r => r.item.block === L); return rs.length ? rs.reduce((a, r) => a + Readiness.credit(r.s), 0) / rs.length : null; };
      const src = {
        kind: 'placement',
        hash: '#test/placement',
        next(results) {
          while (!block.length) {
            if (li > 0) { const L = levels[li - 1]; const p = score(results, L); if (p != null) pcts[L] = p; if (p == null || p < 0.8) return null; }
            if (li >= levels.length) return null;
            block = placementBlock(levels[li]); li++;
          }
          return block.shift();
        },
        progress(results) { const L = levels[li - 1]; const n = results.filter(r => r.item.block === L).length; return { label: `Placement · ${L}`, i: n, total: n + block.length + 1 }; },
        finish(results) {
          for (const L of LEVELS6) { const p = score(results, L); if (p != null) pcts[L] = p; }
          const est = placementEstimate(pcts);
          if (est) { prefs.testLevel = est; DG.savePrefs(); }
          return { pcts, est };
        },
      };
      runSession(src);
    }
    function runSweep(o, items) {
      const list = items.slice();
      runSession({
        kind: 'sweep', hash: '#test/sweep/' + o.level,
        next: () => list.shift() || null,
        progress: results => ({ label: o.gap ? `${o.level} · ${o.gap.kind === 'words' ? (TD.themeById.get(o.gap.id)?.en || o.gap.id) : o.gap.name || o.gap.id}` : `Sweep · ${o.level}`, i: results.length, total: results.length + list.length + 1 }),
        finish: () => ({}),
        again: () => { const more = o.gap ? gapItems(o.gap, o.level) : sweepItems(o); return more.length ? () => runSweep(o, more) : null; },
      });
    }

    // --- one typed session: prompt, input, timer, try again, reveal, summary ---
    function runSession(src) {
      stage._cleanup?.();
      const secs = DG.testSecs(), maxTries = Math.max(1, DG.testTries());
      const results = [];
      const autoN = (() => { const a = new URLSearchParams(location.search).get('autotest'); return a == null ? 0 : a === 'reveal' ? -1 : Math.max(1, +a || 12); })();
      history.replaceState(null, '', src.hash);
      document.body.classList.add('focus'); renderPickers();
      $('#view > header')?.setAttribute('hidden', ''); $('#today-strip').hidden = true;
      const prog = h('div', { class: 'sess-prog', 'aria-hidden': 'true' }, h('i'));
      const progN = h('span', { class: 'mono sess-n' });
      const endBtn = h('button', { type: 'button', class: 'btn small-btn', onclick: () => end() }, 'End', h('kbd', {}, 'Esc'));
      const bar = h('div', { class: 'sess-bar' }, prog, progN, endBtn);
      const cardEl = h('div', { class: 'card sess-card tt-card' });
      const foot = h('div', { class: 'tt-foot' });
      const session = h('div', { class: 'session' }, bar, cardEl, foot);
      rep(stage, session);
      let cur = null, tries = 0, t0 = 0, am = false, revealed = false, timer = null, advance = null, input = null, fb = null, over = false;

      function next() {
        clearTimeout(advance); clearTimeout(timer);
        cur = src.next(results);
        if (!cur) return summary();
        tries = 0; am = false; revealed = false; over = false;
        const p = src.progress(results);
        prog.firstChild.style.width = (100 * p.i / Math.max(1, p.total)) + '%';
        progN.textContent = `${p.label} · ${p.i + 1} / ${p.total}`;
        input = h('input', { class: 'tt-input', type: 'text', lang: 'de', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'Your answer in German' });
        const timeBar = h('div', { class: 'tt-timer', 'aria-hidden': 'true' }, h('i'));
        fb = h('div', { class: 'tt-fb', 'aria-live': 'polite' });
        const form = h('form', { class: 'tt-form', onsubmit: e => { e.preventDefault(); revealed ? next() : submit(); } }, input, h('button', { type: 'submit', class: 'btn primary tt-check' }, 'Check'));
        rep(cardEl,
          h('div', { class: 'sess-lang' }, h('span', { class: 'lvl' }, cur.level), cur.meta.map(m => h('span', { class: 'tt-meta' }, m))),
          cur.task ? h('div', { class: 'tt-task' }, cur.task) : null,
          h('div', { class: 'sess-prompt', lang: cur.kind === 'grammar' ? 'de' : 'en' }, cur.prompt),
          form, timeBar, fb);
        rep(foot, h('div', { class: 'foot-row' }, h('button', { type: 'button', class: 'btn', onclick: skip }, 'Skip', h('kbd', { class: 'keys-only' }, 'Tab'))));
        input.focus({ preventScroll: false });
        t0 = performance.now();
        const bi = timeBar.firstChild;
        bi.style.transition = 'none'; bi.style.width = '100%';
        requestAnimationFrame(() => requestAnimationFrame(() => { bi.style.transition = `width ${secs}s linear`; bi.style.width = '0%'; }));
        timer = setTimeout(() => { over = true; timeBar.classList.add('over'); }, secs * 1000);
        DG.announce(`${cur.task ? cur.task + '. ' : ''}${cur.prompt}`);
        if (autoN) autoplay();
      }
      function submit() {
        if (revealed || !cur) return;
        const val = input.value; if (!val.trim()) { input.focus(); return; }
        tries++;
        const ms = performance.now() - t0;
        const r = Match.check(val, cur.accepted, { ...cur.opts, slots: true });
        if (r.articleMiss) am = true;
        if (r.ok) return finish(tries === 1 && ms <= secs * 1000 ? 'known' : 'shaky', true, ms, r, val);
        if (r.close) return finish('shaky', true, ms, r, val);
        if (tries < maxTries) {
          rep(fb, h('div', { class: 'tt-again' }, h('b', {}, 'Try again'), r.articleMiss ? ' · Right word, wrong article.' : r.caseMiss ? ' · Check the capital letters.' : null));
          input.select();
          return;
        }
        finish('unknown', false, ms, r, val);
      }
      function skip() { if (revealed || !cur) return; finish('unknown', false, 0, null, '', true); }
      function finish(st, ok, ms, r, val, skipped = false) {
        clearTimeout(timer);
        revealed = true; input.readOnly = true;
        const tb = cardEl.querySelector('.tt-timer i'); if (tb) { const w = getComputedStyle(tb).width; tb.style.transition = 'none'; tb.style.width = w; }
        const prev = DG.know(TEST_LANG, cur.id);
        DG.setKnow(TEST_LANG, cur.id, { s: st, ok, ms, am });
        const res = { item: cur, s: st, ok, ms, am, tries, val, skipped, r, prev };
        results.push(res);
        drawReveal(res);
        if (st === 'known' && r?.exact && !r.others.length && !autoN) advance = setTimeout(() => { if (res === results[results.length - 1] && revealed) next(); }, 700);
      }
      function drawReveal(res) {
        const it = res.item, r = res.r;
        const why = res.s === 'known' ? null
          : res.s === 'shaky' ? (r?.close ? 'Almost: one letter off.' : res.tries > 1 ? `Right on try ${res.tries}.` : `Right, but over ${secs} seconds.`)
            : res.skipped ? 'Skipped.' : res.am ? 'Right word, wrong article.' : r?.caseMiss ? 'Check the capital letters.' : null;
        const correct = r && (r.ok || r.close || r.articleMiss || r.caseMiss) ? r.fixed : it.answer;
        const others = (r?.ok ? r.others : it.accepted.filter(a => a !== (r?.matched || it.accepted[0]) && a !== correct)).filter(a => a !== correct);
        const knewIt = res.s === 'unknown' && !res.skipped ? h('button', { type: 'button', class: 'linkish small', onclick: e => {
          DG.putKnow(TEST_LANG, it.id, res.prev);
          DG.setKnow(TEST_LANG, it.id, { s: 'shaky', ok: true, ms: res.ms, am: res.am });
          res.s = 'shaky'; res.knewIt = true;
          e.currentTarget.replaceWith(h('span', { class: 'small muted' }, 'Marked shaky.'));
          fb.querySelector('.tt-state').textContent = STATE_LABEL.shaky; fb.querySelector('.tt-state').className = 'tt-state s-shaky';
          $('.tt-next')?.focus();
        } }, 'I knew it (typo)') : null;
        rep(fb,
          h('div', { class: 'tt-verdict' }, h('b', { class: 'tt-state s-' + res.s }, STATE_LABEL[res.s]), why ? h('span', { class: 'muted' }, why) : null, knewIt),
          h('div', { class: 'tt-answer' }, T(TEST_LANG, correct)),
          res.val && !r?.ok && !res.skipped ? h('div', { class: 'small muted' }, 'You wrote: ', h('span', { lang: 'de' }, res.val)) : null,
          r?.ok && !r.exact && res.val ? h('div', { class: 'small muted' }, 'Spelled: ', T(TEST_LANG, r.fixed)) : null,
          others.length ? h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Also correct: '), others.map((o, i) => [i ? ' · ' : '', T(TEST_LANG, o)])) : null,
          (it.extra || []).length ? h('div', { class: 'small muted' }, it.extra.join(' · ')) : null,
          it.ex ? h('div', { class: 'tt-ex' }, T(TEST_LANG, it.ex), it.exen ? h('div', { class: 'gl' }, it.exen) : null) : null,
          it.note ? h('div', { class: 'ans-note' }, it.note) : null);
        cardEl.classList.add('revealed');
        rep(foot, h('div', { class: 'foot-row' }, h('button', { type: 'button', class: 'btn primary big tt-next', onclick: next }, 'Next', h('kbd', { class: 'keys-only' }, 'Enter'))));
        input.focus({ preventScroll: true });
        DG.announce(`${STATE_LABEL[res.s]}. ${correct}`);
      }
      function onKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
        if (e.key === 'Escape') { e.preventDefault(); end(); }
        else if (e.key === 'Tab' && !e.shiftKey && !revealed && e.target === input) { e.preventDefault(); skip(); }
        else if (e.key === 'Enter' && revealed && !e.target.matches?.('button,a')) { e.preventDefault(); if (!e.repeat) next(); }
      }
      document.addEventListener('keydown', onKey);
      stage._cleanup = () => { document.removeEventListener('keydown', onKey); clearTimeout(timer); clearTimeout(advance); };
      function end() { stage._cleanup?.(); summary(); }

      function summary() {
        stage._cleanup?.(); stage._cleanup = null;
        document.body.classList.remove('focus'); renderPickers();
        history.replaceState(null, '', '#test');
        prog.firstChild.style.width = '100%'; endBtn.hidden = true; progN.hidden = true;
        const out = src.finish(results);
        const n = s => results.filter(r => r.s === s).length;
        const misses = results.filter(r => r.s !== 'known');
        const artMiss = results.filter(r => r.am);
        const estLine = out.est ? h('p', { class: 'tt-est' }, `Estimated level: ${out.est} (`, LEVELS6.filter(L => L in out.pcts).map((L, i) => `${i ? ', ' : ''}${L} ${pct(out.pcts[L])}`).join(''), ')') : null;
        cardEl.className = 'card sess-card summary';
        rep(cardEl,
          h('div', { class: 'eyebrow' }, src.kind === 'placement' ? 'Placement done' : 'Done'),
          h('h2', { tabindex: -1 }, results.length ? `${n('known')} of ${results.length} known` : 'You stopped before answering'),
          results.length ? h('div', { class: 'sum-grid' }, [['known', 'Known'], ['shaky', 'Shaky'], ['unknown', 'Not yet']].map(([k, label]) => h('div', { class: 'stat s-' + k }, h('b', {}, n(k)), h('span', {}, label)))) : null,
          estLine,
          artMiss.length ? h('div', { class: 'section' }, h('div', { class: 'eyebrow' }, 'Article misses'), h('div', { class: 'sum-list' }, artMiss.map(r => h('div', { class: 'sum-row' }, h('span', { class: 'lvl' }, r.item.level), h('span', {}, r.item.prompt), T(TEST_LANG, r.item.answer))))) : null,
          misses.length ? h('div', { class: 'section' }, h('div', { class: 'eyebrow' }, 'Shaky and not yet'), h('div', { class: 'sum-list' }, misses.map(r => h('div', { class: 'sum-row' }, h('span', { class: 'lvl' }, STATE_LABEL[r.s]), h('span', {}, r.item.task ? `${r.item.task}: ${r.item.prompt}` : r.item.prompt), T(TEST_LANG, r.item.answer))))) : null);
        const practice = misses.length ? h('button', { type: 'button', class: 'btn big', onclick: () => {
          queueForDrill(misses.map(r => r.item.id)); location.hash = '#drill';
        } }, 'Practice the ones I missed') : null;
        const againFn = src.again?.();
        const keep = src.kind === 'placement'
          ? h('button', { type: 'button', class: 'btn primary big', onclick: () => { const o = sweepOpts(out.est || prefs.testLevel); const items = sweepItems(o); items.length ? runSweep(o, items) : setup(); } }, 'Keep going')
          : againFn ? h('button', { type: 'button', class: 'btn primary big', onclick: againFn }, 'Keep going') : null;
        rep(foot, h('div', { class: 'foot-row' }, practice, keep, h('button', { type: 'button', class: 'btn big', onclick: () => setup() }, 'Done')));
        cardEl.querySelector('h2').focus({ preventScroll: true });
        DG.announce('Test done');
      }

      // ?autotest=N answers N questions (mostly right, every 6th wrong) for screenshots; ?autotest=reveal stops on a wrong reveal
      let autoCount = 0;
      function autoplay() {
        const k = autoCount++;
        if (autoN > 0 && k >= autoN) { Promise.resolve().then(end); return; }
        const wrong = autoN === -1 ? k === 1 : k % 6 === 5;
        const later = fn => Promise.resolve().then(fn);   // microtasks: not throttled in a background tab
        later(() => {
          if (autoN === -1 && k > 1) return;
          if (wrong) { input.value = 'weiss nicht'; submit(); if (!revealed) { input.value = 'keine Ahnung'; submit(); } if (autoN > 0) later(next); return; }
          input.value = cur.kind === 'words' && k % 5 === 1 ? Match.fold(cur.answer) : cur.kind === 'chunks' ? cur.answer : cur.answer;
          submit();
          if (autoN > 0) later(() => { if (revealed) next(); });
          else if (autoN === -1 && k === 0) later(() => { if (revealed) next(); });
        });
      }
      next();
    }
  }

  // ===== Write: scenario writing, one language at a time =====
  function viewWrite(view, allLangs) {
    const langs = allLangs.filter(l => LANG[l]);
    const partial = allLangs.filter(l => !meta(l).full);
    if (!langs.length) {
      app(view, header('Write', 'Write'), h('div', { class: 'empty' }, 'Writing tasks exist for Khasi, German, Hindi, French and Swiss German. ',
        h('button', { type: 'button', class: 'btn small-btn', onclick: () => { DG.setLangs(['german', ...DG.langs().filter(l => l !== 'german')]); render(); } }, 'Add German')));
      return;
    }
    const plang = langs.includes(state.plang) ? state.plang : langs[0];
    state.plang = plang;
    const L = LANG[plang]; const m = meta(plang); const M = master();
    const scenarios = FW.scenarios.filter(s => levelOK(s.level));
    if (!scenarios.length) { app(view, header('Write · ' + levelLabel(), 'Write it in ' + m.name), h('div', { class: 'empty' }, `No writing tasks at ${state.level}. `, h('button', { type: 'button', class: 'linkish', onclick: () => go({ level: 'all' }) }, 'Show all levels'))); return; }
    const prog = progress[plang] = progress[plang] || {};
    let current = scenarios.find(s => s.id === state.scenario) || scenarios.find(s => !prog[s.id]) || scenarios[0];
    state.scenario = current.id;
    if (location.hash !== hashFor(state)) history.replaceState(null, '', hashFor(state));

    app(view, header('Write · ' + levelLabel(), 'Write it in ' + m.name),
      langs.length > 1 ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Language' }, langs.map(l => h('button', { type: 'button', class: 'chip', 'aria-pressed': l === plang ? 'true' : 'false', onclick: () => { state.plang = l; render({ keepScroll: true, quiet: true }); } }, meta(l).name))) : null,
      partial.length ? h('div', { class: 'notice' }, `${names(partial)} ${partial.length === 1 ? 'only has' : 'only have'} phrases so far.`, h('a', { href: 'app.html#lookup/phrases' }, 'Show phrases')) : null);
    const main = h('div', { class: 'scenario' });
    const side = h('aside', { class: 'side' });
    app(view, h('div', { class: 'practice' }, main, side));

    function drawSide() {
      const done = scenarios.filter(s => prog[s.id]).length;
      rep(side, h('div', { class: 'panel' },
        h('div', { class: 'eyebrow' }, `${m.name} · ${done} of ${scenarios.length} done`),
        h('div', { class: 'progress', 'aria-hidden': 'true' }, scenarios.map(s => h('i', { class: prog[s.id] ? 'r' + prog[s.id].rating : '' }))),
        h('div', { class: 'sc-list' }, scenarios.map(s => h('button', { type: 'button', 'aria-current': s.id === current.id ? 'true' : null, onclick: () => { current = s; go({ scenario: s.id }, { keepScroll: true, quiet: true }); } },
          h('span', { class: 'dot ' + (prog[s.id] ? 'r' + prog[s.id].rating : ''), 'aria-label': prog[s.id] ? ['', 'Wrong', 'Nearly', 'Right'][prog[s.id].rating] : 'Not done' }), h('span', { class: 'mono' }, s.id.replace('SC-', '')), h('span', { class: 'ellip' }, s.task))))));
    }
    function drawMain() {
      const sc = current; const data = L._sc[sc.id];
      rep(main, h('div', { class: 'sc-head' }, lvl(sc.level), h('span', { class: 'muted small' }, M[sc.function]?.en)));
      const body = h('div', { class: 'sc-body' }); app(main, body);
      app(body, h('div', { class: 'situation' }, sc.situation), h('div', { class: 'task' }, sc.task));
      const hintRow = h('div', { class: 'hint-row' });
      for (const id of [...sc.recipe, sc.turn]) { const mm = M[id]; if (!mm) continue; const it = item(plang, id); app(hintRow, h('div', { class: `hint l-${mm.layer}` }, h('span', { class: 'id' }, shortEn(id)), it ? T(plang, it.target) : h('span', { class: 't' }, mm.en))); }
      let open = !!prefs.hintsOpen; hintRow.hidden = !open;
      const hintBtn = h('button', { type: 'button', class: 'btn small-btn', 'aria-expanded': open ? 'true' : 'false', onclick: () => { open = !open; prefs.hintsOpen = open; DG.savePrefs(); hintRow.hidden = !open; hintBtn.textContent = open ? 'Hide building blocks' : 'Show building blocks'; hintBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); } }, open ? 'Hide building blocks' : 'Show building blocks');
      app(body, h('div', { class: 'row' }, hintBtn, h('span', { class: 'muted small' }, 'The phrases the model answer uses.')), hintRow);
      const ta = h('textarea', { id: 'attempt', placeholder: `Your answer in ${m.name}`, 'aria-label': `Your answer in ${m.name}`, lang: plang, dataset: { script: m.script } });
      if (prog[sc.id]?.attempt) ta.value = prog[sc.id].attempt;
      let hasKey = false; try { hasKey = !!localStorage.getItem(KEYS.apikey); } catch {}
      const aiBtn = hasKey ? h('button', { type: 'button', class: 'btn', onclick: aiCheck }, 'Check with Claude') : null;
      const nextBtn = h('button', { type: 'button', class: 'btn', onclick: () => { const i = scenarios.indexOf(current); current = scenarios[(i + 1) % scenarios.length]; go({ scenario: current.id }, { keepScroll: true, quiet: true }); } }, 'Next task');
      app(body, ta, h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn primary', onclick: check }, 'Check'), h('button', { type: 'button', class: 'btn', onclick: () => reveal() }, 'Show model answer'), aiBtn, h('span', { style: 'flex:1' }), nextBtn));
      if (!hasKey) app(body, h('p', { class: 'small' }, h('button', { type: 'button', class: 'linkish', onclick: DG.openSettings }, 'Add an API key to check with Claude')));
      const result = h('div', { class: 'result' }); app(body, result);
      if (prog[sc.id]) reveal(false);

      const norm = s => (s || '').normalize('NFC').toLowerCase().replace(/[.,!?;:"'’“”()\-]/g, ' ').replace(/\s+/g, ' ').trim();
      function check() {
        if (!data) return reveal();
        const a = norm(ta.value); if (!a) return ta.focus();
        const hits = (data.keys || []).map(k => ({ k, hit: a.includes(norm(k)) }));
        rep(result, h('div', {}, h('b', {}, `${hits.filter(x => x.hit).length} of ${hits.length} key words used.`), ' ', h('span', { class: 'muted small' }, 'This only checks words: a correct answer phrased differently can still score low.')), h('div', { class: 'keys' }, hits.map(x => h('span', { class: 'key ' + (x.hit ? 'hit' : 'miss') }, x.hit ? '✓ ' : '✗ ', T(plang, x.k)))));
        reveal(true);
      }
      function reveal(keep = true) {
        if (!data) { rep(result, h('div', { class: 'empty' }, 'No model answer for this task yet.')); return; }
        rep(result, ...(keep ? [...result.children].filter(el => !el.classList.contains('model')) : []));
        const blocks = h('div', { class: 'tiles-row' }, (data.breakdown || []).map(b => h('span', { class: `tile ${{ door: 'r-door', glue: 'r-glue', turn: 'r-turn' }[b.layer] || ''}`, lang: plang, dataset: { script: m.script } }, b.text, h('span', { class: 'lb' }, b.label || (b.id ? shortEn(b.id) : '') || ''))));
        app(result, h('div', { class: 'model' }, h('div', { class: 'eyebrow' }, 'Model answer'), blocks,
          data.model.translit ? h('div', { class: 'tr' }, data.model.translit) : null, h('div', { class: 'gl' }, data.model.gloss),
          data.alt ? h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Also natural: '), T(plang, data.alt)) : null,
          data.tip ? h('div', { class: 'small' }, h('b', {}, 'Common mistake: '), data.tip) : null,
          h('div', { class: 'rate', role: 'group', 'aria-label': 'How did it go?' }, [[3, 'Right'], [2, 'Nearly'], [1, 'Wrong']].map(([r, label]) => h('button', { type: 'button', class: `btn r${r}`, 'aria-pressed': prog[sc.id]?.rating === r ? 'true' : 'false', onclick: () => rate(r) }, label)))));
      }
      function rate(r) {
        prog[sc.id] = { rating: r, attempt: ta.value, at: new Date().toISOString() }; save(KEYS.progress, progress);
        // the same situation is also a Drill card, so the two share one schedule
        srsGrade(plang, 'C:' + sc.id, r === 3 ? 3 : r === 2 ? 2 : 1);
        drawSide(); main.querySelectorAll('.rate button').forEach(b => b.setAttribute('aria-pressed', b.classList.contains('r' + r) ? 'true' : 'false'));
      }
      async function aiCheck() {
        let key = ''; try { key = localStorage.getItem(KEYS.apikey) || ''; } catch {}
        const attempt = ta.value.trim(); if (!key || !attempt) return ta.focus();
        aiBtn.disabled = true; aiBtn.textContent = 'Checking…';
        const box = h('div', { class: 'ai' }, h('span', { class: 'muted' }, 'Checking…')); result.prepend(box);
        try {
          const recipe = sc.recipe.map(id => `${id}: ${item(plang, id)?.target || M[id]?.en}`).join('\n');
          const prompt = `You are a ${m.name} tutor (${m.variety}). The learner is at CEFR ${sc.level}.\nSituation: ${sc.situation}\nTask: ${sc.task}\nRecipe the model answer uses:\n${recipe}\nModel answer: ${data?.model?.target || '(none)'}\n\nLearner's attempt:\n${attempt}\n\nJudge the attempt on its own merits; it need not match the model. Reply with JSON only:\n{"score": 0-3, "corrected": "the attempt with minimal corrections, in ${m.name}", "feedback": "2-3 sentences in English: what was right, the one most important fix, whether the recipe pieces were used", "natural": "how a native speaker would most likely say it"}`;
          const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'anthropic-beta': 'server-side-fallback-2026-07-01' }, body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 1024, fallbacks: 'default', messages: [{ role: 'user', content: prompt }] }) });
          const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status);
          const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
          let parsed = null; try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch {}
          rep(box, h('div', { class: 'score' }, parsed ? `Score ${parsed.score}/3` : 'Feedback'), parsed ? h('div', {}, h('span', { class: 'muted' }, 'Corrected: '), T(plang, parsed.corrected)) : null, h('div', {}, parsed ? parsed.feedback : text), parsed?.natural ? h('div', {}, h('span', { class: 'muted' }, 'A native speaker would say: '), T(plang, parsed.natural)) : null);
          if (parsed && typeof parsed.score === 'number') rate(Math.max(1, Math.min(3, Math.round(parsed.score))));
        } catch (e) { rep(box, h('div', {}, `AI check failed (${e.message}). The word check above still works.`)); }
        finally { aiBtn.disabled = false; aiBtn.textContent = 'Check with Claude'; }
      }
    }
    drawSide(); drawMain();
  }

  // ---------- boot ----------
  async function boot() {
    try { FW = await framework(); }
    catch (e) { $('#view').replaceChildren(h('div', { class: 'banner' }, `Couldn't load the site data (${e.message}).`, h('button', { type: 'button', class: 'btn small-btn', onclick: boot }, 'Retry'))); return; }
    const pv = OLD_VIEW[prefs.view] || prefs.view;
    state.view = VIEWS.includes(pv) ? pv : 'drill';
    state.level = FW.levels.includes(prefs.level) || prefs.level === 'all' ? prefs.level : 'A1';
    state.tab = TABS.includes(prefs.lookTab) ? prefs.lookTab : prefs.view === 'reference' ? (OLD_LAYER_TAB[prefs.layer] || 'grammar') : 'phrases';
    state.gl = GRAMMAR.some(g => g[0] === prefs.grammarLayer) ? prefs.grammarLayer : GRAMMAR.some(g => g[0] === prefs.layer) ? prefs.layer : 'turn';
    if (location.hash.length > 1) state = parseHash();
    go({});
  }
  DG.initBar(null);
  boot();
})();
