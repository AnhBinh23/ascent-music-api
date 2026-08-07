// src/routes/importExcel.js
const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const path    = require('path');
const { randomUUID } = require('crypto');
const auth    = require('../middleware/auth');
const role    = require('../middleware/role');
const db      = require('../models/db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const SHEET_COURSE = { 'Khóa 1': 1, 'Khóa 2': 2, 'Khóa 3': 3 };
const GOI_COL = 7, FIRST_SESSION_COL = 8;
const NAME_ALIAS = {
  'Bảo An(Lan Anh)': 'Bảo An',
  'Hoàng Minh Thư (B10A)': 'Hoàng Minh Thư',
};

function toDate(v) {
  if (!v || v === 'NaT') return null;
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth()+1).padStart(2,'0'), d = String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'number' && v > 1) {
    return new Date(Date.UTC(1899,11,30) + Math.round(v)*86400000).toISOString().split('T')[0];
  }
  if (typeof v === 'string') {
    // dd/mm or dd/mm/yyyy
    const parts = v.trim().split('/');
    if (parts.length >= 2) {
      const dd = parts[0].padStart(2,'0');
      const mm = parts[1].padStart(2,'0');
      const yy = parts[2] || new Date().getFullYear();
      return `${yy}-${mm}-${dd}`;
    }
  }
  return null;
}

function parseGoi(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (s.toLowerCase() === 'tháng') return null;
  if (s.includes('/')) return null;
  const nums = s.match(/\d+/g);
  if (!nums) return null;
  return nums.reduce((a, b) => a + Number(b), 0);
}

// ── PREVIEW: đọc file và trả về danh sách sẽ import (không ghi DB) ──
router.post('/preview', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });

    const wb = XLSX.read(req.file.buffer, { cellDates: true });
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    const preview = [];
    const notFound = [];

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

        // Đếm số buổi hợp lệ
        let sessions = 0;
        for (let j = FIRST_SESSION_COL; j < r.length; j++) {
          if (toDate(r[j])) sessions++;
        }
        if (!sessions) continue;

        const goi = parseGoi(r[GOI_COL]);
        preview.push({
          name: rawName,
          mapped_name: name,
          found: !!studentId,
          course,
          sheet: sheetName,
          sessions,
          total_sessions: goi,
        });
        if (!studentId) notFound.push(rawName);
      }
    }

    res.json({ success: true, preview, notFound: [...new Set(notFound)] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── IMPORT: xóa data Excel cũ, import mới ──
router.post('/attendance', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });

    const wb = XLSX.read(req.file.buffer, { cellDates: true });

    // 1. Xóa data import Excel cũ (giữ nguyên điểm danh từ app)
    const [del] = await db.query(
      "DELETE FROM attendance WHERE note LIKE 'Khóa % (Excel)'"
    );

    // 2. Tải dữ liệu DB
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    const [links] = await db.query(`
      SELECT cs.student_id, cs.class_id, c.instrument
      FROM class_students cs JOIN classes c ON cs.class_id = c.id
    `);
    const classesByStudent = new Map();
    links.forEach(l => {
      if (!classesByStudent.has(l.student_id)) classesByStudent.set(l.student_id, []);
      classesByStudent.get(l.student_id).push({ class_id: l.class_id, instrument: l.instrument || '' });
    });

    const [existing] = await db.query(
      "SELECT student_id, class_id, DATE_FORMAT(date,'%Y-%m-%d') AS d FROM attendance"
    );
    const seen = new Set(existing.map(e => `${e.student_id}|${e.class_id}|${e.d}`));

    // 3. Duyệt Excel
    const values = [];
    const goiByStudent = new Map();
    const maxCourseByStudent = new Map();
    let dup = 0;
    const notFound = [], multiClass = [];
    const countByCourse = {};

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
          multiClass.push(`${name} → ${classId}`);
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

    // 4. Bulk insert
    if (values.length) {
      await db.query(
        `INSERT INTO attendance (id, class_id, student_id, date, status, note, course_number) VALUES ?`,
        [values]
      );
    }

    // 5. Cập nhật current_course
    await db.query(`
      UPDATE students s SET current_course = (
        SELECT COALESCE(MAX(a.course_number), 1) FROM attendance a WHERE a.student_id = s.id
      )
    `);

    // 6. Cập nhật total_sessions từ gói học
    let goiUpdated = 0;
    for (const [sid, maxC] of maxCourseByStudent) {
      const goiMap = goiByStudent.get(sid) || {};
      const total = goiMap[maxC] || Object.values(goiMap).pop() || null;
      if (total) {
        await db.query('UPDATE students SET total_sessions = ? WHERE id = ?', [total, sid]);
        goiUpdated++;
      }
    }

    res.json({
      success: true,
      deleted: del.affectedRows,
      imported: values.length,
      countByCourse,
      skipped: dup,
      goiUpdated,
      notFound: [...new Set(notFound)],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;