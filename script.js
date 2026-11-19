'use strict';
/* ===================== الإعدادات (عدّل هنا فقط) ===================== */
const CONFIG = {
  PROJECT_NAME: 'تقييم المدربين والطلاب في المساجد', // عنوان الصفحة في المتصفح
  ACADEMY_NAME: 'ROBOGEEX academy',   // يظهر بدل الشعار إذا تعذّر تحميله
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwfknWGPWZm2WJsnETI8s8vkDv-NIuMoYfWWr0MLiNsnKLsOa3Xm99F59LHO3064l4e/exec',
  CSV_URL: 'data/students.csv',     // ملف الأسماء
};
const OPTIONS = {
  majors: ['هندسة حاسوب', 'هندسة كهرباء', 'هندسة ميكانيك', 'علوم حاسوب', 'تقنية معلومات'],
  years: ['أولى', 'ثانية', 'ثالثة', 'رابعة', 'خامسة', 'خريج'],
  trained: ['0', '1-10', '11-30', '31-60', 'أكثر من 60'],
  otherSkills: ['تصميم', 'مونتاج', 'كهرباء', 'لحام', 'لغات', 'إلقاء', 'تصوير'],
};
const SECTIONS = { students: 'تقييم الطلاب', trainer: 'معلومات عن المدرب' };

/* ===================== تعريف النماذج ===================== */
const YN = ['نعم', 'لا'];
const nameField = (m) => ({ id: 'trainer', label: 'اسم المدرب', type: 'choice', options: m.trainers, own: 'اكتب اسمك إن لم تجده في القائمة' });
const studentFields = (m) => [
  nameField(m),
  { id: 'attendance', label: 'الالتزام بالحضور', type: 'rate' },
  { id: 'programming', label: 'المستوى البرمجي', type: 'rate' },
  { id: 'creativity', label: 'الإبداع', type: 'rate' },
  { id: 'recommend', label: 'هل ترشّح الطالب للمستوى 2؟', type: 'choice', options: YN, yn: true },
];
const trainerFields = (m) => [
  nameField(m),
  { id: 'trainability', label: 'قابلية التدريب', type: 'rate' },
  { id: 'newTrainings', label: 'قابلية المشاركة في تدريبات جديدة', type: 'choice', options: ['نعم', 'لا', 'ربما'], yn: true },
  { id: 'major', label: 'الاختصاص الجامعي', type: 'choice', options: OPTIONS.majors, own: 'اكتب اختصاصاً آخر' },
  { id: 'year', label: 'السنة الجامعية', type: 'choice', options: OPTIONS.years },
  { id: 'trained', label: 'عدد الطلاب الذين دربتهم سابقاً', type: 'choice', options: OPTIONS.trained },
  { id: 'skill_prog', label: 'البرمجة', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_ai', label: 'الذكاء الاصطناعي', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_mech', label: 'الميكانيك', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_3d', label: 'الطباعة ثلاثية الأبعاد', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_office', label: 'الأدوات المكتبية', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_robot', label: 'الروبوت', type: 'rate', group: 'مستوى المهارات' },
  { id: 'otherSkills', label: 'مهارات أخرى (اختياري)', type: 'multi', options: OPTIONS.otherSkills, own: 'أضف مهارة أخرى', optional: true },
];
const fieldsOf = (f) => (f.kind === 'student' ? studentFields : trainerFields)(MOS[f.mosque]);

/* ===================== أدوات مساعدة ===================== */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا')
  .replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* التخزين غير متاح */ } },
};
function parseCSV(t) {
  t = t.replace(/^﻿/, '');
  const rows = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f); f = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  row.push(f); if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

/* ===================== الحالة ===================== */
let MOSQUES = [];             // [{ name, area, students:[{key,name,mosque,area}], trainers:[أسماء] }]
const MOS = {};               // اسم المسجد -> نفس الكائن
let store = LS.get('mev2', { students: {}, trainers: {}, queue: [], me: null });
const persist = () => LS.set('mev2', store);
const ui = { view: 'home', section: 'students', mosque: null, onlyPending: false, search: '', form: null, done: null };

/* ===================== تحميل البيانات ===================== */
async function loadData() {
  const r = await fetch(CONFIG.CSV_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error('csv');
  const rows = parseCSV(await r.text()); rows.shift();
  for (const [m, a, s, sup] of rows) {
    const mosque = (m || '').trim(), name = (s || '').trim();
    if (!mosque || !name) continue;
    const M = (MOS[mosque] ||= (MOSQUES.push({ name: mosque, area: (a || '').trim(), students: [], trainers: [] }), MOSQUES[MOSQUES.length - 1]));
    M.students.push({ key: mosque + '|' + name, name, mosque, area: M.area, sup: (sup || '').split('|').map((x) => x.trim()).filter(Boolean) });
    for (const n of M.students[M.students.length - 1].sup) if (!M.trainers.includes(n)) M.trainers.push(n);
  }
  // طالبان بنفس الاسم في المسجد: نميّزهما بالمشرف ونعطي كل واحد مفتاحاً مستقلاً
  for (const M of MOSQUES) {
    const count = {}; M.students.forEach((s) => (count[s.name] = (count[s.name] || 0) + 1));
    const seen = {};
    for (const s of M.students) {
      if (count[s.name] < 2) continue;
      seen[s.name] = (seen[s.name] || 0) + 1;
      s.key = M.name + '|' + s.name + '#' + seen[s.name];
      s.name = s.name + (s.sup.length ? ' (مجموعة ' + s.sup.join(' و') + ')' : ' (' + seen[s.name] + ')');
    }
  }
}

/* ===================== المزامنة مع Google Sheets ===================== */
let flushing = false;
async function flush() {
  if (flushing || !store.queue.length || !CONFIG.APPS_SCRIPT_URL) return;
  flushing = true;
  try {
    while (store.queue.length) {
      const it = store.queue[0];
      const r = await fetch(CONFIG.APPS_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ kind: it.kind, key: it.key, ...it.data }) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'fail');
      store.queue = store.queue.filter((x) => x !== it); persist();
    }
  } catch (e) { /* سيُعاد المحاولة لاحقاً */ }
  flushing = false; updateBanner();
}
async function pullRemote() {
  if (!CONFIG.APPS_SCRIPT_URL) return;
  try {
    const r = await fetch(CONFIG.APPS_SCRIPT_URL + '?action=list');
    const j = await r.json();
    const queued = new Set(store.queue.map((q) => q.kind + '|' + q.key));
    for (const [k, v] of Object.entries(j.students || {})) if (!queued.has('student|' + k)) store.students[k] = v;
    for (const [k, v] of Object.entries(j.trainers || {})) if (!queued.has('trainer|' + k)) store.trainers[k] = v;
    persist();
    if (ui.view === 'home' || ui.view === 'list') render();
  } catch (e) { /* بدون إنترنت */ }
}
function updateBanner() {
  const b = $('#banner');
  if (!CONFIG.APPS_SCRIPT_URL) { b.textContent = 'وضع تجريبي: التقييمات تُحفظ على هذا الجهاز فقط ولا تصل إلى الجدول.'; b.className = 'banner'; b.hidden = false; }
  else if (store.queue.length) { b.textContent = `⏳ ${store.queue.length} بانتظار الإرسال (سيُرسل تلقائياً عند توفر الإنترنت)`; b.className = 'banner warn'; b.hidden = false; }
  else b.hidden = true;
}
function save(kind, key, data) {
  const rec = { ...data, time: new Date().toISOString() };
  (kind === 'student' ? store.students : store.trainers)[key] = rec;
  store.queue = store.queue.filter((q) => !(q.kind === kind && q.key === key));
  store.queue.push({ kind, key, data: rec });
  persist(); updateBanner(); flush();
}

/* ===================== التنقل ===================== */
const parent = (v) => ({ list: 'home', form: ui.form && ui.form.kind === 'student' ? 'list' : 'home', done: ui.done && ui.done.kind === 'student' ? 'list' : 'home' }[v] || 'home');
function render() { ({ home: viewHome, list: viewList, form: viewForm, done: viewDone }[ui.view])($('#app')); }
function go(view) { ui.view = view; render(); window.scrollTo(0, 0); }
function back() { history.state && history.state.v ? history.back() : go(parent(ui.view)); }
function resetAll() {
  Object.assign(ui, { view: 'home', section: 'students', mosque: null, onlyPending: false, search: '', form: null, done: null });
  go('home');
}

/* --- الصفحة الأولى: اختيار القسم ثم المسجد --- */
function viewHome(app) {
  const stu = ui.section === 'students';
  app.innerHTML = `
    <div class="seg" role="group" aria-label="القسم">${Object.entries(SECTIONS).map(([k, v]) =>
      `<button class="seg-btn ${ui.section === k ? 'on' : ''}" data-act="section" data-s="${k}">${v}</button>`).join('')}</div>
    <div class="sec-title">${stu ? 'اختر المسجد لعرض طلابه' : 'اختر المسجد الذي تدرّب فيه'}</div>
    <div class="list">${MOSQUES.map((m) => {
      const done = m.students.filter((s) => store.students[s.key]).length, n = m.students.length;
      return `<button class="mosque" data-act="mosque" data-m="${esc(m.name)}">
        <span class="mtext"><span class="mname">${esc(m.name)}</span>
          <span class="meta">${esc(m.area)} · ${n} طالب</span>
          ${stu ? `<span class="mprog"><span class="bar"><i style="width:${n ? done / n * 100 : 0}%"></i></span><span class="meta">تم تقييم ${done} من ${n}</span></span>` : ''}</span>
        <span class="chev" aria-hidden="true">‹</span></button>`;
    }).join('')}</div>`;
}

/* --- قائمة طلاب المسجد --- */
function viewList(app) {
  const M = MOS[ui.mosque];
  const done = M.students.filter((s) => store.students[s.key]).length, n = M.students.length;
  app.innerHTML = `
    <button class="back" data-act="back">→ الرئيسية</button>
    <h2>${esc(M.name)}</h2><p class="sub">${esc(M.area)}</p>
    <div class="progress-line"><span>تم تقييم ${done} من ${n}</span><span>${Math.round(done / n * 100)}%</span></div>
    <div class="bar"><i style="width:${done / n * 100}%"></i></div>
    <div class="search"><input id="sq" type="search" placeholder="🔍  ابحث عن اسم طالب" autocomplete="off" value="${esc(ui.search)}"></div>
    <div class="toggle"><button class="chip sm ${ui.onlyPending ? 'on' : ''}" data-act="pending">لم يُقيَّم بعد فقط</button></div>
    <div id="slist" class="list"></div>`;
  const draw = () => {
    ui.search = $('#sq').value;
    const q = norm(ui.search);
    const shown = M.students.filter((s) => norm(s.name).includes(q) && (!ui.onlyPending || !store.students[s.key]));
    $('#slist').innerHTML = shown.length ? shown.map((s) => {
      const ok = !!store.students[s.key];
      return `<button class="row" data-act="student" data-key="${esc(s.key)}">
        <span class="name">${esc(s.name)}</span><span class="badge ${ok ? 'ok' : ''}">${ok ? 'تم تقييمه ✓' : 'لم يُقيَّم'}</span></button>`;
    }).join('') : `<p class="empty">${q || ui.onlyPending ? 'لا يوجد طالب مطابق' : 'لا يوجد طلاب'}</p>`;
  };
  $('#sq').addEventListener('input', draw); draw();
}

/* --- النماذج --- */
function openForm(kind, key, mosque) {
  let values = {};
  if (kind === 'student') values = { ...(store.students[key] || {}) };
  else if (store.me && store.trainers[store.me]) values = { ...store.trainers[store.me] };
  if (store.me) values.trainer = store.me;
  ui.form = { kind, key, mosque, values };
  history.pushState({ v: 'form' }, '');
  go('form');
}
function bodyHTML(f, v) {
  let html = '';
  if (f.type === 'rate') {
    html = `<div class="rate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="set" data-id="${f.id}" data-v="${n}" class="${v === n ? 'on' : ''}" aria-label="${n}">${n}</button>`).join('')}</div>
      <div class="scale"><span>ضعيف</span><span>ممتاز</span></div>`;
  } else if (f.type === 'choice') {
    const opts = f.options.slice(); if (v != null && v !== '' && !opts.includes(v)) opts.push(v);
    html = `<div class="${f.yn ? 'yn' : 'chips'}">${opts.map((o) => `<button type="button" class="chip ${v === o ? 'on' : ''}" data-act="set" data-id="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  } else {
    const arr = Array.isArray(v) ? v : [], opts = f.options.concat(arr.filter((x) => !f.options.includes(x)));
    html = `<div class="chips">${opts.map((o) => `<button type="button" class="chip ${arr.includes(o) ? 'on' : ''}" data-act="toggle" data-id="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  }
  if (f.own) html += `<div class="own"><input id="own-${f.id}" data-own="${f.id}" type="text" maxlength="60" placeholder="${esc(f.own)}" autocomplete="off"><button type="button" class="add" data-act="add-own" data-id="${f.id}">إضافة</button></div>`;
  return html;
}
function refreshField(f) { $(`[data-field="${f.id}"] .body`).innerHTML = bodyHTML(f, ui.form.values[f.id]); }
function viewForm(app) {
  const { kind, key, mosque, values } = ui.form;
  let html = '', lastGroup = null;
  for (const f of fieldsOf(ui.form)) {
    if (f.group && f.group !== lastGroup) html += `<div class="sec-title">${f.group}</div>`;
    lastGroup = f.group || null;
    html += `<div class="field ${f.group ? 'group-item' : ''}" data-field="${f.id}"><div class="lbl">${f.label}</div><div class="body">${bodyHTML(f, values[f.id])}</div></div>`;
  }
  const title = kind === 'student' ? MOS[mosque].students.find((x) => x.key === key).name : 'معلومات عن المدرب';
  app.innerHTML = `
    <div class="formtop"><button class="back" data-act="back">→ رجوع</button>
      <div class="who-name">${esc(title)}</div><div class="sub" style="margin:0">${esc(mosque)}</div>
      <div class="progress-line"><span id="ptxt"></span></div><div class="bar"><i id="pbar"></i></div></div>
    ${html}
    <div class="submit-wrap"><div class="inner"><button id="submit" class="btn" data-act="submit" disabled>${kind === 'student' ? 'حفظ التقييم' : 'حفظ المعلومات'}</button></div></div>`;
  updateProgress();
}
const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);
function updateProgress() {
  const req = fieldsOf(ui.form).filter((f) => !f.optional), n = req.filter((f) => filled(ui.form.values[f.id])).length;
  $('#ptxt').textContent = `تمت تعبئة ${n} من ${req.length}`;
  $('#pbar').style.width = (n / req.length * 100) + '%';
  $('#submit').disabled = n < req.length;
}
function onNameChosen() {
  const f = ui.form; if (f.kind !== 'trainer') return;
  const prev = store.trainers[f.values.trainer];
  if (prev && Object.keys(f.values).every((k) => k === 'trainer')) { f.values = { ...prev, trainer: f.values.trainer }; viewForm($('#app')); }
}
function submitForm() {
  const { kind, key, mosque, values } = ui.form;
  const data = {};
  for (const f of fieldsOf(ui.form)) if (filled(values[f.id])) data[f.id] = values[f.id];
  data.mosque = mosque;
  let k = key;
  if (kind === 'student') { const s = MOS[mosque].students.find((x) => x.key === key); Object.assign(data, { area: s.area, student: s.name }); }
  else k = data.trainer;
  store.me = data.trainer; persist();
  save(kind, k, data);
  ui.done = { kind, key: k, mosque };
  history.replaceState({ v: 'done' }, '');
  go('done');
}
function nextPending() {
  const list = MOS[ui.done.mosque].students, i = list.findIndex((s) => s.key === ui.done.key);
  return list.slice(i + 1).concat(list.slice(0, i + 1)).find((s) => !store.students[s.key]);
}
function viewDone(app) {
  const isStudent = ui.done.kind === 'student';
  const next = isStudent ? nextPending() : null;
  const offline = store.queue.length || !CONFIG.APPS_SCRIPT_URL;
  app.innerHTML = `<div class="done"><div class="tick">✓</div>
    <h2>${isStudent ? 'تم حفظ التقييم بنجاح' : 'تم حفظ معلوماتك بنجاح'}</h2>
    <p class="sub">${offline ? 'سيُرسل إلى الجدول تلقائياً عند توفر الاتصال.' : 'شكراً لك، وصلت البيانات إلى الجدول.'}</p>
    <div class="stack">
      ${next ? `<button class="btn" data-act="next" data-key="${esc(next.key)}">تقييم الطالب التالي: ${esc(next.name)}</button>` : ''}
      <button class="btn ${next ? 'alt' : ''}" data-act="back">${isStudent ? 'العودة إلى قائمة الطلاب' : 'العودة إلى الصفحة الأولى'}</button></div></div>`;
}

/* ===================== الأحداث ===================== */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'reset': resetAll(); break;
    case 'section': ui.section = d.s; render(); break;
    case 'mosque':
      if (ui.section === 'students') { ui.mosque = d.m; ui.search = ''; ui.onlyPending = false; history.pushState({ v: 'list' }, ''); go('list'); }
      else openForm('trainer', null, d.m);
      break;
    case 'pending': ui.onlyPending = !ui.onlyPending; render(); break;
    case 'student': openForm('student', d.key, ui.mosque); break;
    case 'back': back(); break;
    case 'next':
      ui.form = { kind: 'student', key: d.key, mosque: ui.done.mosque, values: { ...(store.students[d.key] || {}), ...(store.me ? { trainer: store.me } : {}) } };
      history.replaceState({ v: 'form' }, ''); go('form'); break;
    case 'set': {
      const f = ui.form, isRate = !!el.closest('.rate');
      f.values[d.id] = isRate ? Number(d.v) : d.v;
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      updateProgress(); if (d.id === 'trainer') onNameChosen(); break;
    }
    case 'toggle': {
      const f = ui.form, arr = Array.isArray(f.values[d.id]) ? f.values[d.id] : [];
      f.values[d.id] = arr.includes(d.v) ? arr.filter((x) => x !== d.v) : [...arr, d.v];
      el.classList.toggle('on'); break;
    }
    case 'add-own': {
      const input = $(`#own-${d.id}`), v = input.value.replace(/\s+/g, ' ').trim(); if (!v) return;
      const f = fieldsOf(ui.form).find((x) => x.id === d.id), vals = ui.form.values;
      if (f.type === 'multi') { const arr = Array.isArray(vals[d.id]) ? vals[d.id].slice() : []; if (!arr.includes(v)) arr.push(v); vals[d.id] = arr; }
      else vals[d.id] = v;
      refreshField(f); updateProgress(); if (d.id === 'trainer') onNameChosen(); break;
    }
    case 'submit': submitForm(); break;
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.dataset && e.target.dataset.own) { e.preventDefault(); e.target.closest('.own').querySelector('[data-act="add-own"]').click(); }
});
window.addEventListener('popstate', () => { if (ui.view !== 'home') go(parent(ui.view)); });
window.addEventListener('online', () => { flush(); pullRemote(); });

/* ===================== البدء ===================== */
(async function init() {
  $('#academy').textContent = CONFIG.ACADEMY_NAME;
  document.title = CONFIG.PROJECT_NAME;
  updateBanner();
  try { await loadData(); }
  catch (e) { $('#app').innerHTML = '<p class="empty">تعذّر تحميل ملف الأسماء (data/students.csv).<br>إذا فتحت الملف مباشرة من الجهاز، انشره على GitHub Pages أو شغّل خادماً محلياً.</p>'; return; }
  render(); flush(); pullRemote();
})();
