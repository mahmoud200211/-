/**
 * خادم التقييمات (Google Apps Script) مع رموز دخول المدربين.
 *
 * الأوراق (تُنشأ تلقائياً):
 *   "تقييم الطلاب"      تقييمات الطلاب
 *   "معلومات المدربين"  معلومات كل مدرب
 *   "الرموز"            رمز كل مسجد ومدربه (سرّية، لا تُرسل أبداً إلى الموقع)
 *
 * طريقة التشغيل أول مرة: اختر الدالة setupCodes من القائمة أعلى المحرر ثم اضغط "تشغيل".
 * ستظهر الرموز الخمسة في ورقة "الرموز".
 *
 * لإضافة مسجد أو مدرب جديد: أضف صفاً في ورقة "الرموز" (المسجد + المدرب) واترك خانة الرمز فارغة،
 * ثم شغّل setupCodes ليُولَّد له رمز. لإيقاف رمز اكتب "لا" في عمود "مفعّل".
 */

const STUDENT_COLS = [ // [الحقل، عنوان العمود]
  ['time', 'الوقت'], ['trainer', 'المدرب'], ['mosque', 'المسجد'], ['area', 'المنطقة'], ['student', 'الطالب'],
  ['attendance', 'الالتزام بالحضور'], ['programming', 'المستوى البرمجي'], ['creativity', 'الإبداع'],
  ['recommend', 'ترشيح للمستوى 2'], ['key', 'المفتاح'],
];
const TRAINER_COLS = [
  ['time', 'الوقت'], ['trainer', 'المدرب'], ['mosque', 'المسجد'], ['trainability', 'قابلية التدريب'], ['newTrainings', 'المشاركة في تدريبات جديدة'],
  ['major', 'الاختصاص الجامعي'], ['year', 'السنة'], ['trained', 'عدد الطلاب المدرَّبين سابقاً'],
  ['skill_prog', 'البرمجة'], ['skill_ai', 'الذكاء الاصطناعي'], ['skill_mech', 'الميكانيك'], ['skill_3d', 'الطباعة 3D'],
  ['skill_office', 'الأدوات المكتبية'], ['skill_robot', 'الروبوت'], ['otherSkills', 'مهارات أخرى'],
];
const SHEETS = {
  student: { name: 'تقييم الطلاب', cols: STUDENT_COLS, keyField: 'key' },
  trainer: { name: 'معلومات المدربين', cols: TRAINER_COLS, keyField: 'trainer' },
};

const CODES_SHEET = 'الرموز';
const CODES_HEADERS = ['الرمز', 'المسجد', 'المدرب', 'مفعّل'];
// القيم الابتدائية فقط (أسماء المساجد والمدربين). عدّلها لاحقاً من ورقة "الرموز" مباشرة.
const DEFAULT_ASSIGNMENTS = [
  ['جامع القدم الكبير', 'مدرب جامع القدم الكبير'],
  ['مسجد الإيمان', 'محمد رفاعي'],
  ['مسجد الأنصار', 'عبد الوهاب ناصر'],
  ['مسجد الصحابة', 'محمد صالح الدخيل'],
  ['الحسنين', 'محمد عَرَّاط'],
];
const MAX_FAILS = 40;            // محاولات رمز خاطئة مسموحة خلال 10 دقائق قبل التوقف المؤقت
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف متشابهة (0/O و1/I)

/* ===================== الرموز ===================== */
function normCode_(c) {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  return String(c || '').replace(/[٠-٩]/g, d => String(digits.indexOf(d))).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function newCode_() {
  const hex = Utilities.getUuid().replace(/-/g, '');
  const pool = hex.slice(0, 12) + hex.slice(13, 16) + hex.slice(17);   // نتجاوز خانتي النسخة والنوع (غير عشوائيتين)
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[parseInt(pool.substr(i * 2, 2), 16) % 32];
  return out.slice(0, 4) + '-' + out.slice(4);
}

function codesSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CODES_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CODES_SHEET);
    sh.getRange(1, 1, 1, 4).setValues([CODES_HEADERS]).setFontWeight('bold').setBackground('#fde0c8');
    sh.getRange(1, 1, 500, 1).setNumberFormat('@');   // الرمز نص دائماً
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return sh;
}

/** شغّلها يدوياً: تنشئ ورقة الرموز وتولّد رمزاً لكل صف بلا رمز. آمنة للتكرار. */
function setupCodes() {
  const sh = codesSheet_();
  if (sh.getLastRow() < 2) DEFAULT_ASSIGNMENTS.forEach(a => sh.appendRow(['', a[0], a[1], 'نعم']));
  const last = sh.getLastRow();
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  const used = rows.map(r => normCode_(r[0])).filter(Boolean);
  rows.forEach((r, i) => {
    if (normCode_(r[0]) || !String(r[1]).trim()) return;
    let c;
    do { c = newCode_(); } while (used.indexOf(normCode_(c)) >= 0);
    used.push(normCode_(c));
    sh.getRange(i + 2, 1).setValue(c);
  });
}

function findCode_(code) {
  const n = normCode_(code);
  if (n.length < 6) return null;                       // يمنع مطابقة الخانات الفارغة
  const sh = codesSheet_();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 4).getValues();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (normCode_(r[0]) === n && String(r[3]).trim() !== 'لا' && String(r[1]).trim() && String(r[2]).trim()) {
      return { mosque: String(r[1]).trim(), trainer: String(r[2]).trim() };
    }
  }
  return null;
}

function auth_(code) {
  const cache = CacheService.getScriptCache();
  if (Number(cache.get('fails') || 0) >= MAX_FAILS) return { error: 'throttled' };
  const who = findCode_(code);
  if (!who) {
    cache.put('fails', String(Number(cache.get('fails') || 0) + 1), 600);
    return { error: 'invalid_code' };
  }
  return { who: who };
}

/* ===================== مساعدات الأوراق ===================== */
function getSheet_(kind) {
  const cfg = SHEETS[kind];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) {
    sh = ss.insertSheet(cfg.name);
    sh.getRange(1, 1, 1, cfg.cols.length).setValues([cfg.cols.map(c => c[1])]).setFontWeight('bold').setBackground('#fde0c8');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return { sh: sh, cfg: cfg };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// يمنع تحويل النص إلى معادلة داخل الجدول
function safe_(v) {
  if (Array.isArray(v)) return v.map(x => String(safe_(x))).join('، ');
  if (typeof v === 'string') return /^[=+\-@]/.test(v) ? "'" + v.slice(0, 200) : v.slice(0, 200);
  return v === undefined || v === null ? '' : v;
}

function upsert_(kind, d) {
  const g = getSheet_(kind), sh = g.sh, cfg = g.cfg;
  const row = cfg.cols.map(c => safe_(d[c[0]]));
  const keyIdx = cfg.cols.findIndex(c => c[0] === cfg.keyField);
  const keyVal = String(d[cfg.keyField]);
  const last = sh.getLastRow();
  let target = last + 1;
  if (last > 1) {
    const keys = sh.getRange(2, keyIdx + 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = keys.indexOf(keyVal);
    if (i >= 0) target = i + 2;                         // تحديث بدل التكرار
  }
  sh.getRange(target, 1, 1, row.length).setValues([row]);
}

function rowToObj_(cfg, r) {
  const o = {};
  cfg.cols.forEach((c, i) => {
    let v = r[i];
    if (c[0] === 'otherSkills') v = v ? String(v).split('، ') : [];
    o[c[0]] = v;
  });
  return o;
}

function trainerInfo_(name) {
  const g = getSheet_('trainer'), last = g.sh.getLastRow();
  if (last < 2) return null;
  const rows = g.sh.getRange(2, 1, last - 1, g.cfg.cols.length).getValues();
  for (let i = 0; i < rows.length; i++) if (String(rows[i][1]) === name) return rowToObj_(g.cfg, rows[i]);
  return null;
}

function studentsOf_(mosque) {
  const g = getSheet_('student'), last = g.sh.getLastRow(), out = {};
  if (last < 2) return out;
  g.sh.getRange(2, 1, last - 1, g.cfg.cols.length).getValues().forEach(r => {
    const o = rowToObj_(g.cfg, r);
    if (String(o.mosque) === mosque) out[o.key] = o;
  });
  return out;
}

/* ===================== نقاط الدخول ===================== */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);

    if (d.kind === 'login') {
      const a = auth_(d.code);
      if (a.error) return json_({ ok: false, error: a.error });
      return json_({ ok: true, trainer: a.who.trainer, mosque: a.who.mosque,
        info: trainerInfo_(a.who.trainer), students: studentsOf_(a.who.mosque) });
    }

    if (d.kind === 'trainer') {
      const a = auth_(d.code);
      if (a.error) return json_({ ok: false, error: a.error });
      d.trainer = a.who.trainer;                       // الاسم والمسجد من الرمز فقط، وليس من العميل
      d.mosque = a.who.mosque;
      upsert_('trainer', d);
      return json_({ ok: true });
    }

    if (d.kind === 'student') {
      if (!d.key || !d.mosque || String(d.key).indexOf(d.mosque + '|') !== 0) return json_({ ok: false, error: 'bad_request' });
      if (d.code) {
        const a = auth_(d.code);
        if (a.error) return json_({ ok: false, error: a.error });
        if (a.who.mosque !== String(d.mosque)) return json_({ ok: false, error: 'forbidden' });
        d.trainer = a.who.trainer;
      } else {
        d.trainer = '';                                // تقييم بلا رمز: لا يُنسب لمدرب
      }
      upsert_('student', d);
      return json_({ ok: true });
    }

    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    return json_({ ok: false, error: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

// عام: يُرجع مفاتيح الطلاب المقيَّمين فقط (ليظهر "تم تقييمه")، بلا درجات ولا أسماء مدربين
function doGet(e) {
  const out = { students: {} };
  const g = getSheet_('student'), last = g.sh.getLastRow();
  if (last > 1) {
    const keyIdx = g.cfg.cols.findIndex(c => c[0] === 'key');
    g.sh.getRange(2, keyIdx + 1, last - 1, 1).getValues().forEach(r => { if (r[0]) out.students[String(r[0])] = 1; });
  }
  return json_(out);
}
