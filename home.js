/* Igloo homepage: Today panel, one sentence in ten languages, change it, word order, tenses, the parts.
   Reads data/framework.json, data/sentences/*.json and data/turns.json. No build step. */
(() => {
  'use strict';
  const { h, $, getJSON, framework } = DG;
  const svgEl = (tag, attrs = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = matchMedia('(max-width: 640px)');
  const ROLE_PRI = ['door', 'door2', 'glue', 'neg', 'q', 'aux', 'x'];
  const ROLE_CLASS = { door: 'r-door', door2: 'r-door', glue: 'r-glue', neg: 'r-turn', q: 'r-turn', aux: 'r-turn', x: 'r-x' };
  const ROLE_COLOR = { door: 'var(--door)', door2: 'var(--door)', glue: 'var(--glue)', neg: 'var(--turn)', q: 'var(--turn)', aux: 'var(--turn)', x: 'var(--neutral)' };
  const TIMES = ['past', 'present', 'future'], ASPECTS = ['simple', 'progressive', 'perfect'];
  const TIME_LABEL = { past: 'Past', present: 'Now', future: 'Future' };
  const CELL_NAME = c => { const [t, a] = c.split('.'); return `${t === 'present' ? 'present' : t} ${a}`; };

  let FW, EN, TURNS, LANGS = [], SENT = {};
  const state = { meaning: 'decline', variant: 'now', cell: 'present.simple', test: false, touched: false, answers: {} };
  const meta = id => FW.languages.find(l => l.id === id);
  const dirOf = lang => (lang !== 'en' && meta(lang)?.rtl ? 'rtl' : null);
  const roleClass = roles => { for (const r of ROLE_PRI) if (roles.includes(r)) return ROLE_CLASS[r]; return ''; };
  const roleColor = role => ROLE_COLOR[role] || 'var(--neutral)';
  const roleLabel = roles => roles.map(r => EN.roles[r] || r).join(' + ');
  const variantOf = (mid, vid) => EN.meanings.find(m => m.id === mid)?.variants.find(v => v.id === vid);
  const tokensFor = (lang, mid, vid) => lang === 'en' ? variantOf(mid, vid)?.tokens.map(t => [t[0], t[1]]) : SENT[lang]?.variants?.[`${mid}.${vid}`]?.tokens;
  const whyFor = (lang, mid, vid) => SENT[lang]?.variants?.[`${mid}.${vid}`]?.why || '';

  DG.initBar(null);

  // ---------- scroll line ----------
  const line = $('#scroll-line i');
  const howEl = $('#how');
  let inHow = null;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight; line.style.width = (max > 0 ? 100 * scrollY / max : 0) + '%';
    const now = !howEl.hidden && howEl.getBoundingClientRect().top < innerHeight * .4;
    if (now !== inHow) { inHow = now; DG.initBar(now ? 'how' : null); }
  };
  addEventListener('scroll', onScroll, { passive: true });

  // ---------- tiles and rows ----------
  function tile(lang, tok, key = '') {
    const [text, rolesStr] = tok; const roles = rolesStr.split('|');
    return h('span', { class: 'tile ' + roleClass(roles) + (lang === 'en' ? ' en' : ''), tabindex: 0, dataset: { roles: rolesStr, key, script: lang === 'en' ? 'latin' : meta(lang).script }, lang: lang === 'en' ? 'en' : lang, dir: lang === 'en' ? 'ltr' : dirOf(lang) },
      h('span', { class: 'role' }, roleLabel(roles)), text);
  }
  function keyed(tokens) { const seen = {}; return tokens.map(t => { const k = t[1]; seen[k] = (seen[k] || 0) + 1; return { tok: t, key: `${k}#${seen[k]}` }; }); }
  function fillRow(row, lang, tokens, animate = true) {
    const tilesEl = row.querySelector('.row-tiles');
    const first = {};
    if (animate && !reduce) for (const el of tilesEl.children) first[el.dataset.key] = el.getBoundingClientRect();
    const fresh = keyed(tokens).map(({ tok, key }) => tile(lang, tok, key));
    tilesEl.replaceChildren(...fresh);
    const tr = row.querySelector('.row-tr');
    if (tr) { const t = tokens.some(x => x[2]) ? tokens.map(x => x[2] || '').join(' ') : ''; tr.textContent = t; tr.hidden = !t; }
    if (!animate || reduce) return;
    for (const el of fresh) {
      const f = first[el.dataset.key]; const l = el.getBoundingClientRect();
      if (f) { const dx = f.left - l.left, dy = f.top - l.top; if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      else el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 100, easing: 'ease-out', fill: 'backwards' });
    }
  }
  function langRow(lang, opts = {}) {
    const m = lang === 'en' ? { name: 'English', native: '' } : meta(lang);
    return h('div', { class: 'lang-row' + (lang === 'en' ? ' en' : ''), dataset: { lang } },
      h('div', { class: 'row-name' }, h('b', {}, m.name), m.native && m.native !== m.name ? h('span', { lang, dir: m.rtl ? 'rtl' : null, dataset: { script: m.script } }, m.native) : null),
      h('div', { class: 'row-tiles', dir: dirOf(lang) }),
      h('div', { class: 'row-tr', hidden: true }),
      opts.why ? h('div', { class: 'row-why' }) : null,
      opts.cap ? h('div', { class: 'row-cap', 'aria-live': 'polite' }) : null);
  }
  // highlight matching words across rows: hover, keyboard focus, or tap (tap pins it)
  function wireMatch(container, onRoles) {
    let pinned = null;
    const light = roles => {
      container.querySelectorAll('.lang-row, .river-body').forEach(r => r.classList.toggle('dimming', !!roles));
      container.querySelectorAll('.tile').forEach(el => el.classList.toggle('lit', !!roles && el.dataset.roles.split('|').some(r => roles.includes(r))));
      container.querySelectorAll('.ribbon').forEach(el => el.classList.toggle('lit', !!roles && roles.includes(el.dataset.role)));
    };
    const show = t => {
      container.querySelectorAll('.tile.hovered').forEach(x => x.classList.remove('hovered'));
      if (!t) { light(null); onRoles?.(null, null); return; }
      t.classList.add('hovered'); const roles = t.dataset.roles.split('|'); light(roles); onRoles?.(roles, t);
    };
    container.addEventListener('mouseover', e => { if (pinned) return; const t = e.target.closest('.tile'); if (t) show(t); });
    container.addEventListener('mouseleave', () => { if (!pinned) show(null); });
    container.addEventListener('focusin', e => { const t = e.target.closest('.tile'); if (t && !pinned) show(t); });
    container.addEventListener('focusout', e => { if (!pinned && !container.contains(e.relatedTarget)) show(null); });
    container.addEventListener('click', e => {
      const t = e.target.closest('.tile');
      if (!t || t === pinned) { pinned = null; show(null); return; }
      pinned = t; show(t);
    });
    container.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.tile')) { e.preventDefault(); e.target.click(); } if (e.key === 'Escape') { pinned = null; show(null); } });
    return { reset: () => { pinned = null; show(null); } };
  }

  // ---------- Today (returning) and first visit ----------
  function renderToday() {
    const box = $('#today');
    const first = $('#first-run');
    if (!DG.hasHistory()) {
      box.hidden = true; first.hidden = false; renderFirstRun(); return;
    }
    first.hidden = true; box.hidden = false;
    const list = DG.langs();
    const due = DG.dueByLang(list);
    const totalDue = Object.values(due).reduce((a, b) => a + b, 0);
    const newTotal = list.reduce((a, l) => a + DG.newLeft(l), 0);
    const tomorrow = Object.values(DG.dueByLang(list, DG.dayNow() + 1)).reduce((a, b) => a + b, 0) - totalDue;
    const streak = DG.streak();
    const name = id => meta(id)?.name || id;
    const mins = Math.max(1, Math.round((totalDue + newTotal) * 10 / 60));
    const inner = h('div', { class: 'today-inner' }, h('p', { class: 'eyebrow' }, 'Today'));
    if (totalDue + newTotal === 0) {
      inner.append(h('h2', { id: 'today-title' }, 'Done for today'),
        h('p', { class: 'today-line' }, `Next: ${tomorrow} due tomorrow.` + (streak ? ` ${streak} ${streak === 1 ? 'day' : 'days'} in a row.` : '')),
        h('div', { class: 'today-row' }, h('a', { class: 'btn', href: 'app.html#drill' }, 'Practise more'), h('a', { class: 'btn', href: 'app.html#lookup' }, 'Look up')));
    } else {
      const parts = list.filter(l => due[l]).map((l, i) => h('span', {}, h('b', {}, name(l)), ` ${due[l]}${i === 0 ? ' due' : ''}`));
      if (!parts.length) parts.push(h('span', {}, 'Nothing due'));
      const start = h('a', { class: 'btn primary big', href: 'app.html#drill/start', id: 'today-start' }, 'Start');
      inner.append(h('h2', { id: 'today-title' }, "Today's drill"),
        h('p', { class: 'today-line' }, parts, newTotal ? h('span', { class: 'm' }, `${newTotal} new`) : h('span', { class: 'm' }, 'No new cards left today'), h('span', { class: 'm' }, `about ${mins} min`)),
        h('div', { class: 'today-row' }, start, h('a', { class: 'btn', href: 'app.html#drill' }, 'Options'),
          streak ? h('span', { class: 'sub' }, `${streak} ${streak === 1 ? 'day' : 'days'} in a row`) : null));
      // Enter or Space starts: the Start link has focus
      requestAnimationFrame(() => { if (!location.hash) start.focus({ preventScroll: true }); });
      start.addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); start.click(); } });
    }
    box.replaceChildren(inner);
  }
  function renderFirstRun() {
    const box = $('#first-run');
    const all = FW.languages.map(l => l.id);
    let chosen = DG.hasChosenLangs() ? DG.langs().filter(l => all.includes(l)) : DG.DEFAULT_LANGS.slice();
    const draw = () => {
      const togs = all.slice().sort((a, b) => (chosen.includes(a) ? chosen.indexOf(a) : 99) - (chosen.includes(b) ? chosen.indexOf(b) : 99))
        .map(id => h('button', { type: 'button', class: 'tog', 'aria-pressed': chosen.includes(id) ? 'true' : 'false', onclick: () => {
          chosen = chosen.includes(id) ? chosen.filter(x => x !== id) : [...chosen, id];
          draw(); box.querySelector(`[data-id="${id}"]`)?.focus();
        }, dataset: { id } }, meta(id).name));
      box.replaceChildren(h('div', { class: 'first-inner' },
        h('h2', { id: 'first-title' }, 'Which languages are you learning?'),
        h('p', { class: 'small muted' }, 'Tap to add or remove. The first one gets new cards first; you can reorder them later in Settings.'),
        h('div', { class: 'tog-row' }, togs),
        h('div', {}, h('button', { type: 'button', class: 'btn primary big', disabled: !chosen.length, onclick: () => {
          DG.setLangs(chosen); location.href = 'app.html#drill/try';
        } }, 'Try 10 prompts'))));
    };
    draw();
  }

  // ---------- 1: one sentence ----------
  function one(play) {
    const stage = $('#one-stage'); if (stage.closest('[hidden]')) return;
    document.querySelectorAll('.ghost-tile').forEach(g => g.remove());
    const mid = 'decline', vid = 'now';
    const enRow = langRow('en'); const rows = [enRow];
    const list = h('div', { class: 'lang-rows' }, enRow);
    fillRow(enRow, 'en', tokensFor('en', mid, vid), false);
    for (const l of LANGS) { const t = tokensFor(l, mid, vid); if (!t) continue; const r = langRow(l); fillRow(r, l, t, false); rows.push(r); list.append(r); }
    stage.replaceChildren(list);
    wireMatch(list);
    if (!play || reduce) { stage.classList.remove('pre'); return; }
    stage.classList.add('pre');
    const run = () => {
      DG.save(DG.KEYS.prismSeen, 1);
      const wraps = rows.some(r => { const t = r.querySelector('.row-tiles'); const k = t.firstElementChild; return k && t.getBoundingClientRect().height > k.getBoundingClientRect().height * 1.8; });
      const enTiles = [...enRow.querySelectorAll('.tile')];
      rows.slice(1).forEach((r, i) => setTimeout(() => {
        r.classList.add('in');
        if (phone.matches || wraps) return;
        [...r.querySelectorAll('.tile')].forEach((el, j) => {
          const roles = el.dataset.roles.split('|');
          const src = enTiles.find(t => t.dataset.roles.split('|').some(x => roles.includes(x)));
          if (!src) return;
          const l = el.getBoundingClientRect(), f = src.getBoundingClientRect();
          const ghost = el.cloneNode(true); ghost.classList.add('ghost-tile'); ghost.removeAttribute('tabindex');
          Object.assign(ghost.style, { left: f.left + 'px', top: f.top + 'px', width: f.width + 'px', height: f.height + 'px' });
          el.style.opacity = '0'; document.body.append(ghost);
          const a = ghost.animate([{ transform: 'none', opacity: .85 }, { transform: `translate(${l.left - f.left}px,${l.top - f.top}px)`, width: l.width + 'px', height: l.height + 'px', opacity: 1 }], { duration: 560, delay: j * 30, easing: 'cubic-bezier(.3,.7,.1,1)', fill: 'forwards' });
          const done = () => { ghost.remove(); el.style.opacity = ''; }; a.onfinish = done; a.oncancel = done;
        });
      }, 160 * i));
      setTimeout(() => stage.classList.remove('pre'), 160 * rows.length + 900);
    };
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); requestAnimationFrame(run); } }, { threshold: .25 });
    io.observe(stage);
  }
  $('#one-replay').addEventListener('click', () => one(true));

  // ---------- 2: change it ----------
  const machineStage = $('#machine-stage');
  const mRows = {};
  let mMatch = null;
  function buildMachine() {
    const list = h('div', { class: 'lang-rows' });
    for (const lang of ['en', ...LANGS]) { const r = langRow(lang, { why: lang !== 'en', cap: true }); mRows[lang] = r; list.append(r); }
    machineStage.replaceChildren(list);
    mMatch = wireMatch(machineStage, (roles, t) => {
      const cap = $('#hover-cap'); cap.replaceChildren(...(roles ? ['Showing: ', h('b', {}, roleLabel(roles))] : ['Tap a word']));
      machineStage.querySelectorAll('.row-cap').forEach(c => { c.textContent = ''; });
      if (roles && t) { const rc = t.closest('.lang-row')?.querySelector('.row-cap'); if (rc) rc.textContent = 'Showing: ' + roleLabel(roles); }
    });
    $('#meaning-chips').replaceChildren(...EN.meanings.map(m => h('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', dataset: { id: m.id }, onclick: () => { state.meaning = m.id; state.variant = m.variants[0].id; updateMachine(); } }, m.title)));
    $('#legend').replaceChildren(...[['door', 'verb frame'], ['glue', 'linking word'], ['aux', 'tense, "not" or question word']].map(([r, l]) => h('span', {}, h('i', { style: `background:${roleColor(r)}` }), l)), h('span', {}, h('i', { class: 'x' }), 'no English match'));
    updateMachine(false);
  }
  function updateMachine(animate = true) {
    const m = EN.meanings.find(x => x.id === state.meaning); const v = m.variants.find(x => x.id === state.variant) || m.variants[0]; state.variant = v.id;
    mMatch?.reset();
    $('#meaning-chips').querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.id === m.id ? 'true' : 'false'));
    if (animate) $('#meaning-chips [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('#variant-seg').replaceChildren(...m.variants.map(x => h('button', { type: 'button', 'aria-pressed': x.id === v.id ? 'true' : 'false', onclick: () => { state.variant = x.id; updateMachine(); } }, x.label)));
    $('#variant-hint').textContent = v.hint;
    const M = Object.fromEntries(FW.items.map(i => [i.id, i]));
    $('#recipe').replaceChildren(...m.recipe.map(id => { const it = M[id]; return it ? h('span', { class: 'rid l-' + it.layer, title: id }, it.en) : null; }).filter(Boolean));
    for (const lang of ['en', ...LANGS]) {
      const r = mRows[lang]; const toks = tokensFor(lang, m.id, v.id);
      const why = r.querySelector('.row-why');
      if (!toks) { r.querySelector('.row-tiles').replaceChildren(h('span', { class: 'act-hint' }, 'not written yet')); if (why) why.textContent = ''; continue; }
      fillRow(r, lang, toks, animate);
      if (why) why.textContent = whyFor(lang, m.id, v.id);
    }
    rivers();
  }

  // ---------- 3: word order ----------
  const riverStage = $('#rivers-stage');
  let riverRO, riverPanels = [];
  function rivers() {
    const en = tokensFor('en', state.meaning, state.variant);
    const vert = phone.matches;
    $('#rivers-now').textContent = `Showing: ${en.map(t => t[0]).join(' ')} Change the sentence in section 2.`;
    riverPanels = [];
    const out = [];
    for (const lang of LANGS) {
      const toks = tokensFor(lang, state.meaning, state.variant); if (!toks) continue;
      const rtl = dirOf(lang) === 'rtl';
      const bot = h('div', { class: 'tiles bot', dir: dirOf(lang) }, toks.map(t => tile(lang, t)));
      const botName = rtl ? `${meta(lang).name}, read right to left` : meta(lang).name;
      // for a right-to-left language the English row is laid out right to left too (wide screens only),
      // so the lines compare reading order the same way as for the other languages
      const top = h('div', { class: 'tiles top', dir: rtl && !vert ? 'rtl' : null }, en.map(t => tile('en', t)));
      const topName = rtl && !vert ? `English, laid out right to left to line up with ${meta(lang).name}` : 'English';
      const svg = svgEl('svg'); svg.setAttribute('aria-hidden', 'true');
      const body = vert
        ? h('div', { class: 'river-body' }, svg, h('div', { class: 'lbl top-l' }, topName), h('div', { class: 'lbl bot-l' }, botName), top, bot)
        : h('div', { class: 'river-body' }, svg, h('div', { class: 'lbl' }, topName), top, bot, h('div', { class: 'lbl below' }, botName));
      const count = h('span', { class: 'river-count' });
      const p = h('div', { class: 'river' + (vert ? ' vert' : ''), dataset: { lang } }, h('div', { class: 'river-head' }, h('b', {}, meta(lang).name), count), body);
      out.push(p); riverPanels.push({ svg, top, bot, count, body, vert });
    }
    riverStage.replaceChildren(...out);
    if (!riverStage._wired) { wireMatch(riverStage); riverStage._wired = true; }
    const draw = () => riverPanels.forEach(drawRibbons);
    draw();
    riverRO?.disconnect(); riverRO = new ResizeObserver(draw); riverRO.observe(riverStage);
    document.fonts?.ready.then(draw);
  }
  phone.addEventListener?.('change', () => { if (EN) { rivers(); } });
  function drawRibbons({ svg, top, bot, count, body, vert }) {
    svg.replaceChildren();
    const bb = body.getBoundingClientRect();
    const tops = [...top.querySelectorAll('.tile')], bots = [...bot.querySelectorAll('.tile')];
    const links = [];
    tops.forEach((t, i) => { const tr = t.dataset.roles.split('|'); bots.forEach((b, j) => { const br = b.dataset.roles.split('|'); const shared = tr.find(r => br.includes(r)); if (shared) links.push({ i, j, r: shared, t, b }); }); });
    for (const L of links) {
      const a = L.t.getBoundingClientRect(), c = L.b.getBoundingClientRect();
      let d;
      if (vert) {
        const x1 = a.right - bb.left, y1 = a.top + a.height / 2 - bb.top, x2 = c.left - bb.left, y2 = c.top + c.height / 2 - bb.top, mx = (x1 + x2) / 2;
        d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      } else {
        const x1 = a.left + a.width / 2 - bb.left, y1 = a.bottom - bb.top, x2 = c.left + c.width / 2 - bb.left, y2 = c.top - bb.top, my = (y1 + y2) / 2;
        d = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      }
      svg.append(svgEl('path', { d, class: 'ribbon', stroke: roleColor(L.r), 'data-role': L.r }));
    }
    let cross = 0; for (let a = 0; a < links.length; a++) for (let b = a + 1; b < links.length; b++) { const A = links[a], B = links[b]; if ((A.i - B.i) * (A.j - B.j) < 0) cross++; }
    const added = bots.filter(b => b.dataset.roles.split('|').includes('x')).length;
    count.replaceChildren(...[h('span', { class: 'num' }, cross), h('span', { class: 'lab' }, cross === 1 ? 'crossing' : 'crossings'), added ? h('span', {}, `· ${added} extra word${added === 1 ? '' : 's'}`) : null].filter(Boolean));
  }

  // ---------- 4: tenses ----------
  const words = s => s.split(/\s+/).filter(Boolean);
  function markMask(form, markers) {
    const w = words(form); const mask = w.map(() => false);
    for (const m of markers || []) { const mw = words(m); for (let i = 0; i + mw.length <= w.length; i++) if (mw.every((x, k) => w[i + k] === x)) { for (let k = 0; k < mw.length; k++) mask[i + k] = true; break; } }
    return { w, mask };
  }
  // inline text with marked runs; words are spans so they can slide between cells
  function markedText(form, markers, show) {
    const { w, mask } = markMask(form, markers); const out = []; const seen = {};
    const span = (x) => { seen[x] = (seen[x] || 0) + 1; return h('span', { class: 'tp-w', dataset: { k: `${x}#${seen[x]}` } }, x); };
    for (let i = 0; i < w.length; i++) {
      if (show && mask[i]) { const run = []; while (i < w.length && mask[i]) { run.push(span(w[i])); if (mask[i + 1]) run.push(' '); i++; } i--; out.push(h('mark', {}, run)); }
      else out.push(span(w[i]));
      if (i < w.length - 1) out.push(' ');
    }
    return out;
  }
  // under each cell: how many of the shown languages have a real form, as a count and a small bar
  function realCount(k) {
    const ls = LANGS.filter(l => TURNS.languages[l]);
    const n = ls.filter(l => TURNS.languages[l].cells[k]?.status === 'form').length;
    return h('span', { class: 'tp-count', 'aria-hidden': 'true', title: `${n} of ${ls.length} languages have a real form` },
      h('span', { class: 'tp-bar' }, h('i', { style: `width:${ls.length ? 100 * n / ls.length : 0}%` })),
      h('span', { class: 'n' }, `${n}/${ls.length}`));
  }
  function buildTenses() {
    const grid = $('#tp-grid'); grid.setAttribute('role', 'group');
    const kids = [h('div', { class: 'tp-ch first' })];
    for (const t of TIMES) kids.push(h('div', { class: 'tp-ch' }, TIME_LABEL[t]));
    kids.push(h('div', { class: 'tp-line', 'aria-hidden': 'true' }, h('i')));
    for (const a of ASPECTS) {
      kids.push(h('div', { class: 'tp-rh', 'aria-hidden': 'true' }, h('span', { class: 'l' }, a), h('span', { class: 's' }, { simple: 'S', progressive: 'P', perfect: 'Pf' }[a])));
      for (const t of TIMES) {
        const k = `${t}.${a}`; const en = TURNS.english[k];
        kids.push(h('button', { type: 'button', class: 'tp-cell', 'aria-pressed': 'false', tabindex: -1, dataset: { cell: k }, 'aria-label': `${CELL_NAME(k)}: ${en.form}. ${LANGS.filter(l => TURNS.languages[l]?.cells[k]?.status === 'form').length} of ${LANGS.filter(l => TURNS.languages[l]).length} languages have a real form`, onclick: () => { state.touched = true; selectCell(k); } },
          h('span', { class: 'c' }, h('span', { class: 'long' }, en.form), h('span', { class: 'short' }, en.short)),
          realCount(k)));
      }
    }
    grid.replaceChildren(...kids);
    const rows = $('#tp-rows'); rows.replaceChildren(...LANGS.filter(l => TURNS.languages[l]).map(l => h('div', { class: 'tp-row', dataset: { lang: l } })));
    selectCell(state.cell, false);
    if (grid.dataset.wired) return;
    grid.dataset.wired = '1';
    grid.addEventListener('keydown', e => {
      const map = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }; const d = map[e.key]; if (!d) return;
      e.preventDefault(); const [t, a] = state.cell.split('.');
      const ai = Math.min(2, Math.max(0, ASPECTS.indexOf(a) + d[0])), ti = Math.min(2, Math.max(0, TIMES.indexOf(t) + d[1]));
      state.touched = true; selectCell(`${TIMES[ti]}.${ASPECTS[ai]}`); grid.querySelector('[aria-pressed="true"]')?.focus();
    });
    $('#tp-test').addEventListener('click', e => {
      state.test = !state.test; e.currentTarget.setAttribute('aria-pressed', state.test ? 'true' : 'false');
      $('#tp-test-hint').hidden = !state.test; state.answers = {}; selectCell(state.cell, false);
    });
    // after the section comes into view, move once to past simple so the first thing seen is a highlight
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); setTimeout(() => { if (!state.touched && state.cell === 'present.simple') selectCell('past.simple'); }, 600); } }, { threshold: .3 });
    io.observe($('#time'));
  }
  function selectCell(cell, animate = true) {
    if (cell !== state.cell) state.answers = {};
    state.cell = cell;
    const base = cell === 'present.simple';
    $('#tp-grid').querySelectorAll('.tp-cell').forEach(b => { const on = b.dataset.cell === cell; b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    const en = TURNS.english[cell];
    const hint = base ? 'Pick a cell. Highlighted words are the ones that carry the tense.'
      : state.test ? 'Tap the word you think carries the tense in each language.'
      : 'The highlighted words carry the tense, compared with "I go".';
    $('#tp-head').replaceChildren(h('p', { class: 'eyebrow' }, CELL_NAME(cell).replace(' ', ' · ')), h('div', { class: 'en' }, markedText(en.form, en.marker, true)), h('p', { class: 'hint' }, hint));
    $('#tp-now-phone').replaceChildren(h('span', {}, markedText(en.form, en.marker, true)), h('span', { class: 'eyebrow' }, CELL_NAME(cell)));
    $('#tp-rows').querySelectorAll('.tp-row').forEach(r => drawTenseRow(r, animate));
  }
  function drawTenseRow(r, animate) {
    const lang = r.dataset.lang; const L = TURNS.languages[lang]; const c = L.cells[state.cell]; const m = meta(lang);
    const base = state.cell === 'present.simple';
    const ans = state.answers[lang];
    const quiz = state.test && !base && !ans;
    const showMarks = !quiz;
    const before = {};
    if (animate && !reduce) r.querySelectorAll('.tp-sent .tp-w').forEach(el => { before[el.dataset.k] = el.getBoundingClientRect(); });
    const sent = h('div', { class: 'tp-sent', lang, dir: m.rtl ? 'rtl' : null, dataset: { script: m.script } });
    if (quiz) {
      const { w, mask } = markMask(c.form, c.marker);
      w.forEach((x, i) => { sent.append(h('button', { type: 'button', class: 'tp-w', onclick: () => { state.answers[lang] = { i, ok: mask[i] }; drawTenseRow(r, false); r.querySelector('.tp-fb')?.focus(); } }, x)); if (i < w.length - 1) sent.append(' '); });
    } else sent.append(...markedText(c.form, base ? [] : c.marker, showMarks));
    if (ans && !ans.ok) { const el = sent.querySelectorAll('.tp-w')[ans.i]; if (el && !el.closest('mark')) el.classList.add('wrong'); }
    const others = Object.entries(L.cells).filter(([k, x]) => k !== state.cell && x.form === c.form).map(([k]) => CELL_NAME(k));
    const note = h('p', { class: 'tp-note' }, c.note);
    const more = c.note && c.note.length > 70 ? h('button', { type: 'button', class: 'linkish tp-more', 'aria-expanded': 'false', onclick: e => { const o = note.classList.toggle('open'); e.currentTarget.textContent = o ? 'less' : 'more'; e.currentTarget.setAttribute('aria-expanded', o ? 'true' : 'false'); } }, 'more') : null;
    const altLabel = c.altLabel || 'also';
    r.replaceChildren(
      h('div', { class: 'tp-lang' }, h('b', {}, m.name), m.native !== m.name ? h('span', { lang, dir: m.rtl ? 'rtl' : null, dataset: { script: m.script } }, m.native) : null),
      h('div', { class: 'tp-body' },
        quiz ? h('p', { class: 'tp-q' }, 'Which word carries the tense? Tap it.') : null,
        sent,
        c.translit ? h('div', { class: 'tp-trl' }, markedText(c.translit, base || quiz ? [] : c.markerTr, true)) : null,
        ans ? h('p', { class: 'tp-fb ' + (ans.ok ? 'ok' : 'no'), tabindex: -1 }, ans.ok ? 'Yes.' : `Not quite: it's ${c.marker.join(' + ')}.`) : null,
        c.alt && !quiz ? h('div', { class: 'tp-alt' }, `${altLabel}: `, h('span', { lang, dataset: { script: m.script }, class: 't' }, c.alt), c.altTranslit ? h('span', { class: 'tp-trl' }, ` ${c.altTranslit}`) : null) : null,
        !quiz ? h('div', { class: 'tp-meta' },
          c.status === 'periphrasis' ? h('span', { class: 'badge' }, 'workaround') : c.status === 'none' ? h('span', { class: 'badge none' }, 'no such form') : null,
          others.length ? h('span', { class: 'tp-same' }, `Same form as ${others.join(' and ')}.`) : null) : null,
        !quiz && c.note ? h('div', { class: 'tp-noteline' }, note, more) : null));
    if (animate && !reduce) {
      r.querySelectorAll('.tp-sent .tp-w').forEach(el => {
        const f = before[el.dataset.k]; const l = el.getBoundingClientRect();
        if (f) { const dx = f.left - l.left, dy = f.top - l.top; if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
        else el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      });
      r.querySelectorAll('.tp-sent mark').forEach(el => el.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 200 }));
    }
  }

  // ---------- the parts ----------
  const PORT = { function: 'Same in every language', door: 'Same list, different words', turn: 'Different in every language', glue: 'Same list, different words and word order', slot: 'Different in every language', chunk: 'Different in every language', lexicon: 'Different in every language', sound: 'Different in every language' };
  function parts() {
    $('#stack').replaceChildren(...FW.layers.map(layer => h('div', { class: `band l-${layer.id}` }, h('b', {}, layer.name), h('span', {}, layer.desc), h('span', { class: 'port' }, PORT[layer.id] || ''))));
  }

  // ---------- boot ----------
  function orderLangs() {
    const all = FW.languages.map(l => l.id);
    const mine = DG.langs().filter(l => all.includes(l));
    return [...mine, ...all.filter(l => !mine.includes(l))];
  }
  async function boot() {
    try {
      [FW, EN, TURNS] = await Promise.all([framework(), getJSON('data/sentences/en.json'), getJSON('data/turns.json')]);
      LANGS = orderLangs();
      await Promise.all(LANGS.map(async l => { SENT[l] = await getJSON(`data/sentences/${l}.json`); }));
    } catch (e) {
      $('#one-stage').replaceChildren(h('div', { class: 'banner load-err' }, `Couldn't load the sentences (${e.message}).`, h('button', { type: 'button', class: 'btn small-btn', onclick: boot }, 'Retry')));
      return;
    }
    const solo = new URLSearchParams(location.search).get('act');
    if (solo) { const id = { prism: 'one', coda: 'next' }[solo] || solo; document.querySelectorAll('main > section').forEach(s => { s.hidden = s.id !== id; }); }
    else renderToday();
    buildMachine();
    buildTenses();
    parts();
    const seen = DG.load(DG.KEYS.prismSeen, 0);
    one(!seen && !DG.hasHistory());
    if (location.hash.length > 1) { const t = document.querySelector(location.hash); if (t) { document.documentElement.style.scrollBehavior = 'auto'; t.scrollIntoView(); requestAnimationFrame(() => { document.documentElement.style.scrollBehavior = ''; }); } }
    onScroll();
  }
  DG.on(what => {
    if (!FW) return;
    if (what === 'langs' || what === 'langs-closed') { LANGS = orderLangs(); Promise.all(LANGS.filter(l => !SENT[l]).map(async l => { SENT[l] = await getJSON(`data/sentences/${l}.json`); })).then(() => { renderToday(); one(false); buildMachine(); buildTenses(); }); }
    if (what === 'reset' || what === 'newPerDay') renderToday();
  });
  boot();
})();
