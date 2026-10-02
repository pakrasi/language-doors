/* B1 trainer, more: exam words (a runtime read of the private b1-exam vocab list with its GitHub token), Say it aloud
   (#b1/aloud, with the one-time mic check) and the Teil 2 talk (#b1/teil2). b1.js calls window.B1More:
   wordItems() while it builds the pool, refresh(api) on hub open, wordsRow(api) / drawWords(el, api) for the Words area,
   route(el, name, rest, api) for #b1/aloud and #b1/teil2, audioFor(text) for the ▶ on word cards.
   Stores: doors.b1.words.v1 {fetchedAt, etag, total, words, added}, doors.b1.cal.v1 {asr, at, detail}, doors.b1.teil2.v1 {topic}. */
(function () {
  'use strict';
  const { h, getJSON } = DG;
  const rep = (el, ...k) => el.replaceChildren(...k.flat(Infinity).filter(x => x != null && x !== false));
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const WK = 'doors.b1.words.v1', CAL = 'doors.b1.cal.v1', T2 = 'doors.b1.teil2.v1';
  const MOD = { lesen: 'Lesen', hoeren: 'Hören', schreiben: 'Schreiben', sprechen: 'Sprechen' };
  const VOCAB_URL = 'https://api.github.com/repos/pakrasi/b1-exam/contents/data/vocab.json';
  const AUDIO = '../b1-exam/audio/vocab/';
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const when = t => new Date(t).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  // ======================= exam words =======================
  const slug = s => String(s).normalize('NFC').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const parse = s => { if (!s) return null; if (typeof s !== 'string') return s; try { return JSON.parse(s); } catch { return null; } };
  // vocab.json rows → one record per lemma, the B1 list (A1–B1 in Igloo's word list) or in 2+ mock exams
  function trimWords(rows, wordmap) {
    const by = new Map();
    for (const r of rows || []) {
      if (r.deleted || !r.gloss || !(r.lemma || r.word) || !r.sentence) continue;
      const lemma = String(r.lemma || r.word).trim();
      if (!by.has(lemma) || (r.day || 99) < (by.get(lemma).day || 99)) by.set(lemma, r);
    }
    const out = [];
    for (const [lemma, r] of by) {
      const wm = wordmap[lemma] || wordmap[lemma.toLowerCase()] || null;
      const level = wm ? wm[1] : '';
      if (!(['A1', 'A2', 'B1'].includes(level) || (r.exam_days || 0) >= 2)) continue;
      const ex = (parse(r.examples) || []).find(e => e && e.de && e.de !== r.sentence) || null;
      const det = parse(r.details) || {};
      out.push({ id: wm ? 'W:' + wm[0] : 'BW:' + slug(lemma), lemma, art: (r.gender || '').replace(/[()]/g, '') || null, pl: r.plural || null,
        pos: r.pos || null, gloss: String(r.gloss).split(/[,;]/).map(s => s.trim()).filter(Boolean), sent: r.sentence, form: r.word || lemma,
        ex: ex ? { de: ex.de, en: ex.en || '' } : null, cluster: r.cluster || null, day: r.day || null, module: r.module || null, teil: r.teil || null,
        examDays: r.exam_days || 0, level, conf: (det.confusions || [])[0] || null, zipf: r.zipf || 0 });
    }
    return out.sort((a, b) => (b.examDays - a.examDays) || (b.zipf - a.zipf));
  }
  const DETS = new Set(`der die das den dem des ein eine einen einem einer eines kein keine keinen keinem keiner mein meine meinen meinem meiner
    dein deine deinen deinem sein seine seinen seinem ihr ihre ihren ihrem unser unsere unseren euer eure dieser diese dieses diesen diesem
    jeder jede jedes jeden jedem welche welcher welches viele wenige einige mehrere alle beide im am zum zur vom beim ins ans aufs`.split(/\s+/));
  // a word record → a round item: his exam sentence with the word gapped; a noun with no article before it asks for der/die/das
  function toItem(w) {
    const s = String(w.sent), f = String(w.form);
    const re = new RegExp(`(^|[^\\p{L}])(${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![\\p{L}])`, 'u');
    let m = s.match(re), i;
    if (m) i = m.index + m[1].length;
    else { const k = s.toLowerCase().indexOf(f.toLowerCase()); if (k < 0) return null; i = k; }
    const prompt = s.slice(0, i) + '___' + s.slice(i + f.length);
    const before = s.slice(0, i).toLowerCase().match(/[\p{L}]+/gu) || [];
    const noun = /^nomen$/i.test(w.pos || '') && !!w.art;
    const needArt = noun && !before.slice(-2).some(x => DETS.has(x));
    const head = noun ? `${w.art} ${w.lemma}${w.pl && !/^\(?pl/i.test(w.pl) ? ', ' + w.pl : ''}` : w.lemma;
    return { id: w.id, kind: 'word', area: 'words', group: w.cluster || 'words', teil: null, fn: null, star: false, trap: null, focus: ['word'], strict: [],
      plan: 'recall', task: needArt ? 'Type the noun with der, die or das.' : null, prompt, promptLang: 'de', hl: null, partner: null, prefill: null,
      gap: !needArt, showGap: needArt, accept: needArt ? [`${w.art} ${w.lemma}`] : [f], anywhere: false, literal: true, loose: !needArt,
      model: needArt ? `${w.art} ${w.lemma}` : s, wrong: [], rule: '', src: 'exam', level: w.level || 'B1', gloss: w.gloss.join(', '),
      source: `From Tag ${w.day || '?'}${w.module ? ' · ' + (MOD[w.module] || w.module) : ''}`,
      card: { head, ex: w.ex ? w.ex.de : null, exEn: w.ex ? w.ex.en : null, conf: w.conf } };
  }
  function wordItems() { return (load(WK, null)?.words || []).map(toItem).filter(Boolean); }

  let refreshing = null, lastState = null;
  async function loadWords(api) {
    const cached = load(WK, null), tok = api.ghToken();
    if (!tok) return { state: cached ? 'cached-no-token' : 'no-token', words: cached?.words || [], at: cached?.fetchedAt };
    if (!navigator.onLine || (cached && Date.now() - cached.fetchedAt < 10 * 60e3)) return { state: 'cached', words: cached?.words || [], at: cached?.fetchedAt };
    try {
      const r = await fetch(VOCAB_URL, { headers: { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github.raw+json', ...(cached?.etag ? { 'If-None-Match': cached.etag } : {}) }, cache: 'no-store' });
      if (r.status === 304 && cached) { cached.fetchedAt = Date.now(); save(WK, cached); return { state: 'ok', words: cached.words, at: cached.fetchedAt }; }
      if (!r.ok) throw new Error(String(r.status));
      const body = await r.json();
      const wordmap = await getJSON('data/b1/wordmap.json').catch(() => ({}));
      const words = trimWords(body.words || body, wordmap);
      const prev = new Set((cached?.words || []).map(w => w.id));
      const added = cached ? words.filter(w => !prev.has(w.id)) : [];
      const total = (body.words || body).filter(r => !r.deleted).length;
      save(WK, { fetchedAt: Date.now(), etag: r.headers.get('etag'), total, words, added: added.map(w => w.id), addedDay: added.length ? Math.max(...added.map(w => w.day || 0)) : null });
      return { state: 'ok', words, added, at: Date.now() };
    } catch (e) { return { state: 'error', words: cached?.words || [], at: cached?.fetchedAt, error: e.message }; }
  }
  // on hub open: fetch (≤ 1 request / 10 min), put new words into the pool, tell him how many
  function refresh(api, onNew) {
    if (refreshing) return refreshing;
    refreshing = loadWords(api).then(res => {
      lastState = res;
      if (res.state === 'ok' && res.words.length) {
        const n = api.addItems(res.words.map(toItem).filter(Boolean));
        if (n && onNew) onNew(n, res);
      }
      return res;
    }).finally(() => setTimeout(() => { refreshing = null; }, 1000));
    return refreshing;
  }
  let manifest = null, manifestP = null;
  function audioFor(text) {
    if (!manifestP && B1Day.DEV()) manifestP = Promise.resolve(manifest = {});
    if (!manifestP) manifestP = fetch(AUDIO + 'manifest.json').then(r => r.ok ? r.json() : {}).then(m => { manifest = m; }).catch(() => { manifest = {}; });
    const f = manifest && manifest[text];
    return f ? AUDIO + f : null;
  }
  function wordsRow(api) {
    const c = load(WK, null), tok = api.ghToken();
    const status = !tok && !c ? 'not on this device yet' : c && c.words.length ? `${c.words.length} words` : 'loading';
    return h('a', { class: 'b1-area', href: '#b1/words' },
      h('span', { class: 'b1-area-top' }, h('span', {}, 'Exam words'), h('span', { class: 'mono small' }, status)),
      !tok && !c ? h('span', { class: 'muted small' }, 'Open the B1 exam app on this device once.') : null, api.bar(0, 0));
  }
  function drawWords(el, api) {
    const c = load(WK, null), tok = api.ghToken();
    const rd = api.readiness(), x = rd.areas.words;
    const statusEl = h('p', { class: 'muted small' });
    const setStatus = res => {
      const cc = load(WK, null);
      if (!res) rep(statusEl, cc ? `Updated from your mock exams ${ago(cc.fetchedAt)}.` : '');
      else if (res.state === 'error') rep(statusEl, `Couldn't update exam words. ${cc ? 'Using the list from ' + when(cc.fetchedAt) + '.' : ''}`);
      else if (res.state === 'cached-no-token') rep(statusEl, `From ${when(cc.fetchedAt)}. To update, connect GitHub in the B1 exam app on this device.`);
      else if (cc) rep(statusEl, `Updated from your mock exams ${ago(cc.fetchedAt)}.`, cc.added?.length ? ` ${cc.added.length} new from Tag ${cc.addedDay}.` : '');
    };
    if (!tok && !c) {
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
        h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Exam words'),
          h('p', { class: 'muted' }, 'Exam words come from your B1 exam app. Open it in this browser once and connect GitHub there (Settings → Remote). Then come back here.')),
        h('a', { class: 'btn', href: '../b1-exam/app/' }, 'Open the B1 exam app')));
      el.querySelector('h1')?.focus({ preventScroll: true });
      return;
    }
    const n = c ? c.words.length : 0;
    rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Exam words'),
        h('p', { class: 'muted' }, c ? `Words you saved in your mock exams. The drill uses the ones on the B1 list or in 2 or more mock exams: ${n} of ${c.total || n}.` : 'Loading your words from the B1 exam app…'),
        statusEl),
      x ? h('div', { class: 'card b1-card' }, h('span', { class: 'b1-area-top' }, h('span', {}, 'Would recall on exam day'), h('b', { class: 'mono' }, api.pct(x.recall))), api.bar(x.recall, x.coverage, 'big'),
        h('p', { class: 'muted small' }, `${api.pct(x.coverage)} seen · ${x.seen} of ${x.n} words.`)) : null,
      n ? h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big b1-start', href: '#b1/words/round' }, 'Round: Exam words · 12')) : null));
    setStatus(null);
    el.querySelector('h1')?.focus({ preventScroll: true });
    refresh(api).then(res => { if (!el.isConnected) return; if (!c && res.words.length) drawWords(el, api); else setStatus(res); });
  }

  // ======================= speech: recogniser =======================
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const standalone = () => !!navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const canSpeak = () => !!SR && !standalone();
  let micBlocked = false;
  // one utterance; onInterim(text) for live words. Resolves {text, error}
  function listen({ onInterim, continuous = false } = {}) {
    let rec, stop;
    const p = new Promise(resolve => {
      rec = new SR(); rec.lang = 'de-DE'; rec.interimResults = true; rec.maxAlternatives = 3; rec.continuous = continuous;
      let finalText = '', error = null, spans = [];
      rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) { finalText += (finalText ? ' ' : '') + r[0].transcript.trim(); spans.push(Date.now()); } else interim += r[0].transcript;
        }
        onInterim && onInterim((finalText + ' ' + interim).trim());
      };
      rec.onerror = e => { error = e.error; if (e.error === 'not-allowed' || e.error === 'service-not-allowed') micBlocked = true; };
      rec.onend = () => resolve({ text: finalText.trim(), error, spans });
      try { rec.start(); } catch (e) { resolve({ text: '', error: 'start' }); }
    });
    stop = () => { try { rec.stop(); } catch {} };
    return { done: p, stop };
  }
  function errorText(err) {
    if (err === 'not-allowed' || err === 'service-not-allowed')
      return 'Safari blocked the microphone. To allow it: tap aA in the address bar → Website Settings → Microphone → Allow. On iPhone, Siri & Dictation must also be on. Or type your answers.';
    if (err === 'network') return 'Speech needs a connection right now. Type instead.';
    if (err === 'no-speech' || err === 'aborted' || !err) return "Didn't catch anything. Tap and try again.";
    return `Speech stopped (${err}). Tap and try again, or type instead.`;
  }
  function unsupported(el, title) {
    rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, title)),
      h('p', {}, 'Speaking works in a Safari tab. Open this page in Safari to use it.'),
      h('button', { type: 'button', class: 'btn', onclick: e => { navigator.clipboard?.writeText(location.href.replace(/[?&]nosw\b/, '')); e.currentTarget.textContent = 'Link copied'; } }, 'Copy link'),
      h('p', { class: 'muted small' }, 'Typed rounds check everything Say it aloud checks, and more.')));
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  // the mic button with its states; returns {el, set(state, label)}
  function micButton(onTap) {
    const label = h('p', { class: 'b1-mic-l muted small', 'aria-live': 'polite' }, 'Tap and speak');
    const btn = h('button', { type: 'button', class: 'b1-mic', 'aria-label': 'Speak', onclick: onTap },
      h('svg', { viewBox: '0 0 24 24', width: 30, height: 30, 'aria-hidden': 'true' }, h('path', { d: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z', fill: 'currentColor' })));
    const el = h('div', { class: 'b1-micbox' }, btn, label);
    return { el, btn, set(state, text) { btn.dataset.state = state; btn.setAttribute('aria-pressed', String(state === 'listening')); rep(label, text); } };
  }

  // ======================= Say it aloud =======================
  const CHECK_LABEL = { true: '✓', false: '✗', 'not-in': 'not in this answer', off: 'not checked: your phone tends to fix this one' };
  function drawAloud(el, rest, api) {
    if (!canSpeak()) return unsupported(el, 'Say it aloud');
    const cal = load(CAL, null);
    if (rest[0] === 'check') return micCheck(el, api);
    if (!cal && rest[0] !== 'go') {
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
        h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Say it aloud')),
        h('p', {}, 'Say the German out loud. The check looks at three things:'),
        h('ul', { class: 'b1-list' }, h('li', {}, 'the phrase you used'), h('li', {}, 'the verb at the end after dass, weil, ob and wenn'), h('li', {}, 'für or vor')),
        h('p', {}, 'Articles, endings and pronunciation are not checked. Typed rounds check those.'),
        h('p', {}, "Before the first round: a 2-minute mic check. You read 12 sentences, all wrong on purpose, so we can see which mistakes your phone's speech recognition keeps and which it fixes."),
        h('div', { class: 'b1-row-btns' }, h('a', { class: 'btn primary big', href: '#b1/aloud/check' }, 'Start mic check'), h('a', { class: 'btn', href: '#b1/aloud/go' }, 'Skip for now'))));
      el.querySelector('h1')?.focus({ preventScroll: true });
      return;
    }
    speakRound(el, api);
  }
  function micCheck(el, api) {
    const C = Speech.CANARY, results = [];
    let i = 0, live = null;
    const meta = h('p', { class: 'b1-meta mono small' }), sent = h('p', { class: 'b1-ptext b1-big', lang: 'de' }), heard = h('p', { class: 'muted', lang: 'de' });
    const mic = micButton(() => tap());
    rep(el, h('section', { class: 'b1-wrap b1-speak' }, h('a', { class: 'b1-back', href: '#b1/aloud' }, '← Say it aloud'),
      h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Mic check'), h('p', { class: 'muted small' }, 'Read each sentence exactly as written, mistakes included.')),
      meta, sent, heard, mic.el));
    const show = () => { rep(meta, `${i + 1} of ${C.length}`); rep(sent, C[i].de); rep(heard); mic.set('idle', 'Tap and read it'); };
    async function tap() {
      if (live) { live.stop(); return; }
      mic.set('listening', 'Listening · tap to stop');
      live = listen({ onInterim: t => rep(heard, t) });
      const res = await live.done; live = null;
      if (res.error && !res.text) { mic.set(micBlocked ? 'error' : 'idle', errorText(res.error)); return; }
      results.push({ i, said: res.text });
      if (++i < C.length) show(); else finish();
    }
    function finish() {
      const out = Speech.calibrate(results);
      save(CAL, { asr: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.checked])), at: Date.now(), detail: results });
      const row = (name, k) => h('tr', {}, h('td', {}, name), h('td', { class: 'mono' }, `kept ${out[k].kept} of ${out[k].n}`), h('td', {}, out[k].checked ? 'checked' : 'not checked'));
      const fixed = ['verbFinal', 'fuerVor'].filter(k => !out[k].checked);
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
        h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Mic check done')),
        h('table', { class: 'b1-checks' }, h('tbody', {}, row('Verb at the end', 'verbFinal'), row('für or vor', 'fuerVor'), row('der/die/das', 'articles'), row('Endings', 'endings'))),
        h('p', { class: 'muted small' }, fixed.length ? 'Your phone fixed some of these mistakes, so they are not graded from speech. Typed rounds still check them.'
          : 'Articles and endings are never graded from speech; typed rounds check them.'),
        h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big', href: '#b1/aloud/go' }, 'Start speaking round'))));
      el.querySelector('h1')?.focus({ preventScroll: true });
    }
    show();
    el.querySelector('h1')?.focus({ preventScroll: true });
  }
  function aloudItems(api) {
    const D = api.data(), st = api.store();
    const said = D.pool.filter(it => it.area === 'speaking' && it.kind === 'phrase');
    const seen = said.filter(it => st[it.id]?.reps).sort((a, b) => (st[a.id].due || '').localeCompare(st[b.id].due || ''));
    const extra = said.filter(it => !st[it.id]?.reps && it.star);
    return [...seen, ...extra].slice(0, 10);
  }
  function speakRound(el, api) {
    const items = aloudItems(api), cal = load(CAL, null);
    let k = 0, t0 = 0, live = null, results = [];
    if (!items.length) {
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'), h('h1', { tabindex: -1 }, 'Say it aloud'), h('p', {}, 'No Sprechen phrases yet. Do a typed round first.')));
      return;
    }
    const meta = h('p', { class: 'b1-meta mono small' }), prompt = h('div', { class: 'b1-prompt' }), heard = h('p', { class: 'b1-heard', lang: 'de' });
    const res = h('div', { class: 'b1-fb', 'aria-live': 'polite' }), below = h('div', { class: 'b1-below' });
    const mic = micButton(() => tap());
    const typeBox = h('form', { class: 'b1-typein', hidden: true, onsubmit: e => { e.preventDefault(); const v = typeBox.querySelector('input').value.trim(); if (v) gradeIt(v, true); } },
      h('input', { type: 'text', lang: 'de', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', placeholder: 'Type the German', 'aria-label': 'Your answer' }),
      h('button', { class: 'btn', type: 'submit' }, 'Check'));
    const typeLink = h('button', { type: 'button', class: 'btn b1-sec', onclick: () => openType() }, 'Type instead');
    rep(el, h('section', { class: 'b1-wrap b1-speak' },
      h('div', { class: 'b1-strip' }, h('span', { class: 'mono small muted' }, 'Say it aloud'), h('a', { class: 'btn small-btn', href: '#b1' }, 'End')),
      meta, prompt, heard, res, mic.el, typeBox, below));
    const openType = () => { typeBox.hidden = false; typeBox.querySelector('input').focus(); };
    function show() {
      const it = items[k];
      rep(meta, `${k + 1} of ${items.length} · ${it.teil ? 'Sprechen ' + it.teil.replace('S', 'Teil ') : 'Opinion'}`);
      rep(prompt, h('p', { class: 'b1-ptext' }, it.prompt), it.hl && norm(it.hl) !== norm(it.prompt) ? h('p', { class: 'muted small' }, 'Say the German for: ', h('mark', { class: 'hl' }, it.hl)) : null);
      rep(heard); rep(res); rep(below, typeLink); typeBox.hidden = true; typeBox.querySelector('input').value = '';
      mic.el.hidden = false; mic.set('idle', 'Tap and speak'); t0 = performance.now();
    }
    async function tap() {
      if (live) { live.stop(); mic.set('checking', 'Checking'); return; }
      if (micBlocked) { mic.set('error', errorText('not-allowed')); openType(); return; }
      mic.set('listening', 'Listening · tap to stop');
      live = listen({ onInterim: t => rep(heard, h('span', { class: 'muted' }, t)) });
      const r = await live.done; live = null;
      if (!r.text) { mic.set('idle', errorText(r.error)); if (r.error === 'network' || micBlocked) openType(); return; }
      gradeIt(r.text, false);
    }
    function gradeIt(text, typed) {
      const it = items[k], ms = performance.now() - t0;
      const g = api.gradeAnswer(it, text);
      const sp = Speech.grade(text, it, cal, { match: () => g.matchOk });
      const ok = typed ? g.ok : sp.ok;
      const st = api.store()[it.id];
      const limit = B1Timer.limit(it, { stage: st?.stage || 0 });
      api.recordSpoken(it, { ok, ms, limit });
      results.push({ id: it.id, ok });
      mic.el.hidden = true; typeBox.hidden = true;
      const row = (name, v) => h('tr', {}, h('td', {}, name), h('td', { class: v === true ? 'ok' : v === false ? 'bad' : 'muted' }, CHECK_LABEL[String(v)] || v));
      rep(heard, h('span', { class: 'muted small' }, typed ? 'You typed ' : 'You said '), `„${sp.text}“`);
      rep(res,
        typed ? null : h('table', { class: 'b1-checks' }, h('tbody', {},
          row('Phrase', sp.chunk), row('Verb at the end after dass', sp.verbFinal), row('für or vor', sp.fuerVor),
          row('Articles and endings', 'not checked'), row('Pronunciation', 'not checked'))),
        ok ? h('p', { class: 'b1-res ok' }, `✓ Right · ${(ms / 1000).toFixed(1)} s`) : [h('p', { class: 'b1-res bad' }, 'Not quite'), h('p', { lang: 'de' }, h('span', { class: 'muted small' }, 'Right: '), g.right)],
        !ok && g.detRule ? h('p', { class: 'b1-rule' }, g.detRule) : (!ok && it.rule ? h('p', { class: 'b1-rule' }, it.rule) : null));
      const nextBtn = h('button', { type: 'button', class: 'btn primary big', onclick: () => next() }, k + 1 < items.length ? 'Next' : 'Finish');
      rep(below, typed ? null : h('button', { type: 'button', class: 'btn', onclick: () => { results.pop(); openType(); rep(res, h('p', { class: 'muted small' }, 'Type what you meant to say.')); } }, "That's not what I said"), nextBtn);
      nextBtn.focus({ preventScroll: true });
    }
    function next() { if (++k < items.length) show(); else done(); }
    function done() {
      const right = results.filter(r => r.ok).length;
      rep(el, h('section', { class: 'b1-wrap b1-done' }, h('p', { class: 'eyebrow' }, 'Say it aloud'), h('h1', { tabindex: -1 }, `${right} of ${results.length} right`),
        h('p', { class: 'muted' }, 'Spoken answers count for the phrase. Your traps still need a typed answer today.'),
        h('div', { class: 'b1-sticky' }, h('a', { class: 'btn primary big', href: '#b1/round' }, 'Typed round'), h('a', { class: 'btn big', href: '#b1' }, 'Done'),
          h('a', { class: 'btn small-btn', href: '#b1/aloud/check' }, 'Redo the mic check'))));
      el.querySelector('h1')?.focus({ preventScroll: true });
    }
    const onKey = e => {
      if (e.key === 'Tab' && typeBox.hidden && !mic.el.hidden) { e.preventDefault(); openType(); }
      if (e.key === 'Escape') location.hash = '#b1';
    };
    document.addEventListener('keydown', onKey); window.__cleanup = () => { document.removeEventListener('keydown', onKey); live && live.stop(); };
    show();
  }

  // ======================= Teil 2 talk =======================
  const FOLIEN = [['Thema vorstellen', ['t2_open']], ['Eigene Erfahrung', ['t2_experience']], ['In meinem Heimatland', ['t2_home']],
    ['Vor- und Nachteile, Meinung', ['t2_proscons', 't2_conclude']], ['Abschluss', ['t2_close']]];
  const ENDS = [20, 60, 100, 160, 180];   // Run 1, seconds: Folie k ends at ENDS[k]
  const RUNS = [180, 135, 90];
  const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function drawTeil2(el, api) {
    const D = api.data(), topics = D.plan.scenarios?.teil2 || ['Homeoffice'];
    const st = load(T2, {}); let topic = topics.includes(st.topic) ? st.topic : topics[0];
    const cues = FOLIEN.map(([, fns]) => D.pool.filter(it => it.kind === 'phrase' && it.group === 'S2' && fns.includes(it.fn) && it.star).slice(0, 2).map(it => it.model));
    let run = 0, rec = null, chunks = [], audioUrl = null;
    const runs = [];
    intro();
    function intro() {
      const tEl = h('b', {}, topic);
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
        h('header', { class: 'section' }, h('h1', { tabindex: -1 }, 'Teil 2 talk'),
          h('p', { class: 'muted' }, 'The real Teil 2: about 3 minutes over five Folien. Then the same content in 2:15 and 1:30. Say it out loud; the recording is for you to play back.')),
        h('p', {}, 'Topic: ', tEl, ' ', h('button', { type: 'button', class: 'btn small-btn', onclick: () => { topic = topics[(topics.indexOf(topic) + 1) % topics.length]; save(T2, { topic }); rep(tEl, topic); } }, 'Change')),
        h('ol', { class: 'b1-folien' }, FOLIEN.map(([name], k) => h('li', {}, h('span', {}, h('b', {}, name), h('span', { class: 'mono small muted' }, ` · until ${mmss(ENDS[k])}`)), cues[k].length ? h('span', { class: 'small muted', lang: 'de' }, cues[k].join(' · ')) : null))),
        canSpeak() ? null : h('p', { class: 'muted small' }, 'No speech recognition here, so no speech rate. The timer and the recording still work.'),
        h('div', { class: 'b1-sticky' }, h('button', { type: 'button', class: 'btn primary big', onclick: () => start() }, `Start: ${mmss(RUNS[run])}`))));
      el.querySelector('h1')?.focus({ preventScroll: true });
    }
    async function start() {
      const total = RUNS[run], scale = total / 180;
      chunks = []; if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
      try {
        if (navigator.mediaDevices?.getUserMedia && window.MediaRecorder) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          rec = new MediaRecorder(stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
          rec.onstop = () => stream.getTracks().forEach(t => t.stop());
          rec.start();
        }
      } catch { rec = null; }
      let words = '', heardMs = 0, live = null, stopped = false;
      const t0 = performance.now();
      if (canSpeak()) {
        const go = () => { if (stopped) return; const s = performance.now(); live = listen({ continuous: true, onInterim: () => {} });
          live.done.then(r => { if (r.text) { words += ' ' + r.text; heardMs += performance.now() - s; } go(); }); };
        go();
      }
      const clock = h('p', { class: 'b1-clock mono' }), folie = h('p', { class: 'b1-folie' }), cue = h('p', { class: 'small muted', lang: 'de' });
      const prog = h('div', { class: 'b1-bar big' }, h('i', { class: 'rec', style: 'width:0%' }));
      const stopBtn = h('button', { type: 'button', class: 'btn big', onclick: () => end() }, 'Stop');
      rep(el, h('section', { class: 'b1-wrap b1-run' }, h('p', { class: 'mono small muted' }, `Run ${run + 1} of 3 · ${topic} · ${mmss(total)}`), clock, folie, cue, prog,
        h('div', { class: 'b1-sticky' }, stopBtn)));
      const tick = () => {
        const s = (performance.now() - t0) / 1000, left = Math.max(0, total - s);
        const kf = ENDS.findIndex(e => s < e * scale); const k = kf < 0 ? 4 : kf;
        rep(clock, mmss(Math.ceil(left))); rep(folie, `Folie ${k + 1} · ${FOLIEN[k][0]}`); rep(cue, cues[k].join(' · '));
        prog.firstChild.style.width = `${Math.min(100, (s / total) * 100)}%`;
        if (left <= 0) end();
      };
      const iv = setInterval(tick, 250); tick();
      window.__cleanup = () => { clearInterval(iv); stopped = true; live && live.stop(); try { rec && rec.state !== 'inactive' && rec.stop(); } catch {} };
      async function end() {
        if (stopped) return;
        clearInterval(iv); stopped = true;
        const secs = Math.min(total, (performance.now() - t0) / 1000);
        if (live) { live.stop(); await Promise.race([live.done, new Promise(r => setTimeout(r, 1500))]); }
        if (rec && rec.state !== 'inactive') { await new Promise(r => { rec.addEventListener('stop', r, { once: true }); rec.stop(); }); }
        if (chunks.length) audioUrl = URL.createObjectURL(new Blob(chunks, { type: chunks[0].type || 'audio/mp4' }));
        const text = words.trim(), nw = text ? text.split(/\s+/).length : 0, syl = Speech.syllables(text);
        const full = canSpeak() && heardMs / 1000 >= 0.8 * secs && nw > 0;
        runs[run] = { secs, nw, sps: full ? syl / secs : null };
        after(full);
      }
    }
    function after(full) {
      const r = runs[run];
      const line = `Run ${run + 1} · ${mmss(r.secs)}` + (full ? ` · ${r.nw} words · about ${r.sps.toFixed(1)} syllables a second` : '');
      const nextRun = run + 1 < RUNS.length;
      const mock = h('p', { class: 'small', hidden: true });
      rep(el, h('section', { class: 'b1-wrap' }, h('a', { class: 'b1-back', href: '#b1' }, '← B1'),
        h('header', { class: 'section' }, h('h1', { tabindex: -1 }, line)),
        full ? h('p', { class: 'muted small' }, 'B1 speech with pauses: about 2.5 · fluent learner: 3.3') : h('p', { class: 'muted small' }, canSpeak() ? 'Speech rate needs a full transcript; Chrome on the Mac gives one.' : 'Time only: no speech recognition in this browser.'),
        audioUrl ? h('audio', { controls: true, src: audioUrl, class: 'b1-audio' }) : h('p', { class: 'muted small' }, 'No recording (the microphone was not available).'),
        runs.length > 1 ? h('ul', { class: 'b1-items' }, runs.map((x, i) => h('li', { class: 'mono small' }, `Run ${i + 1} · ${mmss(x.secs)}${x.sps ? ` · ${x.sps.toFixed(1)} syll/s` : ''}`))) : null,
        mock,
        h('div', { class: 'b1-sticky' },
          nextRun ? h('button', { type: 'button', class: 'btn primary big', onclick: () => { run++; start(); } }, `Next: the same in ${mmss(RUNS[run + 1])}`) : h('a', { class: 'btn primary big', href: '#b1' }, 'Done'),
          h('button', { type: 'button', class: 'btn', onclick: () => start() }, 'Again'))));
      el.querySelector('h1')?.focus({ preventScroll: true });
      fillSprechenDay(mock);
    }
  }
  // "Record one for Fritz": the next mock day whose Sprechen is not done
  async function fillSprechenDay(el) {
    if (B1Day.DEV()) return;   // b1-exam is not served on localhost
    try {
      const r = await fetch('../b1-exam/data/progress.json', { cache: 'no-store' }); if (!r.ok) return;
      const next = ((await r.json()).days || []).find(x => !x.sprechen); if (!next) return;
      rep(el, 'Record one for Fritz: ', h('a', { href: `../b1-exam/app/#/tag/${next.day}` }, `b1-exam Sprechen, Tag ${next.day}`), '.');
      el.hidden = false;
    } catch {}
  }

  function route(el, name, rest, api) {
    if (name === 'aloud') { drawAloud(el, rest, api); return true; }
    if (name === 'teil2') { drawTeil2(el, api); return true; }
    return false;
  }
  window.B1More = { wordItems, refresh, wordsRow, drawWords, route, audioFor, trimWords, toItem, canSpeak };
})();
