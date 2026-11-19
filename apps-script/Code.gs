/**
 * استقبال التقييمات وكتابتها في Google Sheet.
 * الصق هذا الكود كاملاً في Apps Script داخل الـ Sheet (Extensions > Apps Script).
 * الأوراق تُنشأ تلقائياً: "تقييم الطلاب" و "تقييم المدربين".
 */
const STUDENT_COLS = [ // [الحقل، عنوان العمود]
  ['time', 'الوقت'], ['trainer', 'المدرب'], ['mosque', 'المسجد'], ['area', 'المنطقة'], ['student', 'الطالب'],
  ['attendance', 'الالتزام بالحضور'], ['programming', 'المستوى البرمجي'], ['creativity', 'الإبداع'],
  ['recommend', 'ترشيح للمستوى 2'], ['key', 'المفتاح'],
];
const TRAINER_COLS = [
  ['time', 'الوقت'], ['trainer', 'المدرب'], ['trainability', 'قابلية التدريب'], ['newTrainings', 'المشاركة في تدريبات جديدة'],
  ['major', 'الاختصاص الجامعي'], ['year', 'السنة'], ['trained', 'عدد الطلاب المدرَّبين سابقاً'],
  ['skill_prog', 'البرمجة'], ['skill_ai', 'الذكاء الاصطناعي'], ['skill_mech', 'الميكانيك'], ['skill_3d', 'الطباعة 3D'],
  ['skill_office', 'الأدوات المكتبية'], ['skill_robot', 'الروبوت'], ['otherSkills', 'مهارات أخرى'],
];
const SHEETS = {
  student: { name: 'تقييم الطلاب', cols: STUDENT_COLS, keyField: 'key' },
  trainer: { name: 'تقييم المدربين', cols: TRAINER_COLS, keyField: 'trainer' },
};

function getSheet_(kind) {
  const cfg = SHEETS[kind];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) {
    sh = ss.insertSheet(cfg.name);
    sh.getRange(1, 1, 1, cfg.cols.length).setValues([cfg.cols.map(c => c[1])]).setFontWeight('bold').setBackground('#d9ead3');
    sh.setFrozenRows(1);
    sh.setRightToLeft(true);
  }
  return { sh, cfg };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (!SHEETS[d.kind]) return json_({ ok: false, error: 'bad kind' });
    const { sh, cfg } = getSheet_(d.kind);
    const row = cfg.cols.map(c => {
      const v = d[c[0]];
      return Array.isArray(v) ? v.join('، ') : (v === undefined ? '' : v);
    });
    const keyIdx = cfg.cols.findIndex(c => c[0] === cfg.keyField);
    const last = sh.getLastRow();
    let target = last + 1;
    if (last > 1) {
      const keys = sh.getRange(2, keyIdx + 1, last - 1, 1).getValues().map(r => String(r[0]));
      const i = keys.indexOf(String(d.kind === 'student' ? d.key : d.trainer));
      if (i >= 0) target = i + 2;                            // تحديث بدل التكرار
    }
    sh.getRange(target, 1, 1, row.length).setValues([row]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// يُرجع التقييمات الموجودة ليظهر "تم تقييمه" على أي جهاز
function doGet(e) {
  const out = { students: {}, trainers: {} };
  ['student', 'trainer'].forEach(kind => {
    const { sh, cfg } = getSheet_(kind);
    const last = sh.getLastRow();
    if (last < 2) return;
    sh.getRange(2, 1, last - 1, cfg.cols.length).getValues().forEach(r => {
      const o = {};
      cfg.cols.forEach((c, i) => {
        let v = r[i];
        if (c[0] === 'otherSkills') v = v ? String(v).split('، ') : [];
        o[c[0]] = v;
      });
      if (kind === 'student') out.students[o.key] = o; else out.trainers[o.trainer] = o;
    });
  });
  return json_(out);
}
