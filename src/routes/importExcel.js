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

// Alias riêng cho sheet chấm công GV (có biệt danh trong ngoặc)
const CHECKIN_NAME_ALIAS = {
  'Vũ Bình An (Thỏ)':      'Vũ Bình An',
  'Vũ Minh An (Tê Tê)':    'Vũ Minh An',
  'Lê Ngọc Diệp (Subi)':   'Lê Ngọc Diệp',
  'Gia Hân(Mây)':           'Tạ Gia Hân',
  'Ngọc Trâm (Bống)':      'Ngọc Trâm',
  'Vũ An Khánh( Mochi )':  'Vũ An Khánh',
  'Vũ Tường Ngân ( Cam)':  'Vũ Tường Ngân',
  'Tạ Minh Châu (Táo)':    'Tạ Minh Châu',
  'Nhã Phương(Mỡ)':        'Nhã Phương',
  'Linh Đan( Thỏ)':        'Nguyễn Ngọc Linh Đan',
  'Linh Đan':              'Nguyễn Ngọc Linh Đan',
  'Bảo An(Lan Anh)':       'Bảo An',
  'Minh Thư':              'Nguyễn Trần Minh Thư',
  'An Nhiên':              'Hoàng An Nhiên',
  'Hiền Minh':             'Hiền Minh',
  'Thanh Tú':              'Thanh Tú',
  'Phương Nhi':            'Phương Nhi',
  'Nguyễn Cảnh Kỳ':       'Nguyễn Cảnh Kỳ',
  'Phùng Ngọc Anh':       'Phùng Ngọc Anh',
  'Bảo Anh':              'Bảo Anh',
};

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
        let cls = classesByStudent.get(studentId);

        // HV chưa có lớp → tự tạo lớp + gán vào
        if (!cls || !cls.length) {
          const rawHinhThuc = String(r[6] || '').trim().toLowerCase();
          const isGroup = rawHinhThuc === 'nhóm' || rawHinhThuc === 'nhom';
          const instNorm = instrument || 'Piano';
          const goiHoc = String(r[7] || '').trim();
          const totalSess = parseGoi(goiHoc) || 16;

          const TEACHER_ALIAS2 = {
            'dương':'đinh văn dương','tiến':'lê hữu tiến',
            'h.tiến':'lê hữu tiến','hữu tiến':'lê hữu tiến',
            'hằng':'hằng','cô hoa':'hoa','hoa':'hoa',
          };
          const rawGV = String(r[5] || '').trim().toLowerCase();
          const [allTeachers2] = await db.query('SELECT id, name FROM teachers');
          const tAlias = TEACHER_ALIAS2[rawGV] || rawGV;
          const foundT = allTeachers2.find(t => t.name.toLowerCase().includes(tAlias) || tAlias.includes(t.name.toLowerCase().split(' ').pop()));
          const teacherId2 = foundT?.id || null;

          let newClassId;
          if (isGroup && teacherId2) {
            const [existGrp] = await db.query(
              `SELECT id FROM classes WHERE teacher_id=? AND instrument=? AND type='group' AND status='Đang học' LIMIT 1`,
              [teacherId2, instNorm]
            );
            if (existGrp.length) { newClassId = existGrp[0].id; }
            else {
              const grpName = `${instNorm} Nhóm - ${foundT?.name||''}`;
              const [r2] = await db.query(
                `INSERT INTO classes (name,instrument,type,teacher_id,status) VALUES (?,?,'group',?,'Đang học')`,
                [grpName, instNorm, teacherId2]
              );
              newClassId = r2.insertId;
            }
          } else {
            const className = `${instNorm} 1-1 ${name}`;
            const [existCls] = await db.query('SELECT id FROM classes WHERE name=? LIMIT 1', [className]);
            if (existCls.length) { newClassId = existCls[0].id; }
            else {
              const [r2] = await db.query(
                `INSERT INTO classes (name,instrument,type,teacher_id,status) VALUES (?,?,'1v1',?,'Đang học')`,
                [className, instNorm, teacherId2]
              );
              newClassId = r2.insertId;
            }
          }

          // Gán HV vào lớp
          const [existCS2] = await db.query(
            'SELECT id FROM class_students WHERE class_id=? AND student_id=?', [newClassId, studentId]
          );
          if (!existCS2.length) {
            await db.query('INSERT INTO class_students (class_id,student_id,course_number) VALUES (?,?,1)', [newClassId, studentId]);
          }
          if (totalSess) await db.query('UPDATE students SET total_sessions=? WHERE id=?', [totalSess, studentId]);

          cls = [{ class_id: newClassId, instrument: instNorm }];
          classesByStudent.set(studentId, cls);
        }

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

// Map tên trong sheet Học Phí → tên trong DB
const TUITION_NAME_ALIAS = {
  'Chị Huệ (Tầng 9)': 'Chị Huệ T9',
  'Chị Huệ T9': 'Chị Huệ T9',
  'An Khánh': 'Vũ An Khánh',
  'Gia Nhi': 'Tạ Gia Nhi',
  'Minh Châu': 'Tạ Minh Châu',
  'Hoàng Minh Thư B10A': 'Hoàng Minh Thư',
  'Cảnh Kỳ': 'Nguyễn Cảnh Kỳ',
  'Nguyễn Ngọc Linh An': 'Linh An',
  'NNguyễn Lê Phương Mai': 'Nguyễn Lê Phương Mai',
  'Chị Hương Giang': 'Chị Hương Giang',
  'Nguyễn Khánh My': 'Nguyễn Khánh My',
  'Nguyễn Hồng Bảo An (Gao)': 'Nguyễn Hồng Bảo An',
};

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
      const mappedName = TUITION_NAME_ALIAS[rawName] || rawName;
      const studentId = studentByName.get(mappedName);
      const amount = Number(r[6]) || 0;
      const paid   = Number(r[7]) || 0;
      // Status thanh toán tính từ số tiền, không lấy từ Excel
      const payStatus = paid >= amount ? 'Đã thanh toán' : paid > 0 ? 'Thanh toán 1 phần' : 'Chưa thanh toán';
      const hocStatus = String(r[9] || '').trim(); // Tình trạng học (Đang học/Tạm Nghỉ...)

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
        status: payStatus,
        hocStatus,
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
      const mappedName = TUITION_NAME_ALIAS[rawName] || rawName;
      const studentId = studentByName.get(mappedName);
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

// ─── SO SÁNH HV Excel vs DB ──────────────────────────────────────────────────
router.post('/check-students', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });

    // Lấy tất cả HV từ DB
    const [dbStudents] = await db.query('SELECT id, name, instrument, status FROM students');
    const studentByName = new Map(dbStudents.map(s => [s.name.trim(), s]));

    // Đọc tất cả HV từ Excel (tất cả sheet điểm danh)
    const excelStudents = new Map(); // name → { name, instrument, teacher, sheets }

    for (const [sheetName] of Object.entries(SHEET_COURSE)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1]) continue;
        const rawName = String(r[1]).trim();
        if (!rawName) continue;
        const name = NAME_ALIAS[rawName] || rawName;
        if (!excelStudents.has(name)) {
          excelStudents.set(name, {
            raw_name: rawName,
            name,
            instrument: String(r[4] || '').trim(),
            teacher: String(r[5] || '').trim(),
            hinhThuc: String(r[6] || '').trim(),
            sheets: [],
          });
        }
        excelStudents.get(name).sheets.push(sheetName);
      }
    }

    // So sánh
    const matched = [];    // Có trong cả 2
    const onlyExcel = [];  // Chỉ trong Excel, chưa có trong DB
    const onlyDB = [];     // Chỉ trong DB, không có trong Excel

    for (const [name, info] of excelStudents) {
      const dbStu = studentByName.get(name);
      if (dbStu) {
        matched.push({ name, instrument: info.instrument, teacher: info.teacher, db_id: dbStu.id, status: dbStu.status });
      } else {
        onlyExcel.push({ name: info.raw_name, mapped: name, instrument: info.instrument, teacher: info.teacher, hinhThuc: info.hinhThuc });
      }
    }

    for (const [name, stu] of studentByName) {
      if (!excelStudents.has(name)) {
        onlyDB.push({ name, instrument: stu.instrument, status: stu.status, db_id: stu.id });
      }
    }

    res.json({
      success: true,
      summary: {
        excel_total: excelStudents.size,
        db_total: dbStudents.length,
        matched: matched.length,
        only_excel: onlyExcel.length,
        only_db: onlyDB.length,
      },
      matched,
      only_excel: onlyExcel,
      only_db: onlyDB,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

// ─── TẠO HV MỚI + LỚP HỌC từ Excel ──────────────────────────────────────────
router.post('/create-students', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });

    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    // ID HV mới
    const [maxHv] = await db.query("SELECT MAX(CAST(SUBSTRING(id, 4) AS UNSIGNED)) AS maxn FROM students WHERE id LIKE 'hv-%'");
    let nextHvNum = (maxHv[0].maxn || 0) + 1;

    // Map tên GV
    const [teachers] = await db.query('SELECT id, name FROM teachers');
    const teacherMap = new Map(teachers.map(t => [t.name.toLowerCase().trim(), t.id]));
    const TEACHER_ALIAS = {
      'dương': 'đinh văn dương', 'tiến': 'lê hữu tiến',
      'h.tiến': 'lê hữu tiến', 'hữu tiến': 'lê hữu tiến',
      'hằng': 'hằng', 'cô hoa': 'hoa', 'hoa': 'hoa',
    };
    const INSTRUMENT_MAP = {
      'piano': 'Piano', 'guitar': 'Guitar', 'violin': 'Violin',
      'tn': 'Thanh nhạc', 'thanh nhạc': 'Thanh nhạc',
      'piano (đệm)': 'Piano',
    };

    // Lớp hiện có
    const [existClasses] = await db.query('SELECT id, name FROM classes');
    const classByName = new Map(existClasses.map(c => [c.name.toLowerCase().trim(), c.id]));
    // Class_students hiện có
    const [existCS] = await db.query('SELECT class_id, student_id FROM class_students');
    const csSet = new Set(existCS.map(x => `${x.class_id}|${x.student_id}`));

    const created = [];
    // Map nhóm: key = (teacherId + instrument + type) → classId
    const groupClassMap = new Map();

    for (const [sheetName] of Object.entries(SHEET_COURSE)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[1]) continue;
        const rawName = String(r[1]).trim();
        if (!rawName) continue;
        const name = NAME_ALIAS[rawName] || rawName;

        const dobRaw    = r[3];
        const dob       = dobRaw && !isNaN(Number(dobRaw)) ? `${Math.round(Number(dobRaw))}-01-01` : null;
        const rawInstr  = String(r[4] || '').trim().toLowerCase();
        const instrument = INSTRUMENT_MAP[rawInstr] || 'Piano';
        const rawTeacher = String(r[5] || '').trim().toLowerCase();
        const teacherAlias = TEACHER_ALIAS[rawTeacher] || rawTeacher;
        const teacherId = teacherMap.get(teacherAlias) || null;
        const rawHinhThuc = String(r[6] || '').trim().toLowerCase();
        const isGroup = rawHinhThuc === 'nhóm' || rawHinhThuc === 'nhom';
        const classType = isGroup ? 'group' : '1v1';
        const goiHoc = String(r[7] || '').trim();
        const totalSessions = parseGoi(goiHoc) || 16;

        // 1. Tạo HV nếu chưa có
        let studentId = studentByName.get(name);
        if (!studentId) {
          const newId = `hv-${String(nextHvNum).padStart(3, '0')}`;
          nextHvNum++;
          await db.query(
            `INSERT INTO students (id, name, dob, instrument, level, phone, status, total_sessions, note)
             VALUES (?, ?, ?, ?, 'Sơ cấp', '0000000000', 'active', ?, ?)`,
            [newId, name, dob, instrument, totalSessions, `Import từ Excel - GV: ${r[5]||''}`]
          );
          studentByName.set(name, newId);
          studentId = newId;
          created.push({ id: newId, name, instrument });
        }

        // 2. Tạo/tìm lớp và gán HV
        let classId = null;

        if (isGroup) {
          // Lớp nhóm: dùng chung cho nhiều HV cùng GV + nhạc cụ
          const groupKey = `${teacherId}|${instrument}|group`;
          if (groupClassMap.has(groupKey)) {
            classId = groupClassMap.get(groupKey);
          } else {
            // Tìm lớp nhóm đã có
            const [existGroup] = await db.query(
              `SELECT id FROM classes WHERE teacher_id=? AND instrument=? AND type='group' AND status='Đang học' LIMIT 1`,
              [teacherId, instrument]
            );
            if (existGroup.length) {
              classId = existGroup[0].id;
            } else {
              // Tạo lớp nhóm mới
              const className = `${instrument} Nhóm - ${teachers.find(t=>t.id===teacherId)?.name||''}`;
              const [res2] = await db.query(
                `INSERT INTO classes (name, instrument, type, teacher_id, status)
                 VALUES (?, ?, 'group', ?, 'Đang học')`,
                [className, instrument, teacherId]
              );
              classId = res2.insertId;
            }
            groupClassMap.set(groupKey, classId);
          }
        } else {
          // Lớp 1-1: mỗi HV 1 lớp riêng
          const className = `${instrument} 1-1 ${name}`;
          const classNameLow = className.toLowerCase().trim();
          if (classByName.has(classNameLow)) {
            classId = classByName.get(classNameLow);
          } else {
            const [res2] = await db.query(
              `INSERT INTO classes (name, instrument, type, teacher_id, status)
               VALUES (?, ?, '1v1', ?, 'Đang học')`,
              [className, instrument, teacherId]
            );
            classId = res2.insertId;
            classByName.set(classNameLow, classId);
          }
        }

        // 3. Gán HV vào lớp nếu chưa có
        const csKey = `${classId}|${studentId}`;
        if (classId && !csSet.has(csKey)) {
          await db.query(
            'INSERT INTO class_students (class_id, student_id, course_number) VALUES (?,?,1)',
            [classId, studentId]
          );
          csSet.add(csKey);
        }
      }
    }

    res.json({ success: true, created });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── PREVIEW chấm công GV ────────────────────────────────────────────────────
router.post('/checkin-preview', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });

    // Map tên GV → teacher_id
    const [teachers] = await db.query('SELECT id, name FROM teachers');
    const SHEET_TEACHER = {};
    for (const t of teachers) {
      // sheet "Dương" → GV Đinh Văn Dương, sheet "Tiến" → GV Lê Hữu Tiến
      for (const sName of wb.SheetNames) {
        const sLow = sName.toLowerCase().trim();
        const tLow = t.name.toLowerCase();
        if (tLow.includes(sLow) || sLow.includes(tLow.split(' ').pop())) {
          SHEET_TEACHER[sName] = t.id;
        }
      }
    }

    // Map tên HV → student_id
    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    // Map (student_id, teacher_id) → class_id
    const [links] = await db.query(`
      SELECT cs.student_id, cs.class_id, c.teacher_id, c.name AS class_name, c.teacher_salary
      FROM class_students cs JOIN classes c ON cs.class_id = c.id
    `);

    const preview = [];
    let totalSessions = 0;

    for (const [sheetName, teacherId] of Object.entries(SHEET_TEACHER)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      let currentMonth = null;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;

        // Dòng header tháng (VD: "Tháng 4", "Tháng 5")
        const cell0 = String(r[0] || '').trim();
        if (cell0.toLowerCase().startsWith('tháng')) {
          currentMonth = cell0;
          continue;
        }
        // Bỏ dòng STT header
        if (cell0 === 'STT' || !cell0 || isNaN(Number(cell0))) continue;

        const rawName = String(r[1] || '').trim();
        if (!rawName) continue;
        const name = CHECKIN_NAME_ALIAS[rawName] || NAME_ALIAS[rawName] || rawName;
        const studentId = studentByName.get(name);

        // Đếm ngày dạy hợp lệ
        const dates = [];
        for (let j = 2; j < r.length; j++) {
          const d = toDate(r[j]);
          if (d) dates.push(d);
        }
        if (!dates.length) continue;

        // Tìm class_id
        const cls = links.find(l => l.student_id === studentId && l.teacher_id === teacherId);

        preview.push({
          teacher_id: teacherId,
          teacher_name: teachers.find(t => t.id === teacherId)?.name || sheetName,
          student_name: rawName,
          found_student: !!studentId,
          found_class: !!cls,
          class_name: cls?.class_name || '—',
          salary_per_session: cls?.teacher_salary || 0,
          month: currentMonth,
          sessions: dates.length,
          dates,
        });
        totalSessions += dates.length;
      }
    }

    res.json({ success: true, preview, totalSessions, sheets: Object.keys(SHEET_TEACHER) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── IMPORT chấm công GV ─────────────────────────────────────────────────────
router.post('/checkin', auth, role('admin'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Chưa chọn file!' });
    const wb = XLSX.read(req.file.buffer, { cellDates: true });

    const [teachers] = await db.query('SELECT id, name FROM teachers');
    const SHEET_TEACHER = {};
    for (const t of teachers) {
      for (const sName of wb.SheetNames) {
        const sLow = sName.toLowerCase().trim();
        const tLow = t.name.toLowerCase();
        if (tLow.includes(sLow) || sLow.includes(tLow.split(' ').pop())) {
          SHEET_TEACHER[sName] = t.id;
        }
      }
    }

    const [students] = await db.query('SELECT id, TRIM(name) AS name FROM students');
    const studentByName = new Map(students.map(s => [s.name, s.id]));

    const [links] = await db.query(`
      SELECT cs.student_id, cs.class_id, c.teacher_id, c.teacher_salary
      FROM class_students cs JOIN classes c ON cs.class_id = c.id
    `);

    // Xóa checkin cũ từ Excel
    const [del] = await db.query("DELETE FROM checkin WHERE note LIKE 'Import từ Excel%'");

    const values = [];
    let imported = 0, skipped = 0;

    for (const [sheetName, teacherId] of Object.entries(SHEET_TEACHER)) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r) continue;
        const cell0 = String(r[0] || '').trim();
        if (cell0.toLowerCase().startsWith('tháng') || cell0 === 'STT' || !cell0 || isNaN(Number(cell0))) continue;

        const rawName = String(r[1] || '').trim();
        if (!rawName) continue;
        const name = CHECKIN_NAME_ALIAS[rawName] || NAME_ALIAS[rawName] || rawName;
        const studentId = studentByName.get(name);
        if (!studentId) { skipped++; continue; }

        const cls = links.find(l => l.student_id === studentId && l.teacher_id === teacherId);
        if (!cls) { skipped++; continue; }

        for (let j = 2; j < r.length; j++) {
          const date = toDate(r[j]);
          if (!date) continue;
          values.push([
            randomUUID(), teacherId, cls.class_id, date,
            cls.teacher_salary || 0,
            'Import từ Excel',
          ]);
          imported++;
        }
      }
    }

    if (values.length) {
      await db.query(
        `INSERT INTO checkin (id, teacher_id, class_id, date, salary_earned, note) VALUES ?`,
        [values]
      );
    }

    res.json({ success: true, deleted: del.affectedRows, imported, skipped });
  } catch (err) { res.status(500).json({ message: err.message }); }
});