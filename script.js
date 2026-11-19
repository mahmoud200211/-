'use strict';
/* ===================== الإعدادات (عدّل هنا فقط) ===================== */
const CONFIG = {
  PROJECT_NAME: 'تقييم المدربين والطلاب في المساجد', // عنوان الصفحة في المتصفح
  ACADEMY_NAME: 'جيكس أكاديمي',   // يظهر بجانب الشعار
  APPS_SCRIPT_URL: '',              // رابط Google Apps Script بعد النشر (انظر README.md)
  CSV_URL: 'data/students.csv',     // ملف الأسماء
};
const OPTIONS = {
  majors: ['هندسة حاسوب', 'هندسة كهرباء', 'هندسة ميكانيك', 'علوم حاسوب', 'تقنية معلومات', 'أخرى'],
  years: ['أولى', 'ثانية', 'ثالثة', 'رابعة', 'خامسة', 'خريج'],
  trained: ['0', '1-10', '11-30', '31-60', 'أكثر من 60'],
  otherSkills: ['تصميم', 'مونتاج', 'كهرباء', 'لحام', 'لغات', 'إلقاء', 'تصوير', 'أخرى'],
};

/* ===================== تعريف النماذج ===================== */
const YN = ['نعم', 'لا'];
const STUDENT_FIELDS = [
  { id: 'attendance', label: 'الالتزام بالحضور', type: 'rate' },
  { id: 'programming', label: 'المستوى البرمجي', type: 'rate' },
  { id: 'creativity', label: 'الإبداع', type: 'rate' },
  { id: 'recommend', label: 'هل ترشّح الطالب للمستوى 2؟', type: 'choice', options: YN, yn: true },
];
const TRAINER_FIELDS = [
  { id: 'trainability', label: 'قابلية التدريب', type: 'rate' },
  { id: 'newTrainings', label: 'قابلية المشاركة في تدريبات جديدة', type: 'choice', options: ['نعم', 'لا', 'ربما'], yn: true },
  { id: 'major', label: 'الاختصاص الجامعي', type: 'choice', options: OPTIONS.majors },
  { id: 'year', label: 'السنة الجامعية', type: 'choice', options: OPTIONS.years },
  { id: 'trained', label: 'عدد الطلاب الذين دربتهم سابقاً', type: 'choice', options: OPTIONS.trained },
  { id: 'skill_prog', label: 'البرمجة', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_ai', label: 'الذكاء الاصطناعي', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_mech', label: 'الميكانيك', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_3d', label: 'الطباعة ثلاثية الأبعاد', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_office', label: 'الأدوات المكتبية', type: 'rate', group: 'مستوى المهارات' },
  { id: 'skill_robot', label: 'الروبوت', type: 'rate', group: 'مستوى المهارات' },
  { id: 'otherSkills', label: 'مهارات أخرى (اختياري)', type: 'multi', options: OPTIONS.otherSkills, optional: true },
];

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
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ===================== الحالة ===================== */
let TRAINERS = {};           // اسم المدرب -> { name, students:[{key,name,mosque,area}], mosques:[] }
let store = LS.get('mev1', { students: {}, trainers: {}, queue: [], me: null });
const persist = () => LS.set('mev1', store);
const ui = { view: 'pick', tab: 'students', mosque: null, onlyPending: false, form: null, done: null };

/* ===================== تحميل البيانات ===================== */
async function loadData() {
  const r = await fetch(CONFIG.CSV_URL, { cache: 'no-cache' });
  if (!r.ok) throw new Error('csv');
  const rows = parseCSV(await r.text()); rows.shift();
  for (const [t, m, a, s] of rows) {
    const trainer = (t || '').trim(), mosque = (m || '').trim(), name = (s || '').trim();
    if (!trainer || !name) continue;
    const T = (TRAINERS[trainer] ||= { name: trainer, students: [], mosques: [] });
    T.students.push({ key: mosque + '|' + name, name, mosque, area: (a || '').trim() });
    if (!T.mosques.includes(mosque)) T.mosques.push(mosque);
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
    if (ui.view === 'main') render();
  } catch (e) { /* بدون إنترنت */ }
}
function updateBanner() {
  const b = $('#banner');
  if (!CONFIG.APPS_SCRIPT_URL) { b.textContent = 'وضع تجريبي: التقييمات تُحفظ على هذا الجهاز فقط ولا تصل إلى الجدول.'; b.className = 'banner'; b.hidden = false; }
  else if (store.queue.length) { b.textContent = `⏳ ${store.queue.length} تقييم بانتظار الإرسال (سيُرسل تلقائياً عند توفر الإنترنت)`; b.className = 'banner warn'; b.hidden = false; }
  else b.hidden = true;
}
function save(kind, key, data) {
  const rec = { ...data, time: new Date().toISOString() };
  (kind === 'student' ? store.students : store.trainers)[key] = rec;
  store.queue = store.queue.filter((q) => !(q.kind === kind && q.key === key));
  store.queue.push({ kind, key, data: rec });
  persist(); updateBanner(); flush();
}

/* ===================== الواجهات ===================== */
function render() {
  const app = $('#app');
  ({ pick: viewPick, main: viewMain, form: viewForm, done: viewDone }[ui.view])(app);
}
function go(view) { ui.view = view; render(); window.scrollTo(0, 0); }

/* --- اختيار المدرب --- */
function viewPick(app) {
  app.innerHTML = `
    <h2>مرحباً بك 👋</h2>
    <p class="sub">ابحث عن اسمك واضغط عليه</p>
    <div class="search"><input id="q" type="search" placeholder="🔍  اكتب جزءاً من اسمك" autocomplete="off"></div>
    <div id="tlist" class="list"></div>`;
  const draw = () => {
    const q = norm($('#q').value);
    const items = Object.values(TRAINERS).filter((t) => norm(t.name).includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    $('#tlist').innerHTML = items.length ? items.map((t) => `
      <button class="row" data-act="pick" data-name="${esc(t.name)}">
        <span><span class="name">${esc(t.name)}</span><br><span class="meta">${t.students.length} طالب · ${t.mosques.map(esc).join('، ')}</span></span>
        <span aria-hidden="true">‹</span>
      </button>`).join('') : '<p class="empty">لا يوجد اسم مطابق</p>';
  };
  $('#q').addEventListener('input', draw); draw();
}

/* --- الصفحة الرئيسية للمدرب --- */
function viewMain(app) {
  const T = TRAINERS[store.me];
  if (!T) { store.me = null; persist(); return go('pick'); }
  if (!ui.mosque || !T.mosques.includes(ui.mosque)) ui.mosque = T.mosques.length === 1 ? T.mosques[0] : null;
  let body = '';
  if (ui.tab === 'students') {
    body = `<div class="sec-title">${T.mosques.length > 1 ? 'اختر المسجد' : 'المسجد'}</div>
      <div class="chips">${T.mosques.map((m) => {
        const all = T.students.filter((s) => s.mosque === m), done = all.filter((s) => store.students[s.key]).length;
        return `<button class="chip ${m === ui.mosque ? 'on' : ''}" data-act="mosque" data-m="${esc(m)}">${esc(m)} · ${done}/${all.length}</button>`;
      }).join('')}</div>`;
    if (ui.mosque) {
      const all = T.students.filter((s) => s.mosque === ui.mosque), done = all.filter((s) => store.students[s.key]).length;
      const shown = ui.onlyPending ? all.filter((s) => !store.students[s.key]) : all;
      body += `<div class="progress-line"><span>تم تقييم ${done} من ${all.length}</span><span>${Math.round(done / all.length * 100)}%</span></div>
        <div class="bar"><i style="width:${done / all.length * 100}%"></i></div>
        <div class="toggle"><button class="chip sm ${ui.onlyPending ? 'on' : ''}" data-act="pending">لم يُقيَّم بعد فقط</button></div>
        <div class="list">${shown.length ? shown.map((s) => {
          const ok = !!store.students[s.key];
          return `<button class="row" data-act="student" data-key="${esc(s.key)}">
            <span class="name">${esc(s.name)}</span><span class="badge ${ok ? 'ok' : ''}">${ok ? 'تم تقييمه ✓' : 'لم يُقيَّم'}</span></button>`;
        }).join('') : '<p class="empty">🎉 تم تقييم جميع الطلاب</p>'}</div>`;
    } else body += '<p class="empty">اختر المسجد لعرض الطلاب</p>';
  } else {
    const ev = store.trainers[store.me];
    body = `<div class="card"><h2>تقييم المدرب (أنا)</h2>
      <p class="sub">${ev ? 'تم تعبئة تقييمك مسبقاً ✓ — يمكنك تعديله.' : 'لم تعبّئ تقييمك بعد. يستغرق دقيقة واحدة.'}</p>
      <button class="btn" data-act="trainer-form">${ev ? 'تعديل تقييمي' : 'ابدأ التعبئة'}</button></div>`;
  }
  app.innerHTML = `
    <div class="who"><span>المدرب: <b>${esc(T.name)}</b></span><button class="link" data-act="switch">تغيير</button></div>
    <div class="tabs"><button class="tab ${ui.tab === 'students' ? 'on' : ''}" data-act="tab" data-t="students">تقييم الطلاب</button>
      <button class="tab ${ui.tab === 'trainer' ? 'on' : ''}" data-act="tab" data-t="trainer">تقييم المدرب (أنا)</button></div>${body}`;
}

/* --- النماذج --- */
function openForm(kind, key) {
  const prev = kind === 'student' ? store.students[key] : store.trainers[key];
  ui.form = { kind, key, values: prev ? { ...prev } : {} };
  history.pushState({ v: 'form' }, '');
  go('form');
}
function fieldHTML(f, v) {
  const on = (x) => (v === x ? 'on' : '');
  if (f.type === 'rate') {
    return `<div class="rate" data-id="${f.id}">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-act="set" data-id="${f.id}" data-v="${n}" class="${on(n)}" aria-label="${n}">${n}</button>`).join('')}</div>
      <div class="scale"><span>ضعيف</span><span>ممتاز</span></div>`;
  }
  if (f.type === 'choice') {
    return `<div class="${f.yn ? 'yn' : 'chips'}" data-id="${f.id}">${f.options.map((o) => `<button type="button" class="chip ${on(o)}" data-act="set" data-id="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
  }
  const arr = Array.isArray(v) ? v : [];
  return `<div class="chips">${f.options.map((o) => `<button type="button" class="chip ${arr.includes(o) ? 'on' : ''}" data-act="toggle" data-id="${f.id}" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
}
function viewForm(app) {
  const { kind, key, values } = ui.form;
  const fields = kind === 'student' ? STUDENT_FIELDS : TRAINER_FIELDS;
  let html = '', lastGroup = null;
  for (const f of fields) {
    if (f.group && f.group !== lastGroup) html += `<div class="sec-title">${f.group}</div>`;
    lastGroup = f.group || null;
    html += `<div class="field ${f.group ? 'group-item' : ''}"><div class="lbl">${f.label}</div>${fieldHTML(f, values[f.id])}</div>`;
  }
  let title, sub;
  if (kind === 'student') {
    const s = TRAINERS[store.me].students.find((x) => x.key === key);
    title = s.name; sub = s.mosque;
  } else { title = 'تقييم المدرب'; sub = store.me; }
  app.innerHTML = `
    <div class="formtop"><button class="back" data-act="back">→ رجوع</button>
      <div class="who-name">${esc(title)}</div><div class="sub" style="margin:0">${esc(sub)}</div>
      <div class="progress-line"><span id="ptxt"></span></div><div class="bar"><i id="pbar"></i></div></div>
    ${html}
    <div class="submit-wrap"><div class="inner"><button id="submit" class="btn" data-act="submit" disabled>${kind === 'student' ? 'حفظ التقييم' : 'حفظ تقييمي'}</button></div></div>`;
  updateProgress();
}
function requiredFields() { return (ui.form.kind === 'student' ? STUDENT_FIELDS : TRAINER_FIELDS).filter((f) => !f.optional); }
function updateProgress() {
  const req = requiredFields(), n = req.filter((f) => ui.form.values[f.id] != null).length;
  $('#ptxt').textContent = `تمت تعبئة ${n} من ${req.length}`;
  $('#pbar').style.width = (n / req.length * 100) + '%';
  $('#submit').disabled = n < req.length;
}
function submitForm() {
  const { kind, key, values } = ui.form;
  const data = {};
  for (const f of (kind === 'student' ? STUDENT_FIELDS : TRAINER_FIELDS)) if (values[f.id] != null) data[f.id] = values[f.id];
  if (kind === 'student') {
    const s = TRAINERS[store.me].students.find((x) => x.key === key);
    Object.assign(data, { trainer: store.me, mosque: s.mosque, area: s.area, student: s.name });
  } else data.trainer = store.me;
  save(kind, key, data);
  ui.done = { kind, key };
  history.replaceState({ v: 'done' }, '');
  go('done');
}
function nextPending() {
  const T = TRAINERS[store.me];
  return T.students.find((s) => s.mosque === ui.mosque && !store.students[s.key] && s.key !== ui.done.key);
}
function viewDone(app) {
  const isStudent = ui.done.kind === 'student';
  const next = isStudent ? nextPending() : null;
  const offline = store.queue.length || !CONFIG.APPS_SCRIPT_URL;
  app.innerHTML = `<div class="done"><div class="tick">✓</div>
    <h2>تم حفظ ${isStudent ? 'التقييم' : 'تقييمك'} بنجاح</h2>
    <p class="sub">${offline ? 'سيُرسل إلى الجدول تلقائياً عند توفر الاتصال.' : 'شكراً لك، وصل التقييم إلى الجدول.'}</p>
    <div class="stack">
      ${next ? `<button class="btn" data-act="next" data-key="${esc(next.key)}">تقييم الطالب التالي: ${esc(next.name)}</button>` : ''}
      <button class="btn ${next ? 'alt' : ''}" data-act="list">العودة إلى القائمة</button></div></div>`;
}

/* ===================== الأحداث ===================== */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const d = el.dataset;
  switch (d.act) {
    case 'pick': store.me = d.name; persist(); ui.tab = 'students'; ui.mosque = null; go('main'); break;
    case 'switch': store.me = null; persist(); go('pick'); break;
    case 'tab': ui.tab = d.t; render(); break;
    case 'mosque': ui.mosque = d.m; render(); break;
    case 'pending': ui.onlyPending = !ui.onlyPending; render(); break;
    case 'student': openForm('student', d.key); break;
    case 'trainer-form': openForm('trainer', store.me); break;
    case 'back': history.state && history.state.v ? history.back() : go('main'); break;
    case 'list': history.state && history.state.v ? history.back() : go('main'); break;
    case 'next': ui.form = { kind: 'student', key: d.key, values: { ...(store.students[d.key] || {}) } };
      history.replaceState({ v: 'form' }, ''); go('form'); break;
    case 'set': {
      const f = ui.form, v = /^[1-5]$/.test(d.v) && el.closest('.rate') ? Number(d.v) : d.v;
      f.values[d.id] = v;
      el.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === el));
      updateProgress(); break;
    }
    case 'toggle': {
      const f = ui.form, arr = Array.isArray(f.values[d.id]) ? f.values[d.id] : [];
      f.values[d.id] = arr.includes(d.v) ? arr.filter((x) => x !== d.v) : [...arr, d.v];
      el.classList.toggle('on'); break;
    }
    case 'submit': submitForm(); break;
  }
});
window.addEventListener('popstate', () => { if (ui.view === 'form' || ui.view === 'done') go('main'); });
window.addEventListener('online', () => { flush(); pullRemote(); });

/* ===================== البدء ===================== */
(async function init() {
  $('#academy').textContent = CONFIG.ACADEMY_NAME;
  document.title = CONFIG.PROJECT_NAME;
  updateBanner();
  try { await loadData(); }
  catch (e) { $('#app').innerHTML = '<p class="empty">تعذّر تحميل ملف الأسماء (data/students.csv).<br>إذا فتحت الملف مباشرة من الجهاز، انشره على GitHub Pages أو شغّل خادماً محلياً.</p>'; return; }
  ui.view = store.me && TRAINERS[store.me] ? 'main' : 'pick';
  render(); flush(); pullRemote();
})();
