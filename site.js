/* Igloo: shared by the homepage and the app. Prefs, theme, site bar, settings, languages sheet,
   data loading and the review counters the Today panel and Drill both read. No build step. */
(() => {
  'use strict';
  const V = '20260929b';   // bump when data files change; replaces cache:'no-cache'
  const KEYS = {
    prefs: 'doors.prefs.v2', srs: 'doors.srs.v1', progress: 'doors.progress.v1', apikey: 'doors.apikey',
    days: 'doors.days.v1', today: 'doors.today.v1', prismSeen: 'doors.prismSeen',
  };
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode */ } };
  const $ = (sel, el = document) => el.querySelector(sel);
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
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
  const dayNow = () => Math.floor(Date.now() / 86400000);

  const ICON = {
    theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M12 3.75a8.25 8.25 0 0 1 0 16.5z" fill="currentColor"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7L5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-2"/></svg>',
    down: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10l5 5 5-5"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };
  const CODES = { khasi: 'KH', german: 'DE', hindi: 'HI', french: 'FR', swissgerman: 'CH', bengali: 'BN', spanish: 'ES', italian: 'IT', portuguese: 'PT', arabic: 'AR' };
  const DEFAULT_LANGS = ['german', 'khasi', 'hindi', 'french', 'swissgerman'];

  let prefs = load(KEYS.prefs, {});
  const srs = load(KEYS.srs, {});
  const listeners = [];
  const emit = what => listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });
  const savePrefs = () => save(KEYS.prefs, prefs);

  // ---------- data ----------
  async function getJSON(path) {
    const r = await fetch(path + (path.includes('?') ? '&' : '?') + 'v=' + V);
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.json();
  }
  let fwPromise = null;
  const framework = () => fwPromise || (fwPromise = getJSON('data/framework.json').catch(e => { fwPromise = null; throw e; }));

  // ---------- languages: the user's ordered list; the first is primary ----------
  const KNOWN = Object.keys(CODES);
  function langs() {
    const list = (Array.isArray(prefs.langs) ? prefs.langs : []).filter((id, i, a) => KNOWN.includes(id) && a.indexOf(id) === i);
    return list.length ? list : DEFAULT_LANGS.slice();
  }
  function setLangs(list) { prefs.langs = list.slice(); savePrefs(); emit('langs'); }
  const hasChosenLangs = () => Array.isArray(prefs.langs) && prefs.langs.length > 0;

  // ---------- theme ----------
  function applyTheme() {
    const t = prefs.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
    const b = $('#theme-btn'); if (b) b.setAttribute('aria-pressed', t === 'dark' ? 'true' : 'false');
    const c = $('#set-dark'); if (c) c.checked = t === 'dark';
  }
  function setTheme(t) { prefs.theme = t; savePrefs(); applyTheme(); emit('theme'); }
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (!prefs.theme) { applyTheme(); emit('theme'); } });

  // ---------- review counters ----------
  function saveSrs() { save(KEYS.srs, srs); }
  function logDay() {
    const days = load(KEYS.days, []); const d = dayNow();
    if (!days.includes(d)) { days.push(d); days.sort((a, b) => a - b); save(KEYS.days, days.slice(-800)); }
  }
  function streak() {
    const days = new Set(load(KEYS.days, []));
    for (const s of Object.values(srs)) if (s && s.last) days.add(s.last);
    let d = dayNow(); if (!days.has(d)) d--; let n = 0; while (days.has(d)) { n++; d--; } return n;
  }
  function todayLog() {
    const t = load(KEYS.today, null);
    return t && t.day === dayNow() ? t : { day: dayNow(), new: {} };
  }
  function countNew(lang, delta) {
    const t = todayLog(); t.new[lang] = Math.max(0, (t.new[lang] || 0) + delta); save(KEYS.today, t);
  }
  const newPerDay = () => (Number.isFinite(prefs.newPerDay) ? prefs.newPerDay : 10);
  function newLeft(lang) { return Math.max(0, newPerDay() - (todayLog().new[lang] || 0)); }
  // due reviews per language, straight from the srs keys (whatever level or card type they came from)
  function dueByLang(list = langs(), day = dayNow()) {
    const out = Object.fromEntries(list.map(l => [l, 0]));
    for (const [k, s] of Object.entries(srs)) {
      const l = k.slice(0, k.indexOf('|'));
      if (l in out && s && s.reps && s.due <= day) out[l]++;
    }
    return out;
  }
  const hasHistory = () => Object.keys(srs).length > 0;

  // ---------- live region ----------
  let live = null;
  function announce(text) {
    if (!live) { live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' }); document.body.append(live); }
    live.textContent = ''; setTimeout(() => { live.textContent = text; }, 30);
  }

  // ---------- site bar ----------
  function initBar(current) {
    document.querySelectorAll('.views a[data-view]').forEach(a => {
      if (a.dataset.view === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const tb = $('#theme-btn');
    if (tb && !tb.dataset.wired) {
      tb.dataset.wired = '1'; tb.innerHTML = ICON.theme;
      tb.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    }
    const sb = $('#settings-btn');
    if (sb && !sb.dataset.wired) { sb.dataset.wired = '1'; sb.innerHTML = ICON.settings; sb.addEventListener('click', openSettings); }
    applyTheme();
  }

  // ---------- languages sheet ----------
  let sheet = null;
  async function openLangSheet() {
    const FW = await framework();
    if (!sheet) {
      sheet = h('dialog', { class: 'dlg sheet', 'aria-labelledby': 'lang-sheet-title' });
      sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });
      sheet.addEventListener('close', () => { emit('langs-closed'); (sheet._opener || $('#settings-btn'))?.focus?.(); });
      document.body.append(sheet);
    }
    sheet._opener = document.activeElement;
    const draw = () => {
      const mine = langs();
      const meta = id => FW.languages.find(l => l.id === id);
      const item = (id, on, i) => {
        const m = meta(id); if (!m) return null;
        const box = h('input', { type: 'checkbox', checked: on, 'aria-label': m.name });
        box.addEventListener('change', () => {
          let next = mine.slice();
          if (box.checked) next.push(id); else next = next.filter(x => x !== id);
          if (!next.length) { box.checked = true; return; }
          setLangs(next); draw();
          sheet.querySelector(`input[aria-label="${m.name}"]`)?.focus();
        });
        const move = d => { const next = mine.slice(); const j = i + d; [next[i], next[j]] = [next[j], next[i]]; setLangs(next); draw(); sheet.querySelector(`[data-mv="${id}${d}"]`)?.focus(); };
        return h('div', { class: 'lang-item' },
          h('label', {}, box, h('span', {}, h('span', {}, m.name), ' ', h('span', { class: 'nat' }, m.native), on && i === 0 ? h('span', { class: 'prim' }, 'first') : null)),
          h('span'),
          on ? h('div', { class: 'ord' },
            h('button', { type: 'button', 'aria-label': `Move ${m.name} up`, disabled: i === 0, dataset: { mv: id + '-1' }, onclick: () => move(-1) }, '↑'),
            h('button', { type: 'button', 'aria-label': `Move ${m.name} down`, disabled: i === mine.length - 1, dataset: { mv: id + '1' }, onclick: () => move(1) }, '↓')) : h('span'));
      };
      const others = FW.languages.filter(l => !mine.includes(l.id));
      sheet.replaceChildren(h('div', { class: 'dlg-body' },
        h('div', { class: 'dlg-head' }, h('h2', { id: 'lang-sheet-title', style: 'font-size:20px' }, 'My languages'),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', html: ICON.close, onclick: () => sheet.close() })),
        h('p', { class: 'small muted' }, 'The first language gets new cards first and leads each round in Drill.'),
        h('div', { class: 'lang-list' }, mine.map((id, i) => item(id, true, i))),
        others.filter(l => l.full).length ? h('div', { class: 'sheet-group' }, 'Add') : null,
        h('div', { class: 'lang-list' }, others.filter(l => l.full).map(l => item(l.id, false, -1))),
        others.filter(l => !l.full).length ? h('div', { class: 'sheet-group' }, 'Phrases only for now') : null,
        h('div', { class: 'lang-list' }, others.filter(l => !l.full).map(l => item(l.id, false, -1))),
        h('div', { class: 'dlg-row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => sheet.close() }, 'Done'))));
    };
    draw();
    if (!sheet.open) sheet.showModal();
  }
  function langButton() {
    const list = langs();
    return h('button', { type: 'button', class: 'lang-btn', 'aria-haspopup': 'dialog', onclick: openLangSheet, title: 'Choose and order your languages' },
      h('span', {}, 'Languages'), h('span', { class: 'codes' }, list.map(l => CODES[l]).join(' ')), h('span', { html: ICON.down, style: 'width:14px;height:14px;display:inline-flex' }));
  }

  // ---------- settings ----------
  let settings = null;
  function openSettings() {
    if (!settings) {
      settings = h('dialog', { class: 'dlg', 'aria-labelledby': 'settings-title' });
      settings.addEventListener('click', e => { if (e.target === settings) settings.close(); });
      settings.addEventListener('close', () => { $('#settings-btn')?.focus(); });
      document.body.append(settings);
    }
    const key = h('input', { id: 'api-key', type: 'password', autocomplete: 'off', placeholder: 'sk-ant-...' });
    try { key.value = localStorage.getItem(KEYS.apikey) || ''; } catch {}
    const saveKey = () => { const v = key.value.trim(); try { v ? localStorage.setItem(KEYS.apikey, v) : localStorage.removeItem(KEYS.apikey); } catch {} emit('apikey'); };
    key.addEventListener('change', saveKey);
    const perDay = h('select', { class: 'field-sel', id: 'set-new', onchange: e => { prefs.newPerDay = +e.target.value; savePrefs(); emit('newPerDay'); } },
      [0, 5, 10, 15, 20, 30].map(n => h('option', { value: n, selected: n === newPerDay() }, String(n))));
    const confirmBox = h('div', { class: 'confirm', hidden: true },
      h('p', {}, 'Delete every review and writing score in this browser? This can\'t be undone.'),
      h('div', { class: 'dlg-row' },
        h('button', { type: 'button', class: 'btn danger primary', onclick: () => {
          for (const k of Object.keys(srs)) delete srs[k];
          saveSrs(); save(KEYS.progress, {}); save(KEYS.days, []); save(KEYS.today, null);
          confirmBox.hidden = true; delBtn.hidden = false; emit('reset'); announce('All progress deleted');
        } }, 'Delete'),
        h('button', { type: 'button', class: 'btn', onclick: () => { confirmBox.hidden = true; delBtn.hidden = false; delBtn.focus(); } }, 'Cancel')));
    const delBtn = h('button', { type: 'button', class: 'btn danger', onclick: () => { confirmBox.hidden = false; delBtn.hidden = true; confirmBox.querySelector('.btn:last-child').focus(); } }, 'Delete all progress…');
    const langLine = h('span', { class: 'muted small' });
    const refreshLangs = () => framework().then(FW => { langLine.textContent = langs().map(id => FW.languages.find(l => l.id === id)?.name || id).join(', '); }).catch(() => {});
    refreshLangs();
    settings.replaceChildren(h('div', { class: 'dlg-body' },
      h('div', { class: 'dlg-head' }, h('h2', { id: 'settings-title', style: 'font-size:22px' }, 'Settings'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', html: ICON.close, onclick: () => settings.close() })),
      h('p', { class: 'small muted' }, 'Saved in this browser only.'),
      h('div', { class: 'dlg-sec' }, h('h3', {}, 'My languages'),
        h('div', { class: 'dlg-row' }, langLine, h('button', { type: 'button', class: 'btn small-btn', onclick: () => { openLangSheet(); const once = w => { if (w === 'langs-closed') { refreshLangs(); listeners.splice(listeners.indexOf(once), 1); } }; listeners.push(once); } }, 'Change'))),
      h('div', { class: 'dlg-sec' }, h('h3', {}, 'Drill'),
        h('label', { class: 'dlg-row' }, h('span', {}, 'New cards per day, per language'), perDay),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: prefs.drillAudio !== false, onchange: e => { prefs.drillAudio = e.target.checked; savePrefs(); emit('audio'); } }), 'Read the answer aloud')),
      h('div', { class: 'dlg-sec' }, h('h3', {}, 'Display'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', id: 'set-dark', checked: document.documentElement.dataset.theme === 'dark', onchange: e => setTheme(e.target.checked ? 'dark' : 'light') }), 'Dark mode')),
      h('div', { class: 'dlg-sec' },
        h('label', { class: 'field' }, h('span', {}, 'Anthropic API key (optional, for AI feedback in Write)'), key),
        h('p', { class: 'small muted' }, 'Sent only to api.anthropic.com. Without a key, Write uses the built-in word check.')),
      h('div', { class: 'dlg-sec' }, h('h3', {}, 'Progress'),
        h('div', { class: 'dlg-row' }, h('button', { type: 'button', class: 'btn', onclick: exportProgress }, 'Export progress (JSON)'), delBtn),
        confirmBox),
      h('div', { class: 'dlg-row' }, h('button', { type: 'button', class: 'btn primary', onclick: () => { saveKey(); settings.close(); } }, 'Done'))));
    settings.showModal();
  }
  function exportProgress() {
    const data = { exported: new Date().toISOString(), srs, progress: load(KEYS.progress, {}), days: load(KEYS.days, []), prefs };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    const a = h('a', { href: url, download: `doors-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.DG = {
    V, KEYS, ICON, CODES, DEFAULT_LANGS, load, save, h, $, dayNow, getJSON, framework,
    get prefs() { return prefs; }, savePrefs, langs, setLangs, hasChosenLangs,
    applyTheme, setTheme, initBar, openSettings, openLangSheet, langButton,
    srs, saveSrs, logDay, streak, todayLog, countNew, newPerDay, newLeft, dueByLang, hasHistory,
    announce, on: fn => listeners.push(fn),
  };
  applyTheme();
})();
