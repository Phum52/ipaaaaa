/* ตรวจเขต: บันทึกการตรวจความสะอาดประจำวัน พร้อมคะแนน ออฟไลน์ ข้อมูลเก็บในเครื่องเท่านั้น */
(function () {
  'use strict';

  const KEY = 'inspect.v1';
  const VERSION = '1.2';
  const DEFAULT_ITEMS = ['ลานกีฬาเปตอง', 'โต๊ะหินอ่อน', 'ม้านั่งใต้ต้นจามจุรี'];
  const REASONS = ['มีขยะ', 'ใบไม้/ฝุ่นเยอะ', 'เปียก/ลื่น', 'มีคราบสกปรก', 'ชำรุด/เสียหาย'];
  const OFF_REASONS = ['หยุดเรียน', 'วันหยุดนักขัตฤกษ์', 'ฝนตก', 'ป่วย/ลา', 'อื่นๆ'];
  const MAX_PHOTOS = 3;
  const LIM = { name: 60, note: 200, daynote: 300, title: 40, term: 40 };
  const PAGE_DAYS = 45;
  const EPOCH = '1970-01-01';
  const DEF_MAX = 5;
  const DEF_WORK = [1, 2, 3, 4, 5];            // จันทร์-ศุกร์
  const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']; // ดัชนี = getDay()
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ---------- วันที่ (เวลาท้องถิ่น เก็บเป็น YYYY-MM-DD) ---------- */
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  }
  function shift(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }

  const fWeekday = new Intl.DateTimeFormat('th-TH', { weekday: 'long' });
  const fWeekdayS = new Intl.DateTimeFormat('th-TH', { weekday: 'short' });
  const fMonthL = new Intl.DateTimeFormat('th-TH', { month: 'long' });
  const fMonthS = new Intl.DateTimeFormat('th-TH', { month: 'short' });
  const fDayMonth = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
  const be = d => d.getFullYear() + 543;
  const num1 = n => (Math.round(n * 10) / 10).toString();   // 12 หรือ 12.5
  const pctOf = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);

  // สัปดาห์ที่ของเดือน: สัปดาห์ที่ 1 คือสัปดาห์ที่มีวันที่ 1 ของเดือน
  function weekOfMonth(d, ws) {
    const off = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() - ws + 7) % 7;
    return Math.floor((d.getDate() - 1 + off) / 7) + 1;
  }
  // สัปดาห์ที่ของปี: สัปดาห์ที่ 1 คือสัปดาห์ที่มีวันที่ 1 ม.ค.
  function weekOfYear(d, ws) {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const off = (jan1.getDay() - ws + 7) % 7;
    const doy = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - jan1) / DAY);
    return Math.floor((doy + off) / 7) + 1;
  }
  const weekKey = (d, ws) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${weekOfMonth(d, ws)}`;

  /* ---------- ข้อมูล ---------- */
  const str = (v, max) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim().slice(0, max) : '';

  // ภาคเรียนเริ่มต้น (แก้ไขได้ในตั้งค่า): 1 = 15 พ.ค.–31 ต.ค., 2 = 1 พ.ย.–31 มี.ค.
  function defaultTerms() {
    const n = new Date();
    const y = n.getMonth() <= 2 ? n.getFullYear() - 1 : n.getFullYear();
    return [
      { id: uid(), name: `ภาคเรียนที่ 1/${y + 543}`, start: `${y}-05-15`, end: `${y}-10-31` },
      { id: uid(), name: `ภาคเรียนที่ 2/${y + 543}`, start: `${y}-11-01`, end: `${y + 1}-03-31` },
    ];
  }
  function blank() {
    return {
      v: 2, title: '', weekStart: 1, remind: '', startDate: today(),
      maxPer: DEF_MAX, workDays: DEF_WORK.slice(), flip: {}, offWhy: {}, terms: defaultTerms(),
      items: DEFAULT_ITEMS.map(name => ({ id: uid(), name, since: EPOCH, until: '' })),
      days: {},
    };
  }

  function sanitize(raw) {
    const out = blank();
    out.items = []; out.days = {};
    if (!raw || typeof raw !== 'object') return blank();
    out.title = str(raw.title, LIM.title);
    out.weekStart = raw.weekStart === 0 ? 0 : 1;
    out.remind = /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.remind) ? raw.remind : '';
    out.startDate = parseYmd(raw.startDate) ? raw.startDate : today();
    const mp = Number(raw.maxPer);
    out.maxPer = Number.isInteger(mp) && mp >= 1 && mp <= 10 ? mp : DEF_MAX;
    const wd = Array.isArray(raw.workDays) ? [...new Set(raw.workDays.filter(x => Number.isInteger(x) && x >= 0 && x <= 6))] : [];
    out.workDays = wd.length ? wd.sort() : DEF_WORK.slice();
    out.flip = {};
    if (raw.flip && typeof raw.flip === 'object') {
      Object.keys(raw.flip).slice(0, 2000).forEach(k => { if (parseYmd(k) && raw.flip[k]) out.flip[k] = 1; });
    }
    out.offWhy = {};
    if (raw.offWhy && typeof raw.offWhy === 'object') {
      Object.keys(raw.offWhy).slice(0, 2000).forEach(k => { const v = str(raw.offWhy[k], 40); if (parseYmd(k) && v) out.offWhy[k] = v; });
    }
    if (Array.isArray(raw.terms)) {
      out.terms = [];
      raw.terms.slice(0, 30).forEach(t => {
        if (!t || typeof t !== 'object' || !parseYmd(t.start) || !parseYmd(t.end) || t.start > t.end) return;
        out.terms.push({ id: str(t.id, 40) || uid(), name: str(t.name, LIM.term) || 'ภาคเรียน', start: t.start, end: t.end });
      });
    }
    const ids = new Set();
    (Array.isArray(raw.items) ? raw.items : []).slice(0, 50).forEach(i => {
      if (!i || typeof i !== 'object') return;
      const name = str(i.name, LIM.name);
      if (!name) return;
      let id = str(i.id, 40) || uid();
      if (ids.has(id)) id = uid();
      ids.add(id);
      out.items.push({
        id, name,
        since: parseYmd(i.since) ? i.since : EPOCH,
        until: parseYmd(i.until) ? i.until : '',
      });
    });
    let n = 0;
    const src = raw.days && typeof raw.days === 'object' ? raw.days : {};
    Object.keys(src).sort().forEach(k => {
      if (!parseYmd(k) || n >= 5000) return;
      const day = src[k];
      if (!day || typeof day !== 'object') return;
      const r = {};
      const sr = day.r && typeof day.r === 'object' ? day.r : {};
      Object.keys(sr).forEach(id => {
        const x = sr[id];
        if (!ids.has(id) || !x || typeof x !== 'object' || (x.s !== 'c' && x.s !== 'd')) return;
        let p = Number(x.p);
        // ข้อมูลรุ่นเก่า (ไม่มีคะแนน): สะอาด = เต็ม, ไม่สะอาด = 0
        if (x.p === undefined || x.p === null || !isFinite(p) || p < 0 || p > 1000) p = x.s === 'c' ? out.maxPer : 0;
        r[id] = { s: x.s, t: Number(x.t) || 0, n: x.s === 'd' ? str(x.n, LIM.note) : '', p: Math.round(p * 2) / 2 };
      });
      const note = str(day.note, LIM.daynote);
      if (Object.keys(r).length || note) { out.days[k] = { r, note }; n++; }
    });
    return out;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* ใช้ในหน่วยความจำ */ }
    if (!raw) return blank();
    try { return sanitize(JSON.parse(raw)); }
    catch (e) {
      try { localStorage.setItem(KEY + '.bad', raw); } catch (e2) { /* ไม่เป็นไร */ }
      return blank();
    }
  }
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      if (!saveWarned) { saveWarned = true; toast('บันทึกลงเครื่องไม่ได้ ข้อมูลอาจหายเมื่อปิดแอป'); }
    }
  }
  let state = load();
  save();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ไม่เป็นไร */ }


  /* ---------- รูปถ่าย (เก็บใน IndexedDB ในเครื่อง ไม่รวมในข้อมูลสำรอง) ---------- */
  const PH = { db: null, idx: {} };               // idx[วันที่] = จำนวนรูปทั้งวัน
  function phOpen() {
    return new Promise(res => {
      try {
        if (!window.indexedDB) return res(null);
        const r = indexedDB.open('inspect-photos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('p');
        r.onsuccess = () => res(r.result);
        r.onerror = r.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
  }
  function phTx(mode, fn) {
    return new Promise(res => {
      if (!PH.db) return res(null);
      try {
        const t = PH.db.transaction('p', mode);
        const rq = fn(t.objectStore('p'));
        t.oncomplete = () => res(rq && rq.result !== undefined ? rq.result : true);
        t.onerror = t.onabort = () => res(null);
      } catch (e) { res(null); }
    });
  }
  const phKey = (d, id) => d + '|' + id;
  async function phGet(d, id) { const v = await phTx('readonly', s => s.get(phKey(d, id))); return Array.isArray(v) ? v : []; }
  async function phSet(d, id, arr) {
    const ok = arr.length ? await phTx('readwrite', s => s.put(arr, phKey(d, id))) : await phTx('readwrite', s => s.delete(phKey(d, id)));
    return !!ok;
  }
  async function phIndex() {
    PH.idx = {};
    await new Promise(res => {
      if (!PH.db) return res();
      try {
        const rq = PH.db.transaction('p', 'readonly').objectStore('p').openCursor();
        rq.onsuccess = () => {
          const c = rq.result;
          if (!c) return res();
          const d = String(c.key).split('|')[0];
          PH.idx[d] = (PH.idx[d] || 0) + (Array.isArray(c.value) ? c.value.length : 0);
          c.continue();
        };
        rq.onerror = () => res();
      } catch (e) { res(); }
    });
  }
  function shrink(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1280 / Math.max(im.naturalWidth, im.naturalHeight, 1));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/jpeg', 0.72);
      };
      im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      im.src = url;
    });
  }
  let phUrls = [], phToken = 0;
  async function hydratePhotos() {
    const tok = ++phToken;
    const boxes = $$('.thumbs[data-id]');
    const d = curDate();
    const got = await Promise.all(boxes.map(b => phGet(d, b.dataset.id)));
    if (tok !== phToken) return;
    phUrls.forEach(u => URL.revokeObjectURL(u)); phUrls = [];
    boxes.forEach((b, n) => {
      if (!b.isConnected) return;
      b.innerHTML = got[n].map((blob, k) => {
        const u = URL.createObjectURL(blob); phUrls.push(u);
        return `<button type="button" class="thumb" data-action="photo" data-id="${esc(b.dataset.id)}" data-k="${k}" aria-label="ดูรูป"><img src="${u}" alt=""></button>`;
      }).join('');
    });
  }
  async function addPhoto(id, file) {
    const d = curDate();
    if (!file || !item(id)) return;
    const cur = await phGet(d, id);
    if (cur.length >= MAX_PHOTOS) return toast(`แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูปต่อจุด`);
    let blob;
    try { blob = await shrink(file); } catch (e) { return toast('เปิดรูปนี้ไม่ได้'); }
    cur.push(blob);
    if (!(await phSet(d, id, cur))) return toast('บันทึกรูปไม่ได้ (พื้นที่เก็บข้อมูลเต็มหรือถูกบล็อก)');
    PH.idx[d] = (PH.idx[d] || 0) + 1;
    if (curDate() === d) keepScroll(() => render(false));
    toast('แนบรูปแล้ว');
  }
  async function showPhoto(id, k) {
    const d = curDate(), arr = await phGet(d, id);
    if (!arr[k]) return;
    const u = URL.createObjectURL(arr[k]);
    view = { type: 'photo', url: u, d, id, k };
    openSheet(`<div class="sheet-head"><h2>${esc(item(id) ? item(id).name : 'รูป')}<span class="sub">${esc(fDayMonth.format(parseYmd(d)))} · รูปที่ ${k + 1}/${arr.length}</span></h2>${closeBtn}</div>
      <div class="stack"><img class="bigphoto" src="${u}" alt="รูปที่แนบ">
      <button class="btn danger" data-action="photodel">ลบรูปนี้</button></div>`);
  }
  async function delPhoto(btn) {
    if (!arm(btn, 'แตะอีกครั้งเพื่อลบรูป')) return;
    const v = view; if (!v || v.type !== 'photo') return;
    const arr = await phGet(v.d, v.id);
    arr.splice(v.k, 1);
    await phSet(v.d, v.id, arr);
    PH.idx[v.d] = Math.max(0, (PH.idx[v.d] || 1) - 1);
    closeSheet(); render(false); toast('ลบรูปแล้ว');
  }
  async function clearPhotos() { await phTx('readwrite', s => s.clear()); PH.idx = {}; }
  const phReady = phOpen().then(async db => { PH.db = db; await phIndex(); if (db && !sheetOpen) render(false); });

  /* ---------- ตัวช่วยอ่านข้อมูล ---------- */
  const item = id => state.items.find(i => i.id === id);
  function itemsForDay(d) {
    const rec = state.days[d];
    return state.items.filter(i => (i.since <= d && (!i.until || d <= i.until)) || (rec && rec.r[i.id]));
  }
  function ensureDay(d) { return state.days[d] || (state.days[d] = { r: {}, note: '' }); }
  function tidyDay(d) {
    const x = state.days[d];
    if (x && !Object.keys(x.r).length && !x.note) delete state.days[d];
  }

  // วันตรวจ: ตามวันที่ตั้งไว้ (ค่าเริ่มต้น จ.-ศ.) สลับเป็นวันหยุด/วันตรวจพิเศษได้ และวันที่มีการกรอกแล้วถือว่านับเสมอ
  const hasRes = d => { const x = state.days[d]; return !!(x && Object.keys(x.r).length); };
  function defaultWork(d) { return state.workDays.includes(parseYmd(d).getDay()); }
  function isWork(d) { const def = defaultWork(d); return state.flip[d] ? !def : def; }
  const counted = d => hasRes(d) || isWork(d);

  // kind: none | off | missed | pending | partial | issue | clean
  function dayInfo(d) {
    const L = itemsForDay(d), rec = state.days[d];
    let c = 0, bad = 0, got = 0;
    L.forEach(i => {
      const x = rec && rec.r[i.id];
      if (x) { if (x.s === 'c') c++; else bad++; got += Math.min(x.p, state.maxPer); }
    });
    const u = L.length - c - bad;
    let kind;
    if (!L.length) kind = 'none';
    else if (!counted(d)) kind = 'off';
    else if (c + bad === 0) kind = d === today() ? 'pending' : 'missed';
    else if (u > 0) kind = 'partial';
    else kind = bad ? 'issue' : 'clean';
    return { L, c, bad, u, kind, got, max: L.length * state.maxPer };
  }
  const complete = k => k === 'clean' || k === 'issue';
  const skipKind = k => k === 'none' || k === 'off';

  function firstDate() {
    const ks = Object.keys(state.days).sort();
    return ks.length && ks[0] < state.startDate ? ks[0] : state.startDate;
  }

  function streak() {
    const first = firstDate();
    let d = today(), n = 0, guard = 0;
    if (dayInfo(d).kind === 'pending') d = shift(d, -1);
    while (d >= first && guard++ < 4000) {
      const k = dayInfo(d).kind;
      if (skipKind(k)) { d = shift(d, -1); continue; }   // วันหยุดไม่ตัดสถิติ
      if (!complete(k)) break;
      n++; d = shift(d, -1);
    }
    return n;
  }

  /* ---------- รวมคะแนนตามช่วงเวลา ---------- */
  function aggregate(dates) {
    const t = today(), first = firstDate();
    const out = { got: 0, max: 0, days: 0, full: 0, missed: 0, bad: 0, per: {}, list: [] };
    dates.forEach(d => {
      if (d > t || d < first) return;
      const info = dayInfo(d);
      if (skipKind(info.kind)) return;
      if (d === t && info.kind === 'pending') return;
      out.days++; out.got += info.got; out.max += info.max;
      if (complete(info.kind)) out.full++;
      if (info.kind === 'missed') out.missed++;
      const rec = state.days[d];
      info.L.forEach(i => {
        const p = out.per[i.id] || (out.per[i.id] = { got: 0, max: 0, c: 0, d: 0 });
        p.max += state.maxPer;
        const x = rec && rec.r[i.id];
        if (x) { p.got += Math.min(x.p, state.maxPer); p[x.s]++; if (x.s === 'd') out.bad++; }
      });
      out.list.push({ d, info });
    });
    return out;
  }

  const datesBetween = (a, b) => { const o = []; for (let d = a; d <= b && o.length < 800; d = shift(d, 1)) o.push(d); return o; };
  function weekDates(anchor) {
    const ws = state.weekStart, key = weekKey(parseYmd(anchor), ws), out = [];
    for (let k = -6; k <= 6; k++) { const d = shift(anchor, k); if (weekKey(parseYmd(d), ws) === key) out.push(d); }
    return out.sort();
  }
  function monthDates(anchor) {
    const dt = parseYmd(anchor);
    return datesBetween(ymd(new Date(dt.getFullYear(), dt.getMonth(), 1)), ymd(new Date(dt.getFullYear(), dt.getMonth() + 1, 0)));
  }
  const termsSorted = () => [...state.terms].sort((a, b) => a.start.localeCompare(b.start));
  function currentTerm() {
    const ts = termsSorted(), t = today();
    return ts.find(x => x.start <= t && t <= x.end) || [...ts].reverse().find(x => x.start <= t) || ts[0] || null;
  }
  const rangeLabel = (a, b) => {
    const x = parseYmd(a), y = parseYmd(b);
    return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear() ? `${x.getDate()}–${fDayMonth.format(y)}` : `${fDayMonth.format(x)} – ${fDayMonth.format(y)}`;
  };

  /* ---------- สถานะหน้าจอ ---------- */
  let tab = 'today';
  let sel = null;                 // วันที่กำลังดู (null = วันนี้)
  let hist = PAGE_DAYS;
  let sp = 'week';                // สรุป: week | month | term
  let sanchor = null;             // วันอ้างอิงของสัปดาห์/เดือนที่ดูอยู่ (null = วันนี้)
  let sterm = null;               // id ภาคเรียนที่ดูอยู่
  let view = null;
  let sheetOpen = false, sheetPushed = false, ignorePop = 0;
  const curDate = () => sel || today();

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('plain', 'show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function arm(btn, text) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    btn.dataset.orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => {
      if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; }
    }, 3000);
    return false;
  }

  /* ---------- ไอคอน ---------- */
  const I = {
    gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
    prev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    cam: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 016.5 6h1.2l1.3-2h6l1.3 2h1.2A2.5 2.5 0 0120 8.5v8a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5z"/><circle cx="12" cy="12.5" r="3.4"/></svg>',
    img: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-4.5 3.5 3L16 13l4 4"/></svg>',
  };

  /* ---------- หน้าวันนี้ ---------- */
  function topBar() {
    return `<header class="top">
      <div class="top-l">${state.title ? '<span class="hello">ตรวจเขตประจำวัน</span>' : ''}<h1>${esc(state.title || 'ตรวจเขต')}</h1></div>
      <div class="top-r"><button class="round glass" data-action="settings" aria-label="ตั้งค่า">${I.gear}</button></div>
    </header>`;
  }

  function weekChips(dt) {
    const ws = state.weekStart;
    return `<span class="badge">สัปดาห์ที่ ${weekOfMonth(dt, ws)} ของเดือน</span><span class="badge soft">สัปดาห์ที่ ${weekOfYear(dt, ws)} ของปี</span>`;
  }

  function itemCard(i, n, rec, d) {
    const x = rec && rec.r[i.id];
    const s = x ? x.s : '';
    const max = state.maxPer;
    let when = '';
    if (x) when = x.t && ymd(new Date(x.t)) === d ? 'ตรวจ ' + new Date(x.t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' น.' : 'บันทึกย้อนหลัง';
    const p = x ? Math.min(x.p, max) : 0;
    const scoreRow = x ? `<div class="score">
        <div class="sl"><span>คะแนน</span><span class="when">${when}</span></div>
        <div class="sbtns" role="radiogroup" aria-label="คะแนน ${esc(i.name)}">${Array.from({ length: max + 1 }, (_, k) =>
          `<button type="button" class="sb ${p === k ? 'on' : ''}" data-action="score" data-id="${esc(i.id)}" data-v="${k}" role="radio" aria-checked="${p === k}">${k}</button>`).join('')}</div>
      </div>` : '';
    const why = s === 'd' ? `<div class="why">
        <div class="pick">${REASONS.map(r => `<button type="button" class="chip" data-action="reason" data-id="${esc(i.id)}" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
        <input class="input" data-note="${esc(i.id)}" maxlength="${LIM.note}" autocomplete="off" placeholder="สิ่งที่พบ (ไม่ใส่ก็ได้)" value="${esc(x.n || '')}">
      </div>` : '';
    const photoRow = PH.db ? `<div class="photo"><div class="thumbs" data-id="${esc(i.id)}"></div>
        <div class="pbtns">
          <label class="pbtn">${I.cam}<span>ถ่ายรูป</span><input type="file" accept="image/*" capture="environment" data-photo="${esc(i.id)}" hidden></label>
          <label class="pbtn">${I.img}<span>เลือกรูป</span><input type="file" accept="image/*" data-photo="${esc(i.id)}" hidden></label>
        </div></div>` : '';
    return `<section class="item glass ${s === 'c' ? 'ok' : s === 'd' ? 'bad' : ''}">
      <div class="item-h"><span class="n">${n}</span><h3>${esc(i.name)}</h3>${x ? `<span class="pts">${num1(p)}/${max}</span>` : ''}</div>
      <div class="judge" role="radiogroup" aria-label="${esc(i.name)}">
        <button class="j clean ${s === 'c' ? 'on' : ''}" data-action="mark" data-id="${esc(i.id)}" data-v="c" role="radio" aria-checked="${s === 'c'}">${I.ok}สะอาด</button>
        <button class="j dirty ${s === 'd' ? 'on' : ''}" data-action="mark" data-id="${esc(i.id)}" data-v="d" role="radio" aria-checked="${s === 'd'}">${I.no}ไม่สะอาด</button>
      </div>
      ${scoreRow}
      ${why}
      ${photoRow}
    </section>`;
  }

  function todayPage(anim) {
    const d = curDate(), isToday = d === today(), dt = parseYmd(d);
    const info = dayInfo(d), rec = state.days[d];
    const marked = info.c + info.bad;
    const pct = info.L.length ? marked / info.L.length : 0;
    const off = info.kind === 'off';
    let body;
    if (!info.L.length) {
      body = `<div class="empty glass"><div class="mark">${I.cal.replace('width="18" height="18"', 'width="40" height="40"')}</div>
        <h2>ยังไม่มีรายการที่ต้องตรวจ</h2><p>เพิ่มจุดที่ต้องตรวจได้ที่ตั้งค่า เช่น ลานกีฬา โต๊ะ ม้านั่ง</p>
        <button class="btn primary" data-action="settings">ไปที่ตั้งค่า</button></div>`;
    } else {
      body = info.L.map((i, k) => itemCard(i, k + 1, rec, d)).join('');
      if (complete(info.kind)) {
        body += info.bad
          ? `<div class="done-banner issue">ตรวจครบแล้ว พบจุดไม่สะอาด ${info.bad} จุด · ${num1(info.got)}/${info.max} คะแนน</div>`
          : `<div class="done-banner">ตรวจครบแล้ว สะอาดทุกจุด · ${num1(info.got)}/${info.max} คะแนน</div>`;
      }
      body += `<div class="field"><label for="day-note">โน้ตของวันนี้ (ไม่ใส่ก็ได้)</label>
        <textarea class="input" id="day-note" maxlength="${LIM.daynote}" placeholder="เช่น ฝนตกช่วงเช้า">${esc(rec ? rec.note : '')}</textarea></div>`;
    }
    const why = state.offWhy[d] || '';
    const offBanner = off ? `<div class="off-banner"><b>${esc(why ? `${fWeekday.format(dt)}หยุด · ${why}` : `${fWeekday.format(dt)}เป็นวันหยุด ไม่ต้องตรวจ`)}</b><span>ไม่คิดเป็นวันลืมตรวจและไม่นับคะแนน ถ้าตรวจก็กรอกได้เลย</span>
      <div class="pick wrap-chips">${OFF_REASONS.map(r => `<button type="button" class="chip ${why === r ? 'on' : ''}" data-action="offwhy" data-v="${esc(r)}" aria-pressed="${why === r}">${esc(r)}</button>`).join('')}</div></div>` : '';
    const flipBtn = hasRes(d) ? '' : (isWork(d)
      ? `<button class="btn primary flip" data-action="flip">${isToday ? 'วันนี้หยุด (ไม่ได้ตรวจ)' : 'วันนั้นหยุด (ไม่ได้ตรวจ)'}</button>`
      : `<button class="btn soft flip" data-action="flip">ตั้งเป็นวันตรวจ</button>`);
    return `<div class="wrap${anim ? ' enter' : ''}">
      ${topBar()}
      <section class="today-card glass deep">
        <div class="lbl">${esc(fWeekday.format(dt))}${isToday ? ' · วันนี้' : ''}${off ? ' · วันหยุด' : ''}</div>
        <div class="num">${dt.getDate()} ${esc(fMonthS.format(dt))}<small>${be(dt)}</small></div>
        <div class="chips-row">${weekChips(dt)}</div>
        ${info.L.length ? `<div class="prog"><span>ตรวจแล้ว ${marked}/${info.L.length} จุด</span><span class="sc">คะแนน ${num1(info.got)}/${info.max}</span></div>
        <div class="bar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` : ''}
      </section>
      <div class="datebar">
        <button class="round glass" data-action="prevday" aria-label="วันก่อนหน้า">${I.prev}</button>
        <label class="datechip glass">${I.cal}<span>เลือกวันที่</span>
          <input type="date" id="jump" max="${today()}" value="${d}" aria-label="เลือกวันที่"></label>
        <button class="round glass" data-action="nextday" aria-label="วันถัดไป" ${isToday ? 'disabled' : ''}>${I.next}</button>
      </div>
      ${isToday ? '' : `<p class="past-note">กำลังดูย้อนหลัง · กรอกวันที่ลืมได้เลย</p>
        <button class="btn soft back-today" data-action="gotoday">กลับมาวันนี้</button>`}
      ${offBanner}
      ${off ? '' : flipBtn}
      ${body}
      ${off ? flipBtn : ''}
    </div>`;
  }

  /* ---------- หน้าประวัติ ---------- */
  function dayRow(d) {
    const dt = parseYmd(d), info = dayInfo(d);
    const sc = `${num1(info.got)}/${info.max}`;
    let sub;
    switch (info.kind) {
      case 'clean': sub = `<span class="dsub clean">สะอาดทุกจุด · ${sc} คะแนน</span>`; break;
      case 'issue': sub = `<span class="dsub issue">ไม่สะอาด ${info.bad} จุด · ${sc} คะแนน</span>`; break;
      case 'partial': sub = `<span class="dsub">ตรวจแล้ว ${info.c + info.bad}/${info.L.length} จุด · ${sc} คะแนน</span>`; break;
      case 'missed': sub = `<span class="dsub missed">ลืมตรวจ · 0/${info.max} คะแนน</span>`; break;
      case 'pending': sub = '<span class="dsub">ยังไม่ได้ตรวจ</span>'; break;
      case 'off': sub = `<span class="dsub">วันหยุด${state.offWhy[d] ? ' · ' + esc(state.offWhy[d]) : ''}</span>`; break;
      default: sub = '<span class="dsub">ไม่มีจุดตรวจ</span>';
    }
    const rec = state.days[d];
    const dots = info.L.map(i => { const x = rec && rec.r[i.id]; return `<i class="${x ? x.s : ''}"></i>`; }).join('');
    return `<button class="day glass" data-action="goday" data-d="${d}">
      <span class="dnum ${info.kind}"><b>${dt.getDate()}</b><small>${esc(fWeekdayS.format(dt))}</small></span>
      <span class="dinfo"><span class="dname">${esc(fWeekday.format(dt))}ที่ ${esc(fDayMonth.format(dt))}</span>${sub}</span>
      ${PH.idx[d] ? `<span class="cami" aria-label="มีรูป ${PH.idx[d]} รูป">${I.cam}</span>` : ''}
      <span class="dots" aria-hidden="true">${info.kind === 'off' ? '' : dots}</span>
    </button>`;
  }

  function historyPage(anim) {
    const t = today(), first = firstDate();
    const all = [];
    for (let d = t; d >= first && all.length < 5000; d = shift(d, -1)) {
      const k = dayInfo(d).kind;
      if (!skipKind(k) || (k === 'off' && state.flip[d] && defaultWork(d))) all.push(d);   // ไม่แสดงเสาร์-อาทิตย์ (ยกเว้นวันที่มีการกรอก) แต่แสดงวันที่ตั้งเป็นวันหยุดเอง
    }
    const shown = all.slice(0, hist);
    const groups = [];
    shown.forEach(d => {
      const dt = parseYmd(d), k = weekKey(dt, state.weekStart);
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push(g = { k, dt, days: [] });
      g.days.push(d);
    });
    const body = groups.map(g => {
      const a = aggregate(g.days);
      return `<div class="group-h"><span class="gt"><b>สัปดาห์ที่ ${weekOfMonth(g.dt, state.weekStart)} · ${esc(fMonthL.format(g.dt))} ${be(g.dt)}</b>
        <small>คะแนนรวม ${num1(a.got)}/${a.max} (${pctOf(a.got, a.max)}%) · ตรวจครบ ${a.full}/${a.days} วัน</small></span>
        <button class="copy" data-action="copyweek" data-d="${g.days[0]}">คัดลอก</button></div>
        <div class="list">${g.days.map(dayRow).join('')}</div>`;
    }).join('');
    return `<div class="wrap${anim ? ' enter' : ''}">
      <header class="top"><div class="top-l"><h1>ประวัติ</h1></div>
        <div class="top-r"><button class="round glass" data-action="settings" aria-label="ตั้งค่า">${I.gear}</button></div></header>
      <p class="note">แตะวันที่เพื่อดูหรือกรอกย้อนหลัง · วันเสาร์-อาทิตย์ไม่แสดงและไม่นับ · กด "คัดลอก" เพื่อเอารายงานสัปดาห์ไปวางใน LINE</p>
      ${body}
      ${all.length > hist ? '<button class="btn soft more" data-action="more">ดูย้อนหลังเพิ่ม</button>' : ''}
    </div>`;
  }

  /* ---------- หน้าสรุปคะแนน ---------- */
  function periodInfo() {
    const t = today();
    if (sp === 'term') {
      const ts = termsSorted();
      if (!ts.length) return { kind: 'term', empty: true };
      let idx = ts.findIndex(x => x.id === sterm);
      if (idx < 0) { const c = currentTerm(); idx = ts.findIndex(x => x.id === c.id); }
      const term = ts[idx];
      return {
        kind: 'term', title: term.name, sub: rangeLabel(term.start, term.end), dates: datesBetween(term.start, term.end),
        prev: idx > 0 ? ts[idx - 1].id : null, next: idx < ts.length - 1 ? ts[idx + 1].id : null,
      };
    }
    const anchor = sanchor || t;
    if (sp === 'month') {
      const dates = monthDates(anchor), dt = parseYmd(anchor);
      return {
        kind: 'month', title: `${fMonthL.format(dt)} ${be(dt)}`, sub: `${dates.length} วัน`, dates,
        prev: shift(dates[0], -1), next: shift(dates[dates.length - 1], 1) <= t ? shift(dates[dates.length - 1], 1) : null,
      };
    }
    const dates = weekDates(anchor), dt = parseYmd(dates[0]);
    return {
      kind: 'week', title: `สัปดาห์ที่ ${weekOfMonth(dt, state.weekStart)} · ${fMonthL.format(dt)} ${be(dt)}`,
      sub: `${rangeLabel(dates[0], dates[dates.length - 1])} · สัปดาห์ที่ ${weekOfYear(dt, state.weekStart)} ของปี`, dates,
      prev: shift(dates[0], -1), next: shift(dates[dates.length - 1], 1) <= t ? shift(dates[dates.length - 1], 1) : null,
    };
  }

  // แยกย่อย: สัปดาห์ -> รายวัน, เดือน -> รายสัปดาห์, เทอม -> รายเดือน
  function breakdown(kind, a) {
    if (kind === 'week') {
      return a.list.map(x => ({ label: `${fWeekday.format(parseYmd(x.d))}ที่ ${fDayMonth.format(parseYmd(x.d))}`, got: x.info.got, max: x.info.max, short: fWeekdayS.format(parseYmd(x.d)), note: x.info.kind === 'missed' ? 'ลืมตรวจ' : '' }));
    }
    const groups = [];
    a.list.forEach(x => {
      const dt = parseYmd(x.d);
      const k = kind === 'month' ? weekKey(dt, state.weekStart) : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) {
        groups.push(g = {
          k, got: 0, max: 0, days: 0, first: x.d, last: x.d,
          label: kind === 'month' ? `สัปดาห์ที่ ${weekOfMonth(dt, state.weekStart)}` : `${fMonthL.format(dt)} ${be(dt)}`,
          short: kind === 'month' ? `สป.${weekOfMonth(dt, state.weekStart)}` : fMonthS.format(dt),
        });
      }
      g.got += x.info.got; g.max += x.info.max; g.days++; g.last = x.d;
    });
    return groups.map(g => ({ label: g.label + (kind === 'month' ? ` (${rangeLabel(g.first, g.last)})` : ''), got: g.got, max: g.max, short: g.short, note: `${g.days} วัน` }));
  }

  function statsPage(anim) {
    const P = periodInfo();
    const head = `<header class="top"><div class="top-l"><h1>สรุปคะแนน</h1></div>
        <div class="top-r"><button class="round glass" data-action="settings" aria-label="ตั้งค่า">${I.gear}</button></div></header>
      <div class="seg" style="--n:3;--i:${{ week: 0, month: 1, term: 2 }[sp]}" role="tablist">
        <i></i>
        <button class="${sp === 'week' ? 'on' : ''}" data-action="sp" data-v="week" role="tab" aria-selected="${sp === 'week'}">รายสัปดาห์</button>
        <button class="${sp === 'month' ? 'on' : ''}" data-action="sp" data-v="month" role="tab" aria-selected="${sp === 'month'}">รายเดือน</button>
        <button class="${sp === 'term' ? 'on' : ''}" data-action="sp" data-v="term" role="tab" aria-selected="${sp === 'term'}">รายเทอม</button>
      </div>`;
    if (P.empty) {
      return `<div class="wrap${anim ? ' enter' : ''}">${head}
        <div class="empty glass"><h2>ยังไม่ได้ตั้งภาคเรียน</h2><p>ตั้งวันเปิด-ปิดภาคเรียนที่ตั้งค่า เพื่อดูคะแนนรวมรายเทอม</p>
        <button class="btn primary" data-action="settings">ไปที่ตั้งค่า</button></div></div>`;
    }
    const a = aggregate(P.dates);
    const sk = streak();
    const t = today();
    const perRows = state.items.filter(i => a.per[i.id]).map(i => {
      const p = a.per[i.id], pc = pctOf(p.got, p.max);
      return `<div class="rate glass">
        <div class="rate-h"><h3>${esc(i.name)}</h3><b>${num1(p.got)}<small>/${p.max}</small></b></div>
        <div class="bar"><i style="width:${pc}%"></i></div>
        <span class="note">${pc}% · สะอาด ${p.c} ครั้ง · ไม่สะอาด ${p.d} ครั้ง</span>
      </div>`;
    }).join('');
    const rows = breakdown(P.kind, a).map(r => `<div class="brow glass">
        <span class="bl">${esc(r.label)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>
        <span class="bv">${num1(r.got)}<small>/${r.max}</small></span></div>`).join('');
    const bars = breakdown(P.kind, a);
    const chart = bars.length ? `<div class="chart glass" role="img" aria-label="กราฟคะแนนเป็นเปอร์เซ็นต์">
        <div class="cbars" style="--cols:${bars.length}">${bars.map(r => {
          const pc = pctOf(r.got, r.max), lv = r.max ? (pc >= 80 ? 'hi' : pc >= 50 ? 'mid' : 'lo') : 'none';
          return `<div class="cbar ${lv}"><span class="cv">${r.max ? pc + '%' : '–'}</span>
            <div class="ctrack"><i style="height:${r.max ? Math.max(pc, 3) : 0}%"></i></div>
            <span class="cl">${esc(r.short || '')}</span><span class="cs">${num1(r.got)}/${r.max}</span></div>`;
        }).join('')}</div>
        <div class="clegend"><span class="lg hi">80%+</span><span class="lg mid">50–79%</span><span class="lg lo">ต่ำกว่า 50%</span></div>
      </div>` : '';
    const subTitle = P.kind === 'week' ? 'รายวัน' : P.kind === 'month' ? 'รายสัปดาห์' : 'รายเดือน';
    const nowIn = P.dates.includes(t);
    return `<div class="wrap${anim ? ' enter' : ''}">${head}
      <div class="datebar">
        <button class="round glass" data-action="pprev" aria-label="ก่อนหน้า" ${P.prev ? '' : 'disabled'}>${I.prev}</button>
        <div class="datechip glass pnav"><span><b>${esc(P.title)}</b><small>${esc(P.sub)}${nowIn ? ' · ช่วงนี้' : ''}</small></span></div>
        <button class="round glass" data-action="pnext" aria-label="ถัดไป" ${P.next ? '' : 'disabled'}>${I.next}</button>
      </div>
      <section class="today-card glass deep">
        <div class="lbl">คะแนนรวม</div>
        <div class="num">${num1(a.got)}<small>/ ${a.max} คะแนน</small></div>
        <div class="chips-row"><span class="badge">${pctOf(a.got, a.max)}%</span>
          <span class="badge soft">ตรวจ ${a.days} วัน</span>
          ${a.days ? `<span class="badge soft">เฉลี่ย ${num1(a.got / a.days)}/${state.items.filter(i => !i.until).length * state.maxPer} ต่อวัน</span>` : ''}</div>
        <div class="bar"><i style="width:${pctOf(a.got, a.max)}%"></i></div>
      </section>
      <div class="stat-grid">
        <div class="stat good glass"><b>${sk}<small>วัน</small></b><span>ตรวจครบติดต่อกัน</span></div>
        <div class="stat glass"><b>${a.full}<small>/${a.days} วัน</small></b><span>ตรวจครบ</span></div>
        <div class="stat ${a.missed ? 'bad' : ''} glass"><b>${a.missed}<small>วัน</small></b><span>ลืมตรวจ</span></div>
        <div class="stat ${a.bad ? 'bad' : ''} glass"><b>${a.bad}<small>ครั้ง</small></b><span>พบไม่สะอาด</span></div>
      </div>
      ${chart ? `<h2 class="cap-title">กราฟคะแนน${P.kind === 'week' ? 'รายวัน' : P.kind === 'month' ? 'รายสัปดาห์' : 'รายเดือน'}</h2>${chart}` : ''}
      ${perRows ? `<h2 class="cap-title">คะแนนแต่ละจุด</h2>${perRows}` : ''}
      ${rows ? `<h2 class="cap-title">${subTitle}</h2><div class="list">${rows}</div>` : '<p class="note">ยังไม่มีข้อมูลในช่วงนี้</p>'}
      <p class="note">วันเสาร์-อาทิตย์และวันหยุดไม่คิดคะแนนเต็ม · ช่วงที่ยังไม่ถึงวันนี้ไม่นับ</p>
      <button class="btn primary" data-action="copyperiod">คัดลอกรายงาน${P.kind === 'week' ? 'สัปดาห์นี้' : P.kind === 'month' ? 'เดือนนี้' : 'เทอมนี้'}</button>
    </div>`;
  }

  /* ---------- วาดหน้าจอ ---------- */
  function render(anim) {
    $('#app').innerHTML = tab === 'today' ? todayPage(anim) : tab === 'history' ? historyPage(anim) : statsPage(anim);
    if (tab === 'today' && PH.db) hydratePhotos();
    const dock = $('#dock');
    dock.dataset.tab = tab;
    $$('.tab', dock).forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function setTab(t) { tab = t; window.scrollTo(0, 0); render(true); }
  function goDay(d) {
    sel = d === today() ? null : d;
    tab = 'today';
    window.scrollTo(0, 0);
    render(true);
  }
  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  /* ---------- ติ๊กและให้คะแนน ---------- */
  function mark(id, v) {
    const d = curDate();
    if (!item(id)) return;
    const day = ensureDay(d), cur = day.r[id], max = state.maxPer;
    if (cur && cur.s === v) delete day.r[id];
    else {
      let p;
      if (v === 'c') p = max;                                         // สะอาด = เต็ม (ลดได้ด้วยตัวเลือกคะแนน)
      else p = cur && cur.s === 'd' ? cur.p : (cur && cur.p < max ? cur.p : 0);
      day.r[id] = { s: v, t: Date.now(), n: v === 'd' && cur ? cur.n : '', p };
    }
    tidyDay(d);
    save();
    keepScroll(() => render(false));
  }
  function setScore(id, n) {
    const d = curDate();
    if (!item(id)) return;
    const day = ensureDay(d), cur = day.r[id], max = state.maxPer;
    if (cur) cur.p = n;
    else day.r[id] = { s: n >= max ? 'c' : 'd', t: Date.now(), n: '', p: n };
    save();
    keepScroll(() => render(false));
  }
  function flipDay() {
    const d = curDate();
    if (hasRes(d)) return;
    if (state.flip[d]) delete state.flip[d]; else state.flip[d] = 1;
    if (isWork(d)) delete state.offWhy[d];
    save();
    keepScroll(() => render(false));
    toast(isWork(d) ? 'ตั้งเป็นวันตรวจแล้ว' : 'ตั้งเป็นวันหยุดแล้ว ไม่นับเป็นลืมตรวจ');
  }

  function setOffWhy(v) {
    const d = curDate();
    if (hasRes(d) || isWork(d)) return;
    if (state.offWhy[d] === v) delete state.offWhy[d]; else state.offWhy[d] = v;
    save();
    keepScroll(() => render(false));
  }

  /* ---------- รายงานข้อความ (คัดลอกไปวางใน LINE) ---------- */
  function reportHead(extra) {
    return `รายงานตรวจเขต${state.title ? ' ' + state.title : ''}\n${extra}`;
  }
  function weekText(anchor) {
    const ws = state.weekStart, dates = weekDates(anchor), dt = parseYmd(dates[0]);
    const a = aggregate(dates);
    const lines = [reportHead(`สัปดาห์ที่ ${weekOfMonth(dt, ws)} ของเดือน${fMonthL.format(dt)} ${be(dt)} (สัปดาห์ที่ ${weekOfYear(dt, ws)} ของปี)`)];
    lines.push(`คะแนนรวม ${num1(a.got)}/${a.max} (${pctOf(a.got, a.max)}%) ตรวจ ${a.days} วัน${a.missed ? ` ลืมตรวจ ${a.missed} วัน` : ''}`);
    const hol = dates.filter(d => d <= today() && dayInfo(d).kind === 'off' && state.flip[d] && defaultWork(d));
    if (hol.length) lines.push('วันหยุด: ' + hol.map(d => `${fWeekday.format(parseYmd(d))}ที่ ${parseYmd(d).getDate()}${state.offWhy[d] ? ' (' + state.offWhy[d] + ')' : ''}`).join(', '));
    a.list.forEach(({ d, info }) => {
      const x = parseYmd(d), rec = state.days[d];
      lines.push('');
      lines.push(`${fWeekday.format(x)}ที่ ${x.getDate()} ${fMonthL.format(x)} ${be(x)} (${num1(info.got)}/${info.max} คะแนน)`);
      if (info.kind === 'missed') { lines.push('- ไม่ได้ตรวจ'); return; }
      info.L.forEach(i => {
        const r = rec && rec.r[i.id];
        const s = r ? (r.s === 'c' ? `สะอาด ${num1(Math.min(r.p, state.maxPer))}/${state.maxPer}` : `ไม่สะอาด ${num1(Math.min(r.p, state.maxPer))}/${state.maxPer}` + (r.n ? ` (${r.n})` : '')) : 'ยังไม่ได้ตรวจ';
        lines.push(`- ${i.name}: ${s}`);
      });
      if (rec && rec.note) lines.push(`โน้ต: ${rec.note}`);
    });
    return lines.join('\n');
  }
  function periodText(P) {
    if (P.kind === 'week') return weekText(P.dates[0]);
    const a = aggregate(P.dates);
    const lines = [reportHead(P.kind === 'month' ? `ประจำเดือน${P.title}` : `${P.title} (${P.sub})`)];
    lines.push(`คะแนนรวม ${num1(a.got)}/${a.max} (${pctOf(a.got, a.max)}%) ตรวจ ${a.days} วัน${a.missed ? ` ลืมตรวจ ${a.missed} วัน` : ''}`);
    lines.push('');
    lines.push('แยกตามจุด');
    state.items.filter(i => a.per[i.id]).forEach(i => lines.push(`- ${i.name}: ${num1(a.per[i.id].got)}/${a.per[i.id].max}`));
    lines.push('');
    lines.push(P.kind === 'month' ? 'แยกตามสัปดาห์' : 'แยกตามเดือน');
    breakdown(P.kind, a).forEach(r => lines.push(`- ${r.label}: ${num1(r.got)}/${r.max}`));
    return lines.join('\n');
  }
  async function copyText(txt, okMsg) {
    try { await navigator.clipboard.writeText(txt); toast(okMsg); return true; }
    catch (e) {
      view = { type: 'text' };
      openSheet(`<div class="sheet-head"><h2>คัดลอกข้อความนี้</h2>${closeBtn}</div>
        <div class="stack"><textarea class="input mono" id="manual" readonly style="height:240px"></textarea>
        <p class="note">คัดลอกอัตโนมัติไม่ได้ กดค้างที่ข้อความ เลือกทั้งหมด แล้วคัดลอก</p></div>`);
      const ta = $('#manual'); ta.value = txt; ta.focus(); ta.select();
      return false;
    }
  }

  /* ---------- แผ่นล่าง ---------- */
  const closeBtn = '<button class="frost-btn" data-action="close" aria-label="ปิด">×</button>';
  function openSheet(html) {
    const sheet = $('#sheet');
    const first = !sheetOpen;
    $('#sheet-body').innerHTML = html;
    if (first) {
      sheetOpen = true;
      document.body.classList.add('sheet-open');
      sheet.hidden = false;
      try { history.pushState({ sheet: 1 }, ''); sheetPushed = true; } catch (e) { sheetPushed = false; }
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
    }
    $('.panel').scrollTop = 0;
  }
  function hideSheet() {
    if (!sheetOpen) return;
    if (view && view.type === 'photo') URL.revokeObjectURL(view.url);
    sheetOpen = false; sheetPushed = false; view = null;
    document.body.classList.remove('sheet-open');
    const sheet = $('#sheet');
    sheet.classList.remove('open');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setTimeout(() => { if (!sheetOpen) { sheet.hidden = true; $('#sheet-body').innerHTML = ''; } }, 450);
  }
  function closeSheet() {
    if (sheetPushed) { ignorePop++; hideSheet(); history.back(); } else hideSheet();
  }
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    if (sheetOpen) hideSheet();
  });
  function unwindAll() {
    const n = sheetPushed ? 1 : 0;
    sheetPushed = false;
    hideSheet();
    render(true);
    if (n) { try { history.go(-n); } catch (e) { /* ไม่เป็นไร */ } }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

  /* ---------- แจ้งเตือนรายวัน (ใช้ได้เฉพาะในแอป APK) ---------- */
  function notifier() {
    try {
      const c = window.Capacitor;
      if (c && c.isNativePlatform && c.isNativePlatform() && c.registerPlugin) return c.registerPlugin('LocalNotifications');
    } catch (e) { /* ไม่เป็นไร */ }
    return null;
  }
  async function applyReminder(askPermission) {
    const ln = notifier();
    if (!ln) return false;
    try {
      await ln.cancel({ notifications: [{ id: 1 }] });
      if (!state.remind) return true;
      if (askPermission) {
        const p = await ln.requestPermissions();
        if (!p || p.display !== 'granted') { toast('ยังไม่ได้อนุญาตการแจ้งเตือน ไปเปิดที่ตั้งค่าของเครื่อง'); return false; }
      }
      const [h, m] = state.remind.split(':').map(Number);
      await ln.schedule({ notifications: [{
        id: 1,
        title: 'ถึงเวลาตรวจเขตแล้ว',
        body: state.items.filter(i => !i.until).map(i => i.name).join(' · ').slice(0, 120) || 'อย่าลืมบันทึกการตรวจวันนี้',
        schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
      }] });
      return true;
    } catch (e) {
      toast('ตั้งแจ้งเตือนไม่สำเร็จ: ' + String((e && e.message) || e).slice(0, 80));
      return false;
    }
  }

  /* ---------- ตั้งค่า ---------- */
  function itemRows() {
    const act = state.items.filter(i => !i.until);
    return act.map((i, k) => `<div class="irow">
      <input class="input i-name" data-id="${esc(i.id)}" maxlength="${LIM.name}" value="${esc(i.name)}" aria-label="ชื่อจุดตรวจ">
      <button class="frost-btn" data-action="imove" data-id="${esc(i.id)}" data-v="-1" aria-label="เลื่อนขึ้น" ${k === 0 ? 'disabled' : ''}>↑</button>
      <button class="frost-btn" data-action="imove" data-id="${esc(i.id)}" data-v="1" aria-label="เลื่อนลง" ${k === act.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="frost-btn del" data-action="idel" data-id="${esc(i.id)}" aria-label="ลบ">×</button>
    </div>`).join('');
  }
  function refreshItems() { const box = $('#items'); if (box) box.innerHTML = itemRows(); refreshTotals(); }
  function refreshTotals() {
    const el = $('#max-total');
    if (el) el.textContent = `จุดตรวจ ${state.items.filter(i => !i.until).length} จุด รวมเต็มวันละ ${state.items.filter(i => !i.until).length * state.maxPer} คะแนน`;
  }
  function termRows() {
    return termsSorted().map(t => `<div class="tcard glass" data-id="${esc(t.id)}">
      <div class="irow"><input class="input t-name" data-id="${esc(t.id)}" maxlength="${LIM.term}" value="${esc(t.name)}" aria-label="ชื่อภาคเรียน">
        <button class="frost-btn del" data-action="tdel" data-id="${esc(t.id)}" aria-label="ลบภาคเรียน">×</button></div>
      <div class="row2">
        <div class="field"><label>เปิดเทอม</label><input class="input t-start" data-id="${esc(t.id)}" type="date" value="${esc(t.start)}"></div>
        <div class="field"><label>ปิดเทอม</label><input class="input t-end" data-id="${esc(t.id)}" type="date" value="${esc(t.end)}"></div>
      </div></div>`).join('');
  }

  function showSettings() {
    view = { type: 'settings' };
    const native = !!notifier();
    openSheet(`
      <div class="sheet-head"><h2>ตั้งค่า<span class="sub">ตรวจเขต เวอร์ชัน ${VERSION} · ข้อมูลอยู่ในเครื่องนี้เท่านั้น</span></h2>${closeBtn}</div>
      <div class="stack">
        <div class="field"><label for="p-title">ชื่อเขต/พื้นที่ (ไม่ใส่ก็ได้)</label>
          <input class="input" id="p-title" maxlength="${LIM.title}" autocomplete="off" placeholder="เช่น เขต 3 หมู่บ้านสุขใจ" value="${esc(state.title)}"></div>

        <div class="sect">จุดที่ต้องตรวจ</div>
        <div class="stack" style="margin-top:0;gap:8px" id="items">${itemRows()}</div>
        <div class="irow"><input class="input" id="n-item" maxlength="${LIM.name}" autocomplete="off" placeholder="เพิ่มจุดตรวจใหม่ เช่น ห้องน้ำ">
          <button class="btn primary" style="height:46px;padding:0 18px" data-action="iadd">เพิ่ม</button></div>

        <div class="sect">คะแนนเต็มต่อจุด</div>
        <div class="field"><input class="input" id="s-max" type="number" inputmode="numeric" min="1" max="10" value="${state.maxPer}" aria-label="คะแนนเต็มต่อจุด"></div>
        <p class="note" id="max-total"></p>

        <div class="sect">วันที่ต้องตรวจ</div>
        <div class="pick wrap-chips" id="wd">${DOW_ORDER.map(k => `<button type="button" class="chip ${state.workDays.includes(k) ? 'on' : ''}" data-action="wd" data-v="${k}" role="checkbox" aria-checked="${state.workDays.includes(k)}">${DOW[k]}</button>`).join('')}</div>
        <p class="note">วันที่ไม่เลือกไม่นับเป็นลืมตรวจ และไม่คิดคะแนนเต็ม (ค่าเริ่มต้น จันทร์-ศุกร์) ถ้ามีวันหยุดพิเศษ เปิดวันนั้นในหน้า "วันนี้" แล้วกดตั้งเป็นวันหยุด</p>

        <div class="sect">ภาคเรียน (ใช้รวมคะแนนรายเทอม)</div>
        <div class="stack" style="margin-top:0;gap:10px" id="terms">${termRows()}</div>
        <button class="btn soft" data-action="tadd">เพิ่มภาคเรียน</button>

        <div class="sect">สัปดาห์เริ่มวัน</div>
        <div class="seg two" id="ws" style="--i:${state.weekStart === 0 ? 1 : 0}">
          <i></i>
          <button class="${state.weekStart === 1 ? 'on' : ''}" data-action="ws" data-v="1">จันทร์</button>
          <button class="${state.weekStart === 0 ? 'on' : ''}" data-action="ws" data-v="0">อาทิตย์</button>
        </div>
        <p class="note">สัปดาห์ที่ของเดือน: สัปดาห์ที่มีวันที่ 1 นับเป็นสัปดาห์ที่ 1</p>

        <div class="sect">แจ้งเตือนไม่ให้ลืมตรวจ</div>
        ${native ? `<div class="row2">
            <input class="input" id="r-time" type="time" value="${esc(state.remind || '08:00')}" aria-label="เวลาแจ้งเตือน">
            <button class="btn primary" data-action="remindon">${state.remind ? 'เปลี่ยนเวลา' : 'เปิดแจ้งเตือน'}</button></div>
          <p class="note">${state.remind ? `เปิดอยู่ ทุกวันเวลา ${esc(state.remind)} น.` : 'ปิดอยู่'}</p>
          ${state.remind ? '<button class="btn soft" data-action="remindoff">ปิดแจ้งเตือน</button>' : ''}`
          : '<p class="note">การแจ้งเตือนใช้ได้เฉพาะแอปที่ติดตั้งจากไฟล์ APK ชุดนี้ ไม่ทำงานบนเว็บหรือเบราว์เซอร์</p>'}

        <div class="sect">สำรองข้อมูล</div>
        <div class="field"><label for="backup">ข้อมูลสำรอง (คัดลอกเก็บไว้ในที่ปลอดภัย)</label>
          <textarea class="input mono" id="backup" readonly></textarea></div>
        <button class="btn primary" data-action="copybackup">คัดลอกข้อมูลสำรอง</button>
        <div class="field"><label for="restore">กู้คืนจากข้อมูลสำรอง</label>
          <textarea class="input mono" id="restore" placeholder="วางข้อมูลสำรองที่นี่"></textarea></div>
        <button class="btn soft" data-action="restore">กู้คืนข้อมูล</button>
        <button class="btn danger" data-action="erase">ลบข้อมูลทั้งหมด</button>
        <p class="note">ถ้าถอนการติดตั้งแอปหรือล้างข้อมูลแอป ข้อมูลจะหาย ควรคัดลอกข้อมูลสำรองไว้เป็นระยะ (รูปถ่ายไม่รวมในข้อมูลสำรอง)</p>
      </div>`);
    $('#backup').value = JSON.stringify(state);
    refreshTotals();
  }

  async function copyBackup() {
    const ta = $('#backup');
    try { await navigator.clipboard.writeText(ta.value); toast('คัดลอกแล้ว นำไปวางเก็บไว้ได้เลย'); }
    catch (e) { ta.focus(); ta.select(); toast('คัดลอกอัตโนมัติไม่ได้ กดค้างที่ข้อความแล้วเลือกคัดลอก'); }
  }

  function restore(btn) {
    const txt = $('#restore').value.trim();
    if (!txt) return toast('วางข้อมูลสำรองก่อนนะ');
    let parsed;
    try { parsed = JSON.parse(txt); } catch (e) { return toast('ข้อมูลสำรองไม่ถูกต้อง'); }
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.days !== 'object' || !parsed.days) return toast('ข้อมูลสำรองไม่ถูกต้อง');
    const clean = sanitize(parsed);
    if (!arm(btn, 'แตะอีกครั้งเพื่อแทนที่ข้อมูลปัจจุบัน')) return;
    state = clean; sel = null; sanchor = null; sterm = null;
    save(); unwindAll();
    toast(`กู้คืนแล้ว ${Object.keys(clean.days).length} วัน`);
    applyReminder(false);
  }

  function moveItem(id, dir) {
    const act = state.items.filter(i => !i.until);
    const k = act.findIndex(i => i.id === id), j = k + dir;
    if (k < 0 || j < 0 || j >= act.length) return;
    const a = state.items.indexOf(act[k]), b = state.items.indexOf(act[j]);
    [state.items[a], state.items[b]] = [state.items[b], state.items[a]];
    save(); refreshItems(); render(false);
  }
  function addItem() {
    const inp = $('#n-item'), name = inp.value.trim().slice(0, LIM.name);
    if (!name) { toast('พิมพ์ชื่อจุดตรวจก่อนนะ'); inp.focus(); return; }
    if (state.items.filter(i => !i.until).length >= 30) { toast('เพิ่มได้ไม่เกิน 30 จุด'); return; }
    state.items.push({ id: uid(), name, since: today(), until: '' });
    save(); inp.value = ''; refreshItems(); render(false);
    toast('เพิ่มแล้ว');
  }
  function delItem(btn) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1'; btn.dataset.orig = btn.textContent;
      btn.textContent = 'ลบ?'; btn.classList.add('armed');
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; btn.classList.remove('armed'); } }, 3000);
      return;
    }
    const i = item(btn.dataset.id);
    if (!i) return;
    const t = today();
    if (state.days[t]) { delete state.days[t].r[i.id]; tidyDay(t); }
    i.until = shift(t, -1);
    save(); refreshItems(); render(false);
    toast('ลบจุดตรวจแล้ว (ประวัติเก่ายังอยู่)');
  }

  function addTerm() {
    if (state.terms.length >= 30) return toast('เพิ่มได้ไม่เกิน 30 ภาคเรียน');
    const t = today();
    state.terms.push({ id: uid(), name: 'ภาคเรียนใหม่', start: t, end: shift(t, 120) });
    save(); $('#terms').innerHTML = termRows();
  }
  function delTerm(btn) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1'; btn.dataset.orig = btn.textContent;
      btn.textContent = 'ลบ?'; btn.classList.add('armed');
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; btn.classList.remove('armed'); } }, 3000);
      return;
    }
    state.terms = state.terms.filter(t => t.id !== btn.dataset.id);
    if (sterm === btn.dataset.id) sterm = null;
    save(); $('#terms').innerHTML = termRows(); render(false);
  }
  function editTerm(el) {
    const t = state.terms.find(x => x.id === el.dataset.id);
    if (!t) return;
    if (el.classList.contains('t-name')) {
      const v = el.value.trim().slice(0, LIM.term);
      if (!v) { el.value = t.name; return; }
      t.name = v;
    } else {
      const k = el.classList.contains('t-start') ? 'start' : 'end';
      if (!parseYmd(el.value)) { el.value = t[k]; return; }
      const n = Object.assign({}, t, { [k]: el.value });
      if (n.start > n.end) { el.value = t[k]; toast('วันเปิดเทอมต้องไม่เกินวันปิดเทอม'); return; }
      t[k] = el.value;
    }
    save(); render(false);
  }

  /* ---------- จัดการการกด ---------- */
  function stepPeriod(dir) {
    const P = periodInfo();
    const target = dir < 0 ? P.prev : P.next;
    if (!target) return;
    if (sp === 'term') sterm = target; else sanchor = target;
    render(false);
  }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'tab': setTab(el.dataset.tab); break;
      case 'mark': mark(id, el.dataset.v); break;
      case 'score': setScore(id, Number(el.dataset.v)); break;
      case 'flip': flipDay(); break;
      case 'offwhy': setOffWhy(el.dataset.v); break;
      case 'photo': showPhoto(id, Number(el.dataset.k)); break;
      case 'photodel': delPhoto(el); break;
      case 'reason': {
        const inp = $(`[data-note="${CSS.escape(id)}"]`);
        if (!inp) break;
        const cur = inp.value.trim();
        if (cur.includes(el.dataset.v)) break;
        inp.value = (cur ? cur + ', ' : '') + el.dataset.v;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      }
      case 'prevday': goDay(shift(curDate(), -1)); break;
      case 'nextday': if (curDate() < today()) goDay(shift(curDate(), 1)); break;
      case 'gotoday': goDay(today()); break;
      case 'goday': goDay(el.dataset.d); break;
      case 'more': hist += PAGE_DAYS; render(false); break;
      case 'sp': sp = el.dataset.v; sanchor = null; render(false); break;
      case 'pprev': stepPeriod(-1); break;
      case 'pnext': stepPeriod(1); break;
      case 'copyweek': copyText(weekText(el.dataset.d), 'คัดลอกรายงานแล้ว นำไปวางใน LINE ได้เลย'); break;
      case 'copyperiod': { const P = periodInfo(); if (!P.empty) copyText(periodText(P), 'คัดลอกรายงานแล้ว นำไปวางใน LINE ได้เลย'); break; }
      case 'settings': showSettings(); break;
      case 'iadd': addItem(); break;
      case 'imove': moveItem(id, Number(el.dataset.v)); break;
      case 'idel': delItem(el); break;
      case 'tadd': addTerm(); break;
      case 'tdel': delTerm(el); break;
      case 'wd': {
        const k = Number(el.dataset.v), on = state.workDays.includes(k);
        if (on && state.workDays.length === 1) { toast('ต้องเลือกอย่างน้อย 1 วัน'); break; }
        state.workDays = on ? state.workDays.filter(x => x !== k) : [...state.workDays, k].sort();
        el.classList.toggle('on', !on); el.setAttribute('aria-checked', String(!on));
        save(); render(false);
        break;
      }
      case 'ws': {
        state.weekStart = el.dataset.v === '0' ? 0 : 1;
        save();
        const seg = $('#ws');
        seg.style.setProperty('--i', state.weekStart === 0 ? 1 : 0);
        $$('button', seg).forEach(b => b.classList.toggle('on', b === el));
        render(false);
        break;
      }
      case 'remindon': {
        const v = $('#r-time').value;
        if (!/^\d{2}:\d{2}$/.test(v)) { toast('เลือกเวลาก่อนนะ'); break; }
        state.remind = v; save();
        applyReminder(true).then(ok => { if (ok) { toast(`ตั้งแจ้งเตือนทุกวัน ${v} น. แล้ว`); if (sheetOpen && view && view.type === 'settings') showSettings(); } });
        break;
      }
      case 'remindoff':
        state.remind = ''; save();
        applyReminder(false).then(() => { toast('ปิดแจ้งเตือนแล้ว'); if (sheetOpen && view && view.type === 'settings') showSettings(); });
        break;
      case 'copybackup': copyBackup(); break;
      case 'restore': restore(el); break;
      case 'erase':
        if (!arm(el, 'แตะอีกครั้งเพื่อลบทุกอย่าง')) break;
        state = blank(); sel = null; sanchor = null; sterm = null; save(); clearPhotos(); unwindAll();
        toast('ลบข้อมูลทั้งหมดแล้ว');
        applyReminder(false);
        break;
      case 'close': closeSheet(); break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.note) {
      const day = state.days[curDate()], x = day && day.r[t.dataset.note];
      if (x && x.s === 'd') { x.n = t.value.trim().slice(0, LIM.note); save(); }
    } else if (t.id === 'day-note') {
      const d = curDate(), v = t.value.trim().slice(0, LIM.daynote);
      if (v) ensureDay(d).note = v; else if (state.days[d]) state.days[d].note = '';
      tidyDay(d); save();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.photo && t.type === 'file') {
      const f = t.files && t.files[0];
      addPhoto(t.dataset.photo, f);
      t.value = '';
      return;
    }
    if (t.id === 'jump') {
      if (parseYmd(t.value) && t.value <= today()) goDay(t.value);
      else if (t.value) toast('เลือกวันในอนาคตไม่ได้');
    } else if (t.id === 'p-title') {
      state.title = t.value.trim().slice(0, LIM.title); save(); render(false);
    } else if (t.id === 's-max') {
      const v = Math.round(Number(t.value));
      if (!(v >= 1 && v <= 10)) { t.value = state.maxPer; toast('ใส่คะแนนเต็ม 1-10'); return; }
      state.maxPer = v; t.value = v; save(); refreshTotals(); render(false);
    } else if (t.classList && (t.classList.contains('t-name') || t.classList.contains('t-start') || t.classList.contains('t-end'))) {
      editTerm(t);
    } else if (t.classList && t.classList.contains('i-name')) {
      const i = item(t.dataset.id), v = t.value.trim().slice(0, LIM.name);
      if (!i) return;
      if (!v) { t.value = i.name; toast('ชื่อจุดตรวจต้องไม่ว่าง'); return; }
      i.name = v; save(); render(false);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.id === 'n-item') { e.preventDefault(); addItem(); }
  });

  // ข้ามวัน: เมื่อกลับเข้าแอป ให้ขึ้นวันใหม่
  let shownDay = today();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (shownDay !== today()) {
      shownDay = today();
      if (!sheetOpen) render(false);
    }
  });

  render(true);
  if (state.remind) applyReminder(false);
})();
