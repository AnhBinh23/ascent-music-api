const router = require('express').Router();
const ctrl   = require('../controllers/attendanceController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/class/:classId',     auth, ctrl.getByClass);
router.get('/student/:studentId', auth, ctrl.getByStudent);
router.post('/save',              auth, ctrl.save);

// Thống kê điểm danh học viên
router.get('/stats/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT COUNT(*) AS total,
        SUM(status='present') AS present, SUM(status='absent') AS absent,
        SUM(status='late')    AS late,    SUM(status='excused') AS excused
      FROM attendance WHERE student_id = ?
    `, [req.params.studentId]);
    const r = rows[0];
    res.json({ success: true, ...Object.fromEntries(Object.entries(r).map(([k,v]) => [k, Number(v)])),
      rate: r.total > 0 ? Math.round(r.present / r.total * 100) : 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Lịch sử buổi học của học viên trong lớp
router.get('/student-history/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, c.name AS class_name
      FROM attendance a LEFT JOIN classes c ON a.class_id = c.id
      WHERE a.student_id = ? ORDER BY a.date DESC
    `, [req.params.studentId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Tiến độ khóa học
router.get('/course-progress', auth, role('admin','staff'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.id AS student_id, s.name AS student_name, s.phone AS student_phone,
        c.id AS class_id, c.name AS class_name, c.instrument, c.type AS class_type,
        t.name AS teacher_name,
        COUNT(CASE WHEN a.status IN ('present','late') THEN 1 END) AS attended,
        COALESCE((SELECT MAX(i.sessions) FROM invoices i
          WHERE i.student_id = s.id AND i.status = 'paid' LIMIT 1), 0) AS total_sessions
      FROM class_students cs
      JOIN students s ON cs.student_id = s.id
      JOIN classes  c ON cs.class_id   = c.id
      LEFT JOIN teachers  t ON c.teacher_id = t.id
      LEFT JOIN attendance a ON a.student_id = s.id AND a.class_id = c.id
      GROUP BY s.id, s.name, s.phone, c.id, c.name, c.instrument, c.type, t.name
      ORDER BY s.name ASC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Chi tiết buổi học (cho modal)
router.get('/student-sessions/:studentId/:classId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, sc.time_start, sc.time_end
      FROM attendance a
      LEFT JOIN schedules sc ON sc.class_id = a.class_id
        AND sc.day_of_week = DAYOFWEEK(a.date)
      WHERE a.student_id = ? AND a.class_id = ?
      ORDER BY a.date ASC
    `, [req.params.studentId, req.params.classId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// BẢNG TỔNG HỢP — tất cả học viên trong lớp x từng buổi học
router.get('/table/:classId', auth, role('admin','staff'), async (req, res) => {
  try {
    // Học viên trong lớp
    const [students] = await db.query(`
      SELECT s.id, s.name,
        c.type AS class_type, c.instrument,
        COALESCE((SELECT MAX(i.sessions) FROM invoices i
          WHERE i.student_id = s.id AND i.status = 'paid'), 0) AS total_sessions
      FROM students s
      INNER JOIN class_students cs ON cs.student_id = s.id
      INNER JOIN classes c ON c.id = cs.class_id
      WHERE cs.class_id = ?
      ORDER BY s.name ASC
    `, [req.params.classId]);

    // Tất cả điểm danh của lớp
    const [records] = await db.query(`
      SELECT student_id, date, status, note
      FROM attendance WHERE class_id = ?
      ORDER BY student_id, date ASC
    `, [req.params.classId]);

    // Nhóm theo học viên
    const byStudent = {};
    records.forEach(r => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = [];
      byStudent[r.student_id].push(r);
    });

    const result = students.map(s => ({
      ...s,
      sessions: (byStudent[s.id] || []),
    }));

    // Số buổi tối đa
    const maxSessions = Math.max(...result.map(r => Math.max(r.sessions.length, r.total_sessions || 0)), 0);

    res.json({ success: true, rows: result, maxSessions });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;