/* B1 trainer: one round of typed items (UX §4). The keyboard stays up for the whole round: one persistent textarea,
   never readOnly, never blurred; Return drives everything. b1.js supplies the items, the grader and the scheduler.

   B1Round.run(host, src, opts)
     src.cur()            → entry {item, isNew, limit (s | null), stage, n (1-based), reinsert}
     src.grade(entry, typed, move?) → g (see b1.js gradeAnswer)
     src.answer(entry, outcome)     → persists the outcome (FSRS, queue, reinsertion)
     src.advance()        → true while there is a next entry
     src.dots()           → [{s: 'ok'|'bad'|'cur'|'todo'|'extra'}]
     src.finish(reason)   → 'done' | 'end'
     src.claude?(entry, typed) → Promise<{verdict: 'correct'|'minor'|'wrong', note}>   (the "My answer is right" check)
   opts: {layout: 'docked'|'flow', reduce, hlHelper} */
(function () {
  'use strict';
  const { h } = DG;
  const rep = (el, ...k) => el.replaceChildren(...k.flat(Infinity).filter(x => x != null && x !== false));
  const fmtS = ms => (ms / 1000).toFixed(1).replace(/\.0$/, '') + ' s';
  const TEIL = { S1: 'Teil 1', S2: 'Teil 2', S3: 'Teil 3', W1: 'Schreiben Teil 1', W2: 'Schreiben Teil 2', W3: 'Schreiben Teil 3', L2: 'Teil 2', L3: 'Teil 3', L5: 'Teil 5' };
  const AREA = { speaking: 'Sprechen', reading: 'Lesen', grammar: 'Grammar', words: 'Words' };
  const FN_VERB = { suggest: 'makes a suggestion', reject: 'says no and gives a reason', accept: 'agrees', counter: 'suggests something else', question: 'asks a question',
    feedback: 'gives feedback', open: 'opens the conversation', tasks: 'shares out the tasks', confirm: 'confirms the plan', clarify: 'asks again',
    answer: 'answers the question', disagree: 'disagrees', agree: 'agrees', weigh: 'weighs both sides', opinion: 'gives your opinion',
    structure: 'moves to the next point', experience: 'talks about your experience', home: 'describes your home country', proscons: 'names a pro or con',
    reasons: 'gives a reason', conclude: 'sums up' };
  const fnVerb = fn => FN_VERB[String(fn || '').replace(/^[a-z0-9]+_/, '')] || 'does this';

  function highlight(text, part) {
    const s = String(text), i = part ? s.toLowerCase().indexOf(String(part).toLowerCase()) : -1;
    if (i < 0) return s;
    return [s.slice(0, i), h('mark', { class: 'hl' }, s.slice(i, i + part.length)), s.slice(i + part.length)];
  }
  function gapWindow(text, n = 12) {
    const w = String(text).split(/\s+/), gi = w.findIndex(x => x.includes('___'));
    if (w.length <= n + 2 || gi < 0) return String(text);
    let a = Math.max(0, gi - Math.floor(n / 2)), b = Math.min(w.length, a + n); a = Math.max(0, b - n);
    return (a > 0 ? '… ' : '') + w.slice(a, b).join(' ') + (b < w.length ? ' …' : '');
  }
  function gapPrompt(text) {
    const s = String(text).replace(/\s*\(([^()]*)\)\s*$/, (m, cue) => ` (${cue})`);
    const i = s.indexOf('___');
    return i < 0 ? s : [s.slice(0, i), h('span', { class: 'b1-gap', 'aria-label': 'gap' }, '  '), s.slice(i + 3)];
  }
  // "You:" line with wrong words boxed, "Right:" line with the words he missed in bold
  function diffLines(typed, right) {
    const d = Match.diffWords(typed, right);
    const you = []; let pos = 0;
    for (const w of d.wrong) { you.push(typed.slice(pos, w.start), h('span', { class: 'b1-box' }, typed.slice(w.start, w.end))); pos = w.end; }
    you.push(typed.slice(pos));
    const miss = new Set(d.missing), rt = []; let p2 = 0;
    d.right.forEach((w, k) => { if (!miss.has(k)) return; rt.push(right.slice(p2, w.start), h('b', {}, right.slice(w.start, w.end))); p2 = w.end; });
    rt.push(right.slice(p2));
    return { you, right: rt };
  }

  function run(host, src, opts = {}) {
    const docked = opts.layout !== 'flow';
    const reduce = !!opts.reduce;
    document.body.classList.add('focus', 'b1-in-round');
    // ---- layout ----
    const dots = h('div', { class: 'b1-dots', 'aria-hidden': 'true' });
    const count = h('span', { class: 'b1-count mono' });
    const endBtn = h('button', { type: 'button', class: 'btn small-btn b1-end', onpointerdown: e => e.preventDefault(), onclick: () => end() }, 'End', h('kbd', { class: 'keys-only' }, 'Esc'));
    const strip = h('div', { class: 'b1-strip' }, dots, count, endBtn);
    const meta = h('div', { class: 'b1-meta' });
    const secs = h('span', { class: 'b1-secs mono', 'aria-hidden': 'true' });
    const promptEl = h('div', { class: 'b1-prompt', onclick: () => { promptEl.classList.toggle('open'); input.focus({ preventScroll: true }); } });
    const promptZone = h('div', { class: 'b1-pz' }, h('div', { class: 'b1-meta-row' }, meta, secs), promptEl);
    const fb = h('div', { class: 'b1-fb', 'aria-live': 'polite' });
    const tRun = h('i', { class: 'run' }), tOver = h('i', { class: 'over' });
    const tbar = h('div', { class: 'b1-tbar', 'aria-hidden': 'true' }, tRun, tOver);
    const prefill = h('span', { class: 'b1-prefill', hidden: true });
    const input = h('textarea', { class: 'b1-input', rows: 1, lang: 'de', autocapitalize: 'off', autocorrect: 'off', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'go', 'aria-label': 'Your answer in German' });
    const checkBtn = h('button', { type: 'button', class: 'btn primary b1-check', 'aria-label': 'Check', onpointerdown: e => e.preventDefault(), onclick: () => onReturn() }, '⏎');
    const field = h('div', { class: 'b1-field' }, prefill, input);
    const dock = h('div', { class: 'b1-dock' }, field, checkBtn);
    const below = h('div', { class: 'b1-below' });
    const sess = h('div', { class: 'b1-sess' + (docked ? ' docked' : ' flow'), role: 'region', 'aria-label': 'Round' }, strip, promptZone, fb, tbar, dock, below);
    rep(host, sess);
    const sr = h('div', { class: 'sr-only', 'aria-live': 'assertive' }); sess.append(sr);
    const say = t => { sr.textContent = ''; setTimeout(() => { sr.textContent = t; }, 30); };

    // the session box follows the visual viewport, so the dock sits on the keyboard
    const vv = window.visualViewport;
    function fit() {
      if (!docked) return;
      const H = vv ? vv.height : innerHeight, top = vv ? vv.offsetTop : 0;
      sess.style.height = H + 'px'; sess.style.top = top + 'px';
    }
    if (docked) { vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit); addEventListener('resize', fit); fit(); }
    function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 3 * 26 + 14) + 'px'; }
    input.addEventListener('input', () => { grow(); lastKey = performance.now(); if (state === 'retype') input.classList.remove('shake'); });

    // ---- per-item state ----
    let entry = null, state = 'answer', t0 = 0, pausedAt = 0, pausedMs = 0, lastKey = 0, tick = null, auto = null;
    let firstTyped = '', det = null, limitMs = null, repairLimit = null, overSaid = false, showSaid = false, outcome = null, move = null, revealed = false;

    function elapsed() { return (pausedAt || performance.now()) - t0 - pausedMs; }
    function startTimer(ms) {
      clearInterval(tick); t0 = performance.now(); pausedMs = 0; pausedAt = 0; overSaid = showSaid = false;
      limitMs = ms;
      tbar.hidden = !ms; tbar.classList.toggle('repair', state === 'repair');
      if (!ms) { secs.textContent = entry.isNew ? 'no timer' : ''; return; }
      say(`${Math.round(ms / 1000)} seconds`);
      tick = setInterval(draw, reduce ? 1000 : 100); draw();
    }
    function stopTimer() { clearInterval(tick); tick = null; }
    function draw() {
      if (!limitMs) return;
      const e = elapsed(), L = limitMs;
      if (pausedAt) { secs.textContent = 'Paused'; return; }
      const run = Math.max(0, 1 - e / L), over = Math.min(1, Math.max(0, (e - L) / L));
      tRun.style.width = (run * 100) + '%'; tOver.style.width = (over * 100) + '%';
      tbar.classList.toggle('is-over', e > L);
      if (state === 'repair') secs.textContent = `${Math.max(0, Math.ceil((L - e) / 1000))} s to fix`;
      else secs.textContent = e <= L ? `${Math.max(1, Math.ceil((L - e) / 1000))} s` : `+${Math.floor((e - L) / 1000)} s`;
      secs.classList.toggle('over', e > L);
      if (state === 'repair' && e > L) { stopTimer(); finishRepair(false); return; }
      if (state !== 'answer') return;
      if (e > L && !overSaid) { overSaid = true; say('Over time. Keep going.'); }
      if (e > 2 * L) {
        if (!showSaid) { showSaid = true; say('Show answer is available.'); drawAnswerHelp(); }
        if (performance.now() - Math.max(lastKey, t0 + 2 * L) > 3000) { stopTimer(); showAnswer(); }
      }
    }
    function pause() { if (!pausedAt && tick) { pausedAt = performance.now(); draw(); } }
    function resume() { if (pausedAt) { pausedMs += performance.now() - pausedAt; pausedAt = 0; draw(); } }
    const onVis = () => { if (document.hidden) pause(); else if (document.activeElement === input) resume(); };
    document.addEventListener('visibilitychange', onVis);
    input.addEventListener('focus', resume);
    sess.addEventListener('click', e => { if (!e.target.closest('button,a,summary,.b1-prompt')) input.focus({ preventScroll: true }); });

    function setPlaceholder(t) { input.placeholder = t; }
    function clearField() { input.value = ''; grow(); }

    // ---- drawing an item ----
    function drawItem() {
      entry = src.cur();
      if (!entry) return finish('done');
      const it = entry.item;
      state = it.kind === 'reply' ? 'pick' : 'answer';
      det = null; outcome = null; move = null; revealed = false; firstTyped = ''; repairLimit = null;
      clearTimeout(auto); sess.classList.remove('fb-on'); promptEl.classList.remove('open');
      rep(fb); rep(below);
      // strip
      rep(dots, src.dots().map(d => h('i', { class: d.s })));
      count.textContent = '';
      // meta
      const where = it.area === 'words' ? `Exam words${it.group && it.group !== 'words' ? ' · ' + it.group : ''}` : /^W/.test(it.teil || '') ? `Schreiben · ${TEIL[it.teil].replace('Schreiben ', '')}` : [AREA[it.area] || '', it.teil && it.area !== 'grammar' ? TEIL[it.teil] : null].filter(Boolean).join(' · ');
      rep(meta, entry.isNew ? h('span', { class: 'b1-new' }, 'New') : null, entry.isNew ? ' · ' : null, it.kind === 'topic' || it.kind === 'reply' ? `Situation · ${TEIL[it.teil] || ''}` : where);
      // prompt
      const kids = [];
      if (it.task) kids.push(h('p', { class: 'b1-task' }, it.task));
      if (it.partner) kids.push(h('p', { class: 'b1-partner-l muted small' }, 'Your partner says:'), h('p', { class: 'b1-partner', lang: 'de' }, `„${it.partner}“`));
      if (it.gap || it.showGap) {   // the full sentence while answering; ~12 words around the gap while feedback shows (never the gap cut off)
        // long exam sentences (Lesen texts run to 40+ words): ~20 words around the gap while answering, so the gap is never below the fold
        kids.push(h('p', { class: 'b1-ptext b1-gapped', lang: 'de' }, h('span', { class: 'b1-pfull' }, gapPrompt(gapWindow(it.prompt, 20))),
          h('span', { class: 'b1-pwin', 'aria-hidden': 'true' }, gapPrompt(gapWindow(it.prompt, 12)))));
      }
      else kids.push(h('p', { class: 'b1-ptext', lang: it.promptLang === 'de' ? 'de' : 'en' }, it.hl ? highlight(it.prompt, it.hl) : it.prompt));
      if (it.gloss) kids.push(h('p', { class: 'b1-gloss muted' }, it.gloss));
      if (it.source) kids.push(h('p', { class: 'b1-source mono' }, it.source));
      if (entry.isNew) kids.push(h('p', { class: 'b1-help muted small' }, 'Type it if you know it.'));
      else if (it.hl && opts.hlHelper) kids.push(h('p', { class: 'b1-help muted small' }, 'Type the German for the highlighted part.'));
      rep(promptEl, kids);
      // dock
      prefill.hidden = !it.prefill;   // only the lead-in after the last sentence break ("… Deshalb"): the first sentence is in the prompt
      { const pf = String(it.prefill || ''), k = pf.search(/[.!?]\s+\S[^.!?]*$/); prefill.textContent = k >= 0 ? '… ' + pf.slice(k + 1).trim() : pf; prefill.title = pf; }
      clearField(); setPlaceholder(it.gap ? 'Type the missing words' : 'Type the German');
      input.classList.remove('shake');
      tbar.hidden = true; tRun.style.width = '100%'; tOver.style.width = '0%';
      if (state === 'pick') return drawPick();
      dock.hidden = false;
      drawAnswerHelp();
      startTimer(entry.limit ? entry.limit * 1000 : null);
      input.focus({ preventScroll: true });
    }
    function drawAnswerHelp() {
      const it = entry.item, b = [];
      if (entry.isNew) b.push(h('button', { type: 'button', class: 'btn b1-sec', onpointerdown: e => e.preventDefault(), onclick: () => showMe() }, 'Show me', h('kbd', { class: 'keys-only' }, 'Tab')));
      else if (limitMs && elapsed() > 2 * limitMs) b.push(h('button', { type: 'button', class: 'btn b1-sec', onpointerdown: e => e.preventDefault(), onclick: () => showAnswer() }, 'Show answer', h('kbd', { class: 'keys-only' }, 'Tab')));
      void it;
      rep(below, b);
    }
    // Reply items: pick a move first (the only time the keyboard closes in a round)
    function drawPick() {
      const it = entry.item;
      dock.hidden = true; input.blur();
      rep(below, h('div', { class: 'b1-moves', role: 'group', 'aria-label': 'How do you want to answer?' },
        it.moves.map((m, k) => h('button', { type: 'button', class: 'btn b1-move', onclick: () => pick(k) }, h('kbd', { class: 'keys-only' }, String(k + 1)), m.label))));
      startTimer(entry.limit ? entry.limit * 1000 : null);
    }
    function pick(k) {
      move = entry.item.moves[k]; state = 'answer';
      rep(below); dock.hidden = false;
      rep(fb, h('p', { class: 'b1-chosen muted small' }, `${move.label}:`));
      input.focus({ preventScroll: true });
    }

    // ---- answering ----
    const full = typed => (entry.item.prefill ? entry.item.prefill + ' ' : '') + typed;
    function onReturn() {
      const typed = input.value.trim();
      if (state === 'answer') { if (!typed) return; return submit(typed); }
      if (state === 'repair') { if (!typed) return; return finishRepair(true); }
      if (state === 'retype') { if (!typed) return; return checkRetype(typed); }
      if (state === 'feedback') return next();
    }
    function submit(typed) {
      const ms = elapsed();
      firstTyped = typed;
      const g = src.grade(entry, full(typed), move);
      stopTimer();
      if (g.det && !entry.isNew) {   // a trap: one self-repair at 50 % of the limit
        det = g.det; state = 'repair';
        sess.classList.add('fb-on');
        rep(fb, h('p', { class: 'b1-hint' }, hintNodes(det.hint)));
        repairLimit = Math.max(4000, (limitMs || 12000) * 0.5);
        outcome = { ms, g, firstTyped: typed };
        startTimer(repairLimit);
        rep(below);
        input.focus({ preventScroll: true });
        return;
      }
      if (entry.isNew) {
        if (g.ok && !g.det) return showRight(g, ms, { isNew: true });
        return studyCard(g, typed);
      }
      if (g.ok) return showRight(g, ms, {});
      return showWrong(g, typed, ms);
    }
    function finishRepair(submitted) {
      stopTimer();
      const typed = input.value.trim();
      const g = submitted ? src.grade(entry, full(typed), move) : null;
      if (g && g.ok && !g.det) {
        record({ ok: true, ms: outcome.ms, selfRepair: true, det: det.cls, g });
        state = 'feedback';
        rep(fb, h('p', { class: 'b1-res ok' }, '✓ Fixed it'), h('p', { class: 'b1-yours', lang: 'de' }, full(typed)));
        clearField(); setPlaceholder('Return for next'); rep(below);
        return;
      }
      showWrong(g || outcome.g, typed || outcome.firstTyped, outcome.ms, { det });
    }
    function record(o) {
      if (entry._recorded) return;
      entry._recorded = true;
      src.answer(entry, { ...o, limit: entry.limit, revealed, move: move?.key });
    }
    // exam words: the word with article and plural, an example (▶ from the b1-exam audio), the confusion note
    function wordCard(it) {
      const c = it && it.card; if (!c) return null;
      const url = c.ex && window.B1More?.audioFor?.(c.ex);
      const play = url ? h('button', { type: 'button', class: 'btn small-btn b1-play', 'aria-label': 'Play the example', onpointerdown: e => e.preventDefault(),
        onclick: () => { try { new Audio(url).play(); } catch {} } }, '▶') : null;
      return h('div', { class: 'b1-wcard' }, h('p', { lang: 'de' }, h('b', {}, c.head)),
        c.ex ? h('p', { class: 'small' }, play, play ? ' ' : null, h('span', { lang: 'de' }, c.ex), c.exEn ? h('span', { class: 'muted' }, ` · ${c.exEn}`) : null) : null,
        c.conf ? h('p', { class: 'muted small' }, c.conf) : null);
    }
    function hintNodes(t) { return String(t).split(/\*([^*]+)\*/).map((x, i) => i % 2 ? h('i', {}, x) : x); }

    // A–E: right
    function showRight(g, ms, o) {
      const it = entry.item;
      const late = !o.isNew && limitMs && ms > limitMs, veryLate = !o.isNew && limitMs && ms > 2 * limitMs;
      const capSlip = g.capMiss.length > 0 && !(it.focus || []).includes('cap');
      const umlaut = g.umlautMiss.length > 0;
      record({ ok: true, ms, capSlip, umlaut, typo: g.typos.length > 0, g });
      state = 'feedback'; sess.classList.add('fb-on');
      let head, cls = 'ok';
      if (o.isNew) head = 'Right. You already knew this one.';
      else if (veryLate) { head = 'Right, but over twice the time. It counts as a miss today, so it comes back tomorrow.'; cls = 'warn'; }
      else if (late) { head = `Right, a bit slow · ${fmtS(ms)} of ${Math.round(limitMs / 1000)} s`; cls = 'warn'; }
      else if (umlaut) { head = `Right · umlaut: ${g.umlautMiss.map(t => t.expected).join(', ')}`; cls = 'warn'; }
      else if (capSlip) { head = 'Right · nouns need a capital'; cls = 'warn'; }
      else if (g.typos.length) head = 'Right, with a typo';
      else head = `Right · ${fmtS(ms)}`;
      const kids = [h('p', { class: 'b1-res ' + cls }, '✓ ', head), h('p', { class: 'b1-yours', lang: 'de' }, markSlips(g))];
      if (it.kind === 'topic' || it.kind === 'reply') kids.push(h('p', { class: 'muted small' }, `Checked: the phrase that ${fnVerb((move && move.fn) || it.fn)}. The rest is shown without a grade.`));
      const others = g.alsoCorrect || [];
      const primary = g.primary && !g.typos.length && !capSlip && !umlaut && !late;
      if (others.length) {
        if (it.kind === 'topic' || it.kind === 'reply' || !primary) {
          kids.push(h('p', { class: 'b1-also' }, h('span', { class: 'muted' }, it.kind === 'topic' || it.kind === 'reply' ? 'Other ways to do this: ' : 'Also correct: '),
            h('span', { lang: 'de' }, others.slice(0, 2).join(' · ')), others.length > 2 ? alsoMore(others.slice(2)) : null));
        } else kids.push(h('p', { class: 'b1-also' }, alsoMore(others, 'Also correct: ')));
      }
      rep(fb, kids, wordCard(entry.item));
      clearField(); setPlaceholder('Return for next'); rep(below);
      if (primary && !o.isNew && it.kind !== 'topic') auto = setTimeout(next, 700);
    }
    function alsoMore(list, label = '') {
      const more = h('details', { class: 'b1-more' }, h('summary', { onpointerdown: e => e.preventDefault(), onclick: () => clearTimeout(auto) }, label + `+ ${list.length} more`), h('p', { lang: 'de' }, list.join(' · ')));
      return more;
    }
    // his answer with typo / capital / umlaut slips underlined and the right spelling after it
    function markSlips(g) {
      const s = g.input, marks = [...g.typos.map(t => ({ ...t, k: 'typo' })), ...g.capMiss.map(t => ({ ...t, k: 'cap' })), ...g.umlautMiss.map(t => ({ ...t, k: 'uml' }))].sort((a, b) => a.start - b.start);
      const out = []; let p = 0;
      for (const m of marks) { if (m.start < p) continue; out.push(s.slice(p, m.start), h('span', { class: 'b1-slip ' + m.k }, s.slice(m.start, m.end)), h('span', { class: 'b1-fix' }, ' ' + m.expected)); p = m.end; }
      out.push(s.slice(p));
      return out;
    }
    // G: wrong → diff, the closest right answer, one rule line, untimed retype
    function showWrong(g, typed, ms, o = {}) {
      const it = entry.item;
      record({ ok: false, ms, det: o.det?.cls, g });
      const right = g.right;
      const d = diffLines(full(typed), right);
      const kids = [h('p', { class: 'b1-res bad' }, 'Not quite'),
        h('p', { class: 'b1-diff', lang: 'de' }, h('span', { class: 'lbl' }, 'You: '), d.you),
        h('p', { class: 'b1-diff', lang: 'de' }, h('span', { class: 'lbl' }, 'Right: '), d.right)];
      if (g.alsoCorrect && g.alsoCorrect.length) kids.push(h('p', { class: 'b1-also' }, alsoMore(g.alsoCorrect, 'Other ways: ')));
      const rule = (o.det && g.detRule) || it.rule;
      if (rule) kids.push(h('p', { class: 'b1-rule' }, rule));
      if (src.claude && src.claude.available() && !o.det && !g.det) kids.push(claudeBtn(typed));
      rep(fb, kids, wordCard(entry.item));
      toRetype(right);
    }
    // "My answer is right": Claude checks it; never for an answer a trap detector flagged
    function claudeBtn(typed) {
      const box = h('div', { class: 'b1-claude' });
      const btn = h('button', { type: 'button', class: 'btn small-btn', onpointerdown: e => e.preventDefault(), onclick: async () => {
        btn.disabled = true; btn.textContent = 'Checking…';
        try {
          const v = await src.claude(entry, full(typed));
          if (v.verdict === 'correct' || v.verdict === 'minor') {
            src.answer(entry, { override: true, ok: true, rating: 2, flags: 'a' });
            rep(box, h('p', { class: 'b1-res ok' }, v.verdict === 'correct' ? '✓ Claude: correct. It counts this time (as Hard), and it\'s saved as a variant.' : '✓ Claude: right, with a small slip. It counts this time (as Hard).'), v.note ? h('p', { class: 'muted small' }, v.note) : null);
            state = 'feedback'; clearField(); setPlaceholder('Return for next'); rep(below);
          } else rep(box, h('p', { class: 'b1-res bad' }, 'Claude: not right.'), v.note ? h('p', { class: 'muted small' }, v.note) : null);
        } catch (e) { rep(box, h('p', { class: 'muted small' }, navigator.onLine ? `Claude check failed (${e.message}). The grade above stands.` : 'Claude check needs a connection. The grade above stands.')); }
        input.focus({ preventScroll: true });
      } }, 'My answer is right');
      box.append(btn);
      return box;
    }
    // H: out of time or Show answer
    function showAnswer() {
      if (state !== 'answer') return;
      stopTimer(); revealed = true;
      const typed = input.value.trim();
      const g = src.grade(entry, full(typed || '-'), move);
      record({ ok: false, ms: elapsed(), revealed: true, g });
      const kids = [];
      if (typed) kids.push(h('p', { class: 'muted small' }, 'You had: ', h('span', { lang: 'de' }, full(typed))));
      kids.push(h('p', { class: 'b1-res muted-ink' }, "Here's one way to say it"), h('p', { class: 'b1-right', lang: 'de' }, g.right));
      if (g.alsoCorrect?.length) kids.push(h('p', { class: 'b1-also' }, alsoMore(g.alsoCorrect)));
      rep(fb, kids, wordCard(entry.item));
      toRetype(g.right);
    }
    // I: new item → study card → type it once
    function showMe() { if (state !== 'answer') return; studyCard(src.grade(entry, full(input.value.trim() || '-'), move), input.value.trim()); }
    function studyCard(g, typed) {
      stopTimer(); revealed = !typed;
      record({ ok: false, ms: elapsed(), revealed: true, g });
      const kids = [];
      if (typed) kids.push(h('p', { class: 'muted small' }, 'You had: ', h('span', { lang: 'de' }, full(typed))));
      kids.push(h('p', { class: 'b1-study' + (String(g.right).length > 90 ? ' long' : ''), lang: 'de' }, g.right));
      if (g.alsoCorrect?.length) kids.push(h('p', { class: 'b1-also' }, h('span', { class: 'muted' }, 'Also correct: '), h('span', { lang: 'de' }, g.alsoCorrect.slice(0, 2).join(' · ')), g.alsoCorrect.length > 2 ? alsoMore(g.alsoCorrect.slice(2)) : null));
      if (entry.item.rule) kids.push(h('p', { class: 'b1-rule' }, entry.item.rule));
      rep(fb, kids, wordCard(entry.item));
      toRetype(g.right);
    }
    function toRetype(right) {
      state = 'retype'; sess.classList.add('fb-on'); entry._right = right;
      clearField(); setPlaceholder('Type it once');
      rep(below, h('button', { type: 'button', class: 'btn b1-sec', onpointerdown: e => e.preventDefault(), onclick: () => skipRetype() }, 'Skip', h('kbd', { class: 'keys-only' }, 'Tab')));
      input.focus({ preventScroll: true });
    }
    function checkRetype(typed) {
      const g = src.grade(entry, full(typed), move, { retype: true });
      if (g.ok && !g.det) {
        state = 'feedback';
        fb.append(h('p', { class: 'muted small b1-back' }, 'It comes back in a few questions.'));
        clearField(); setPlaceholder('Return for next'); rep(below);
        auto = setTimeout(next, 900);
        return;
      }
      input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake');
    }
    function skipRetype() { state = 'feedback'; next(); }

    function next() {
      clearTimeout(auto);
      if (state === 'answer' || state === 'repair' || state === 'pick') return;
      if (!src.advance()) return finish('done');
      drawItem();
    }

    // ---- keys ----
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onReturn(); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (state === 'answer' && entry.isNew) showMe();
        else if (state === 'answer' && limitMs && elapsed() > 2 * limitMs) showAnswer();
        else if (state === 'retype') skipRetype();
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); end(); return; }
      if (e.altKey && (e.key === 'a' || e.key === 'å')) { e.preventDefault(); fb.querySelectorAll('details.b1-more').forEach(d => { d.open = !d.open; }); clearTimeout(auto); return; }
      if (state === 'feedback' && e.key.length === 1 && !e.metaKey && !e.ctrlKey) next();   // typing moves on; the key lands in the next answer
    });
    input.addEventListener('beforeinput', e => { if (e.inputType === 'insertLineBreak') { e.preventDefault(); onReturn(); } });
    const onDocKey = e => {
      if (state === 'pick' && ['1', '2', '3'].includes(e.key)) { e.preventDefault(); pick(+e.key - 1); }
      else if (state === 'pick' && e.key === 'Escape') end();
    };
    document.addEventListener('keydown', onDocKey);

    function cleanup() {
      stopTimer(); clearTimeout(auto);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('keydown', onDocKey);
      vv?.removeEventListener('resize', fit); vv?.removeEventListener('scroll', fit); removeEventListener('resize', fit);
      document.body.classList.remove('focus', 'b1-in-round');
    }
    function end() { cleanup(); src.finish('end'); }
    function finish(r) { cleanup(); src.finish(r); }
    window.__cleanup = cleanup;
    // test hook (localhost only): ?b1auto=N answers N items: the model, every 5th one wrong
    sess._auto = { input, onReturn, get state() { return state; }, get entry() { return entry; } };
    drawItem();
    return sess;
  }
  window.B1Round = { run, fnVerb };
})();
