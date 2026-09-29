/* Prism: an interactive look at one meaning in five languages. No build step. */
(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v); else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
    return el;
  };
  const svgEl = (tag, attrs = {}) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ROLE_PRI = ['door', 'door2', 'glue', 'neg', 'q', 'aux', 'x'];
  const ROLE_CLASS = { door: 'r-door', door2: 'r-door', glue: 'r-glue', neg: 'r-neg', q: 'r-q', aux: 'r-aux', x: 'r-x' };
  const ROLE_COLOR = { door: 'var(--door)', door2: 'var(--door)', glue: 'var(--glue)', neg: 'var(--neg)', q: 'var(--q)', aux: 'var(--aux)', x: 'var(--x)' };

  let FW, EN, LANGS = [], SENT = {}, DATA = {};
  const state = { meaning: 'decline', variant: 'now', cell: 'present.simple', prevCell: null };

  async function getJSON(p) { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p); return r.json(); }
  const meta = id => FW.languages.find(l => l.id === id);
  const roleClass = roles => { for (const r of ROLE_PRI) if (roles.includes(r)) return ROLE_CLASS[r]; return 'r-core'; };
  const roleColor = roles => { for (const r of ROLE_PRI) if (roles.includes(r)) return ROLE_COLOR[r]; return 'var(--core)'; };
  const roleLabel = roles => roles.map(r => EN.roles[r] || r).join(' + ');
  const variantOf = (mid, vid) => EN.meanings.find(m => m.id === mid)?.variants.find(v => v.id === vid);
  const tokensFor = (lang, mid, vid) => lang === 'en' ? variantOf(mid, vid)?.tokens.map(t => [t[0], t[1]]) : SENT[lang]?.variants?.[`${mid}.${vid}`]?.tokens;
  const whyFor = (lang, mid, vid) => SENT[lang]?.variants?.[`${mid}.${vid}`]?.why || '';

  // ---------- tiles ----------
  function tile(lang, tok, opts = {}) {
    const [text, rolesStr, tr] = tok; const roles = rolesStr.split('|');
    const el = h('span', { class: 'tile ' + roleClass(roles) + (lang === 'en' ? ' en' : ''), dataset: { roles: rolesStr, key: opts.key || '', script: lang === 'en' ? 'latin' : meta(lang).script }, lang: lang === 'en' ? 'en' : lang },
      h('span', { class: 'role' }, roleLabel(roles)), text, tr ? h('span', { class: 'tr' }, tr) : null);
    return el;
  }
  // stable keys so the same role instance animates between variants
  function keyed(tokens) { const seen = {}; return tokens.map(t => { const k = t[1]; seen[k] = (seen[k] || 0) + 1; return { tok: t, key: `${k}#${seen[k]}` }; }); }

  function fillRow(rowTiles, lang, tokens, animate = true) {
    const first = {};
    if (animate && !reduce) for (const el of rowTiles.children) first[el.dataset.key] = el.getBoundingClientRect();
    const fresh = keyed(tokens).map(({ tok, key }) => tile(lang, tok, { key }));
    rowTiles.replaceChildren(...fresh);
    if (!animate || reduce) return;
    for (const el of fresh) {
      const f = first[el.dataset.key]; const l = el.getBoundingClientRect();
      if (f) {
        const dx = f.left - l.left, dy = f.top - l.top;
        if (Math.abs(dx) + Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else {
        el.animate([{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 120, easing: 'ease-out', fill: 'backwards' });
      }
    }
  }

  // hover alignment across all rows in a container
  function wireHover(container, onRoles) {
    const enter = t => { container.querySelectorAll('.tile.hovered').forEach(x => x.classList.remove('hovered')); t.classList.add('hovered'); const roles = t.dataset.roles.split('|'); light(container, roles); onRoles?.(roles); };
    const leave = () => { container.querySelectorAll('.tile.hovered').forEach(x => x.classList.remove('hovered')); light(container, null); onRoles?.(null); };
    container.addEventListener('mouseover', e => { const t = e.target.closest('.tile'); if (t) enter(t); });
    container.addEventListener('mouseleave', leave);
    container.addEventListener('focusin', e => { const t = e.target.closest('.tile'); if (t) enter(t); });
    container.addEventListener('focusout', e => { if (!container.contains(e.relatedTarget)) leave(); });
  }
  function light(container, roles) {
    container.querySelectorAll('.row, .river-body').forEach(r => r.classList.toggle('dimming', !!roles));
    container.querySelectorAll('.tile').forEach(el => { const mine = el.dataset.roles.split('|'); el.classList.toggle('lit', !!roles && mine.some(r => roles.includes(r))); });
    container.querySelectorAll('.ribbon').forEach(el => el.classList.toggle('lit', !!roles && roles.includes(el.dataset.role)));
  }

  function row(lang, extra = {}) {
    const m = lang === 'en' ? { name: 'English', native: '' } : meta(lang);
    return h('div', { class: 'row' + (lang === 'en' ? ' en' : ''), dataset: { lang } },
      h('div', { class: 'row-name' }, h('b', {}, m.name), m.native ? h('span', {}, m.native) : null),
      h('div', { class: 'row-tiles' }),
      extra.why !== false ? h('div', { class: 'row-why' }) : null);
  }

  // ---------- ACT I: prism ----------
  function prism() {
    const stage = $('#prism-stage'); stage.innerHTML = '';
    const mid = 'decline', vid = 'now';
    const enRow = row('en', { why: false }); stage.append(enRow);
    fillRow(enRow.querySelector('.row-tiles'), 'en', tokensFor('en', mid, vid), false);
    requestAnimationFrame(() => enRow.classList.add('in'));
    const rows = LANGS.filter(l => tokensFor(l, mid, vid)).map(l => { const r = row(l, { why: false }); stage.append(r); return r; });
    rows.forEach((r, i) => {
      const lang = r.dataset.lang; const tokens = tokensFor(lang, mid, vid);
      setTimeout(() => {
        r.classList.add('in');
        const tilesEl = r.querySelector('.row-tiles');
        fillRow(tilesEl, lang, tokens, false);
        if (reduce) return;
        // fly ghosts from the English tile of the same role
        const enTiles = [...enRow.querySelectorAll('.tile')];
        [...tilesEl.children].forEach((el, j) => {
          const roles = el.dataset.roles.split('|');
          const src = enTiles.find(t => t.dataset.roles.split('|').some(x => roles.includes(x)));
          el.style.opacity = '0';
          const l = el.getBoundingClientRect();
          const f = (src || enTiles[Math.min(j, enTiles.length - 1)]).getBoundingClientRect();
          const ghost = el.cloneNode(true); ghost.classList.add('ghost-tile'); ghost.style.opacity = '1';
          Object.assign(ghost.style, { position: 'fixed', left: f.left + 'px', top: f.top + 'px', margin: 0, width: f.width + 'px', height: f.height + 'px' });
          document.body.append(ghost);
          const a = ghost.animate([{ transform: 'none', opacity: .9 }, { transform: `translate(${l.left - f.left}px,${l.top - f.top}px)`, width: l.width + 'px', height: l.height + 'px', opacity: 1 }], { duration: 900 + j * 40, delay: j * 45, easing: 'cubic-bezier(.3,.7,.1,1)', fill: 'forwards' });
          a.onfinish = () => { ghost.remove(); el.style.opacity = ''; };
        });
      }, 700 + i * 520);
    });
  }
  $('#prism-replay').addEventListener('click', prism);

  // ---------- ACT II: machine ----------
  const machineStage = $('#machine-stage');
  const rowsByLang = {};
  function buildMachine() {
    machineStage.innerHTML = '';
    const rows = h('div', { class: 'rows' });
    for (const lang of ['en', ...LANGS]) { const r = row(lang, { why: lang !== 'en' }); rowsByLang[lang] = r; rows.append(r); }
    machineStage.append(rows);
    wireHover(machineStage, roles => { const cap = $('#hover-cap'); cap.innerHTML = ''; if (roles) cap.append('lit: ', h('b', {}, roleLabel(roles))); else cap.textContent = 'hover a word'; });
    const mc = $('#meaning-chips'); mc.replaceChildren(...EN.meanings.map(m => h('button', { type: 'button', class: 'chip' + (m.id === state.meaning ? ' active' : ''), onclick: () => { state.meaning = m.id; state.variant = m.variants[0].id; updateMachine(); } }, m.title)));
    $('#legend').replaceChildren(...[['door', 'door'], ['glue', 'glue'], ['aux', 'tense carrier'], ['neg', 'negation'], ['q', 'question'], ['x', 'added by the language']].map(([r, l]) => h('span', {}, h('i', { style: `background:${ROLE_COLOR[r]}` }), l)));
    updateMachine(false);
  }
  function updateMachine(animate = true) {
    const m = EN.meanings.find(x => x.id === state.meaning); const v = m.variants.find(x => x.id === state.variant) || m.variants[0]; state.variant = v.id;
    $('#meaning-chips').querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('active', EN.meanings[i].id === m.id));
    $('#variant-chips').replaceChildren(...m.variants.map(x => h('button', { type: 'button', class: 'chip v' + (x.id === v.id ? ' active' : ''), onclick: () => { state.variant = x.id; updateMachine(); } }, x.label)));
    $('#variant-hint').textContent = v.hint;
    $('#recipe').replaceChildren(h('span', { class: 'rid fn' }, m.function), ...m.recipe.map(id => h('span', { class: 'rid ' + (id.startsWith('D-') ? 'door' : id.startsWith('G-') ? 'glue' : 'turn') }, id)));
    for (const lang of ['en', ...LANGS]) {
      const r = rowsByLang[lang]; const toks = tokensFor(lang, m.id, v.id);
      const tilesEl = r.querySelector('.row-tiles'); const why = r.querySelector('.row-why');
      if (!toks) { tilesEl.replaceChildren(h('span', { class: 'hint' }, 'not written yet')); if (why) why.textContent = ''; continue; }
      fillRow(tilesEl, lang, toks, animate);
      if (why) why.textContent = whyFor(lang, m.id, v.id);
    }
    rivers();
    $('#coda-strip').replaceChildren(h('span', { class: 'rid fn' }, m.function), ...m.recipe.map(id => h('span', { class: 'rid ' + (id.startsWith('D-') ? 'door' : id.startsWith('G-') ? 'glue' : 'turn') }, id)));
  }

  // ---------- ACT III: rivers ----------
  const riverStage = $('#rivers-stage');
  let riverRO;
  function rivers() {
    riverStage.innerHTML = '';
    const en = tokensFor('en', state.meaning, state.variant);
    const panels = [];
    for (const lang of LANGS) {
      const toks = tokensFor(lang, state.meaning, state.variant); if (!toks) continue;
      const top = h('div', { class: 'tiles top' }, h('span', { class: 'lbl', style: 'top:-14px' }, 'English'), ...en.map(t => tile('en', t)));
      const bot = h('div', { class: 'tiles bot' }, h('span', { class: 'lbl', style: 'top:-14px' }, meta(lang).name), ...toks.map(t => tile(lang, t)));
      const svg = svgEl('svg'); const body = h('div', { class: 'river-body' }, svg, top, bot);
      const meter = h('span', { class: 'meter' }, h('i'), h('span', { class: 'n' }, ''));
      const p = h('div', { class: 'river' }, h('div', { class: 'river-head' }, h('b', {}, meta(lang).name), meter), body);
      riverStage.append(p); panels.push({ p, svg, top, bot, meter, body });
    }
    wireHover(riverStage);
    const draw = () => panels.forEach(drawRibbons);
    draw();
    riverRO?.disconnect(); riverRO = new ResizeObserver(draw); riverRO.observe(riverStage);
    document.fonts?.ready.then(draw);
  }
  function drawRibbons({ svg, top, bot, meter, body }) {
    svg.replaceChildren();
    const bb = body.getBoundingClientRect();
    const tops = [...top.querySelectorAll('.tile')], bots = [...bot.querySelectorAll('.tile')];
    const links = [];
    tops.forEach((t, i) => { const tr = t.dataset.roles.split('|'); bots.forEach((b, j) => { const br = b.dataset.roles.split('|'); const shared = tr.find(r => br.includes(r)); if (shared) links.push({ i, j, r: shared, t, b }); }); });
    for (const L of links) {
      const a = L.t.getBoundingClientRect(), c = L.b.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - bb.left, y1 = a.bottom - bb.top, x2 = c.left + c.width / 2 - bb.left, y2 = c.top - bb.top;
      const path = svgEl('path', { d: `M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`, class: 'ribbon', stroke: roleColor([L.r]), 'data-role': L.r });
      svg.append(path);
    }
    let cross = 0; for (let a = 0; a < links.length; a++) for (let b = a + 1; b < links.length; b++) { const A = links[a], B = links[b]; if ((A.i - B.i) * (A.j - B.j) < 0) cross++; }
    const added = bots.filter(b => b.dataset.roles.split('|').includes('x')).length;
    const max = Math.max(1, links.length * (links.length - 1) / 4);
    meter.querySelector('i').style.setProperty('--w', Math.min(100, 100 * cross / max) + '%');
    meter.querySelector('.n').textContent = `${cross} crossing${cross === 1 ? '' : 's'}${added ? ` · ${added} added` : ''}`;
  }

  // ---------- ACT IV: time dial ----------
  const TIMES = ['past', 'present', 'future'], ASPECTS = ['simple', 'progressive', 'perfect'];
  function buildDial() {
    const svg = $('#dial'); svg.replaceChildren();
    const cx = 160, cy = 160; const rings = [[46, 82], [86, 122], [126, 158]]; // simple inner, progressive, perfect outer
    const sectors = [[210, 330], [330, 450], [90, 210]]; // past left, present top, future right (degrees, clockwise from +x)
    const pol = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    TIMES.forEach((t, ti) => ASPECTS.forEach((a, ai) => {
      const [r0, r1] = rings[ai]; const [d0, d1] = sectors[ti];
      const [x0, y0] = pol(r1, d0), [x1, y1] = pol(r1, d1), [x2, y2] = pol(r0, d1), [x3, y3] = pol(r0, d0);
      const seg = svgEl('path', { d: `M${x0},${y0} A${r1},${r1} 0 0 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 0 0 ${x3},${y3} Z`, class: 'seg', 'data-cell': `${t}.${a}`, role: 'button', tabindex: 0, 'aria-label': `${t} ${a}` });
      seg.addEventListener('click', () => selectCell(`${t}.${a}`));
      seg.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCell(`${t}.${a}`); } });
      svg.append(seg);
    }));
    // labels
    const lab = (txt, x, y, cls = 'dial-txt', anchor = 'middle') => { const t = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }); t.textContent = txt; svg.append(t); };
    lab('past', 48, 300); lab('present', 160, 14); lab('future', 272, 300);
    lab('GO', cx, cy + 5, 'dial-txt big');
    lab('simple', cx, cy + 74, 'dial-txt'); lab('progressive', cx, cy + 112, 'dial-txt'); lab('perfect', cx, cy + 148, 'dial-txt');
    buildTimeRows(); selectCell(state.cell, false);
  }
  const timeRows = {};
  function buildTimeRows() {
    const st = $('#time-stage'); st.innerHTML = '';
    const rows = h('div', { class: 'rows' });
    for (const lang of LANGS) { if (!DATA[lang]) continue; const r = row(lang); r.append(h('div', { class: 'meter' }, h('i'), h('span', { class: 'n' }))); timeRows[lang] = r; rows.append(r); }
    st.append(rows);
  }
  const splitForm = f => f.split(/\s+/).filter(Boolean);
  function selectCell(cell, animate = true) {
    state.prevCell = state.cell; state.cell = cell;
    document.querySelectorAll('#dial .seg').forEach(s => s.classList.toggle('active', s.dataset.cell === cell));
    const [t, a] = cell.split('.');
    $('#dial-caption').textContent = `${t} · ${a}. Lit words are the ones that changed from the previous cell.`;
    for (const lang of LANGS) {
      const r = timeRows[lang]; if (!r) continue;
      const grid = DATA[lang].turnGrid || [];
      const cur = grid.find(c => `${c.time}.${c.aspect}` === cell) || {};
      const prev = grid.find(c => `${c.time}.${c.aspect}` === state.prevCell) || cur;
      const curT = splitForm(cur.form || ''), prevT = new Set(splitForm(prev.form || '').map(w => w.replace(/[.,!?]/g, '')));
      const tilesEl = r.querySelector('.row-tiles');
      const els = curT.map(w => { if (w === '/') return h('span', { class: 'tile sep', dataset: { roles: 'x', script: 'latin' } }, '/'); const same = prevT.has(w.replace(/[.,!?]/g, '')); return h('span', { class: 'tile ' + (animate && state.prevCell !== cell ? (same ? 'same' : 'changed') : ''), dataset: { roles: 'aux', script: meta(lang).script }, lang }, w); });
      tilesEl.replaceChildren(...els);
      if (cur.translit) tilesEl.append(h('span', { class: 'hint', style: 'flex-basis:100%' }, cur.translit));
      const changed = els.filter(e => e.classList.contains('changed')).length; const nWords = els.filter(e => !e.classList.contains('sep')).length;
      r.querySelector('.row-why').innerHTML = ''; r.querySelector('.row-why').append(h('b', {}, cur.gloss || ''), ' ', cur.note || '');
      const m = r.querySelector('.meter'); m.querySelector('i').style.setProperty('--w', (nWords ? 100 * changed / nWords : 0) + '%'); m.querySelector('.n').textContent = animate && state.prevCell !== cell ? `${changed} of ${nWords} words changed` : `${nWords} words`;
      if (animate && !reduce) els.forEach((e, i) => e.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: e.classList.contains('same') ? .32 : 1, transform: 'none' }], { duration: 380, delay: i * 30, easing: 'ease-out', fill: 'backwards' }));
    }
  }

  // ---------- boot ----------
  (async () => {
    try {
      [FW, EN] = await Promise.all([getJSON('data/framework.json'), getJSON('data/sentences/en.json')]);
      LANGS = FW.languages.filter(l => l.full !== false).map(l => l.id);
      await Promise.all(LANGS.map(async l => {
        try { SENT[l] = await getJSON(`data/sentences/${l}.json`); } catch { SENT[l] = null; }
        try { DATA[l] = await getJSON(`data/${l}.json`); } catch { DATA[l] = null; }
      }));
    } catch (e) { $('#prism-stage').textContent = 'Could not load data: ' + e.message; return; }
    const solo = new URLSearchParams(location.search).get('act');
    if (solo) document.querySelectorAll('.act').forEach(a => { a.hidden = a.id !== solo; });
    buildMachine();
    buildDial();
    prism();
    if (location.hash.length > 1) { const t = document.querySelector(location.hash); if (t) { document.documentElement.style.scrollBehavior = 'auto'; t.scrollIntoView(); requestAnimationFrame(() => document.documentElement.style.scrollBehavior = ''); } }
  })();
})();
