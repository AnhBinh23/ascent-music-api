// src/routes/importExcel.js
const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const { randomUUID } = require('crypto');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const db      = require('../models/db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Helpers điểm danh ───────────────────────────────────────────────────────
const SHEET_COURSE = { 'Điểm Danh Khóa 1': 1, 'Điểm Danh Khóa 2': 2, 'Điểm Danh Khóa 3': 3, 'Khóa 1': 1, 'Khóa 2': 2, 'Khóa 3': 3 };
const GOI_COL = 7, FIRST_SESSION_COL = 8;
const NAME_ALIAS = { 'Bảo An(Lan Anh)': 'Bảo An', 'Hoàng Minh Thư (B10A)': 'Hoàng Minh Thư' };

function toDate(v) {
  if (!v || v === 'NaT') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    const y = v.getFullYear();
    if (y < 2000 || y > 2100) return null;
    return `${y}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
  }
  if (typeof v === 'number' && v > 1) {
    const d = new Date(Date.UTC(1899,11,30) + Math.round(v)*86400000);
    const y = d.getUTCFullYear();
    if (y < 2000 || y > 2100) return null;
    return `${y}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }
  if (typeof v === 'string') {
    const clean = v.trim().replace(/\s+/g, '');
    const parts = clean.split('/');
    if (parts.length >= 2) {
      const dd = parts[0].padStart(2,'0');
      const mm = parts[1].padStart(2,'0');
      const yy = parts[2] || new Date().getFullYear();
      if (isNaN(Number(dd)) || isNaN(Number(mm))) return null;
      if (Number(dd) < 1 || Number(dd) > 31) return null;
      if (Number(mm) < 1 || Number(mm) > 12) return null;
      return `${yy}-${mm}-${dd}`;
    }
  }
  return null;
}

function parseGoi(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (s.toLowerCase() === 'tháng' || s.includes('/')) return null;
  const nums = s.match(/\d+/g);
  return nums ? nums.reduce((a, b) => a + Number(b), 0) : null;
}

// ─── PREVIEW điểm danh ───────────────────────────────────────────────────────
router.post('/preview', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    const preview = [], notFound = [];
    for (const [sheetName, course] of Object.entries(SHEET_COURSE)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const rawName = (r[1] || '').toString().trim();
        if (!rawName) continue;
        const name = NAME_ALIAS[rawName] || rawName;
        const studentId = studentByName.get(name);
        let sessions = 0;
        for (let j = FIRST_SESSION_COL; j < r.length; j++) {
          if (toDate(r[j])) sessions++;
        }
        if (!sessions) continue;
        const goi = parseGoi(r[GOI_COL]);
        preview.push({ name: rawName, mapped_name: name, found: !!studentId, course, sheet: sheetName, sessions, total_sessions: goi });
        if (!studentId) notFound.push(rawName);
      }
    }
    res.json({ success: true, preview, notFound: [...new Set(notFound)] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── IMPORT điểm danh ────────────────────────────────────────────────────────
router.post('/attendance', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });
    const [del] = await db.query("DELETE FROM attendance WHERE note LIKE 'Khóa % (Excel)'");
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));
    const [links] = await db.query(`SELECT cs.student_id, cs.class_id, c.instrument FROM class_students cs JOIN classes c ON cs.class_id = c.id`);
    const classesByStudent = new Map();
    links.forEach(l => {
      if (!classesByStudent.has(l.student_id)) classesByStudent.set(l.student_id, []);
      classesByStudent.get(l.student_id).push({ class_id: l.class_id, instrument: l.instrument || '' });
    });
    const [existing] = await db.query("SELECT student_id, class_id, DATE_FORMAT(date,'%Y-%m-%d') AS d FROM attendance");
    const seen = new Set(existing.map(e => `${e.student_id}|${e.class_id}|${e.d}`));
    const values = [], goiByStudent = new Map(), maxCourseByStudent = new Map();
    let dup = 0;
    const notFound = [], countByCourse = {};
    for (const [sheetName, course] of Object.entries(SHEET_COURSE)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      const note = `Khóa ${course} (Excel)`;
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const rawName = (r[1] || '').toString().trim();
        if (!rawName) continue;
        const name = NAME_ALIAS[rawName] || rawName;
        const instrument = (r[4] || '').toString().trim();
        const studentId = studentByName.get(name);
        if (!studentId) { notFound.push(rawName); continue; }
        const cls = classesByStudent.get(studentId);
        if (!cls || !cls.length) { notFound.push(`${rawName} (chưa gán lớp)`); continue; }
        let classId;
        if (cls.length === 1) classId = cls[0].class_id;
        else {
          const m = cls.find(c => c.instrument.toLowerCase().includes(instrument.toLowerCase()));
          classId = (m || cls[0]).class_id;
        }
        const goi = parseGoi(r[GOI_COL]);
        if (goi) {
          if (!goiByStudent.has(studentId)) goiByStudent.set(studentId, {});
          goiByStudent.get(studentId)[course] = goi;
        }
        maxCourseByStudent.set(studentId, Math.max(maxCourseByStudent.get(studentId) || 0, course));
        for (let j = FIRST_SESSION_COL; j < r.length; j++) {
          const date = toDate(r[j]);
          if (!date) continue;
          const key = `${studentId}|${classId}|${date}`;
          if (seen.has(key)) { dup++; continue; }
          seen.add(key);
          values.push([randomUUID(), classId, studentId, date, 'present', note, course]);
          countByCourse[course] = (countByCourse[course] || 0) + 1;
        }
      }
    }
    if (values.length) {
      await db.query(`INSERT INTO attendance (id, class_id, student_id, date, status, note, course_number) VALUES ?`, [values]);
    }
    await db.query(`UPDATE students s SET current_course = (SELECT COALESCE(MAX(a.course_number),1) FROM attendance a WHERE a.student_id = s.id)`);
    let goiUpdated = 0;
    for (const [sid, maxC] of maxCourseByStudent) {
      const goiMap = goiByStudent.get(sid) || {};
      const total = goiMap[maxC] || Object.values(goiMap).pop() || null;
      if (total) { await db.query('UPDATE students SET total_sessions=? WHERE id=?', [total, sid]); goiUpdated++; }
    }
    res.json({ success: true, deleted: del.affectedRows, imported: values.length, countByCourse, skipped: dup, goiUpdated, notFound: [...new Set(notFound)] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PREVIEW học phí ─────────────────────────────────────────────────────────
router.post('/tuition-preview', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });
    const ws = wb.Sheets['Học Phí'];
    if (!ws) return res.status(400).json({ message: 'Không tìm thấy sheet "Học Phí" trong file!' });

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    const preview = [], notFound = [];
    // Hàng 0: tổng, Hàng 1: header, từ hàng 2 trở đi là dữ liệu
    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[1]) continue;
      const rawName = String(r[1]).trim();
      if (!rawName || rawName === 'NaN') continue;

      const studentId = studentByName.get(rawName);
      const amount = Number(r[6]) || 0;
      const paid   = Number(r[7]) || 0;
      const status = String(r[9] || '').trim();

      if (!amount) continue;

      preview.push({
        name: rawName,
        found: !!studentId,
        instrument: String(r[2] || '').trim(),
        course: Number(r[3]) || 1,
        sessions: Number(r[4]) || 0,
        amount,
        paid,
        debt: amount - paid,
        status,
      });
      if (!studentId) notFound.push(rawName);
    }
    res.json({ success: true, preview, notFound: [...new Set(notFound)] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── IMPORT học phí ──────────────────────────────────────────────────────────
router.post('/tuition', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });
    const ws = wb.Sheets['Học Phí'];
    if (!ws) return res.status(400).json({ message: 'Không tìm thấy sheet "Học Phí"!' });

    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    // Lấy class của từng HV
    const [links] = await db.query(`SELECT cs.student_id, cs.class_id FROM class_students cs`);
    const classOfStudent = new Map();
    links.forEach(l => { if (!classOfStudent.has(l.student_id)) classOfStudent.set(l.student_id, l.class_id); });

    let imported = 0, skipped = 0;
    const notFound = [];

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r[1]) continue;
      const rawName = String(r[1]).trim();
      if (!rawName || rawName === 'NaN') continue;

      const studentId = studentByName.get(rawName);
      if (!studentId) { notFound.push(rawName); continue; }

      const amount  = Number(r[6]) || 0;
      const paid    = Number(r[7]) || 0;
      const course  = Number(r[3]) || 1;
      const sessions = Number(r[4]) || 0;
      const status  = paid >= amount ? 'Đã thanh toán' : paid > 0 ? 'Thanh toán một phần' : 'Chưa thanh toán';
      const classId = classOfStudent.get(studentId) || null;

      if (!amount) continue;

      // Kiểm tra đã có chưa (theo student_id + course_number)
      const [existing] = await db.query(
        'SELECT id FROM tuition WHERE student_id=? AND course_number=?',
        [studentId, course]
      );

      if (existing.length) {
        // Cập nhật
        await db.query(
          `UPDATE tuition SET amount=?, paid=?, status=?, sessions=? WHERE student_id=? AND course_number=?`,
          [amount, paid, status, sessions, studentId, course]
        );
      } else {
        // Thêm mới
        await db.query(
          `INSERT INTO tuition (student_id, class_id, amount, paid, status, sessions, course_number, note)
           VALUES (?,?,?,?,?,?,?,?)`,
          [studentId, classId, amount, paid, status, sessions, course, 'Import từ Excel']
        );
      }
      imported++;
    }

    res.json({ success: true, imported, skipped, notFound: [...new Set(notFound)] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;