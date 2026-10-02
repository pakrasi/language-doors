/* B1 trainer: dates. A B1 day is the local date with a 04:00 cutoff (an answer at 01:30 counts for the day before).
   Pure; works in the browser (window.B1Day) and in node (require). */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const DEV = () => typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  // 'YYYY-MM-DD'. ?today=YYYY-MM-DD overrides it, on localhost only (a link on the phone must never fake the date).
  function today(now = new Date(), cutoff = 4) {
    if (DEV()) { const q = new URLSearchParams(location.search).get('today'); if (/^\d{4}-\d{2}-\d{2}$/.test(q || '')) return q; }
    return iso(new Date(now.getTime() - cutoff * 3600e3));
  }
  const add = (d, n) => { const x = parse(d); x.setDate(x.getDate() + n); return iso(x); };
  const diff = (a, b) => Math.round((parse(b) - parse(a)) / 86400e3);   // days from a to b
  function exam() {
    try { const v = JSON.parse(localStorage.getItem('examDate')); if (/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return v; } catch {}
    return '2026-10-09';
  }
  // 'week' (≤ exam−3) · 'lastNew' (exam−2) · 'eve' (exam−1) · 'day' · 'after'
  function phase(t, ex) {
    const d = diff(t, ex);
    return d >= 3 ? 'week' : d === 2 ? 'lastNew' : d === 1 ? 'eve' : d === 0 ? 'day' : 'after';
  }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dow = d => DOW[parse(d).getDay()];
  const label = d => { const x = parse(d); return `${DOW[x.getDay()]} ${x.getDate()} ${MON[x.getMonth()]}`; };   // "Fri 9 Oct"
  const api = { today, add, diff, exam, phase, dow, label, iso, DEV };
  root.B1Day = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
