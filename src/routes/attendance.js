const router = require('express').Router();
const ctrl   = require('../controllers/attendanceController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/class/:classId',     auth, ctrl.getByClass);
router.get('/student/:studentId', auth, ctrl.getByStudent);
router.post('/save',              auth, ctrl.save);

router.get('/stats/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT COUNT(*) AS total,
        SUM(status='present') AS present, SUM(status='absent') AS absent,
        SUM(status='late') AS late, SUM(status='excused') AS excused
      FROM attendance WHERE student_id = ?
    `, [req.params.studentId]);
    const r = rows[0];
    res.json({ success: true,
      ...Object.fromEntries(Object.entries(r).map(([k,v]) => [k, Number(v)])),
      rate: r.total > 0 ? Math.round(r.present / r.total * 100) : 0 });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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

// Tổng quan TẤT CẢ học viên — CHỈ tính buổi của khóa hiện tại (s.current_course)
router.get('/course-progress', auth, role('admin','staff'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.id             AS student_id,
        s.name           AS student_name,
        s.phone          AS student_phone,
        s.total_sessions,
        s.current_course,
        s.instrument,
        s.level,
        s.nickname,
        COALESCE(c.id,   NULL) AS class_id,
        COALESCE(c.name, NULL) AS class_name,
        COALESCE(t.name, NULL) AS teacher_name,
        c.type           AS class_type,
        COUNT(CASE WHEN a.status IN ('present','late') AND a.course_number = s.current_course THEN 1 END) AS attended,
        COUNT(CASE WHEN a.course_number = s.current_course THEN 1 END) AS total_sessions_current
      FROM students s
      LEFT JOIN class_students cs ON cs.student_id = s.id
      LEFT JOIN classes  c  ON c.id  = cs.class_id
      LEFT JOIN teachers t  ON t.id  = c.teacher_id
      LEFT JOIN attendance a ON a.student_id = s.id AND (a.class_id = c.id OR a.home_class_id = c.id)
      WHERE s.status IN ('active', 'paused')
      GROUP BY s.id, s.name, s.phone, s.total_sessions, s.current_course, s.instrument, s.level, s.nickname,
               c.id, c.name, t.name, c.type
      ORDER BY
        (s.total_sessions - COUNT(CASE WHEN a.status IN ('present','late') AND a.course_number = s.current_course THEN 1 END)) ASC,
        s.name ASC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Chi tiết buổi của 1 HV trong 1 lớp — CHỈ khóa hiện tại
router.get('/student-sessions/:studentId/:classId', auth, async (req, res) => {
  try {
    const { course } = req.query;
    const courseFilter = course ? Number(course) : null;
    const [rows] = await db.query(`
      SELECT a.*, sc.time_start, sc.time_end, a.is_guest,
        c.name AS attended_class_name
      FROM attendance a
      LEFT JOIN schedules sc ON sc.class_id = a.class_id
        AND sc.day_of_week = DAYOFWEEK(a.date)
      LEFT JOIN classes c ON c.id = a.class_id
      WHERE a.student_id = ? AND (a.class_id = ? OR a.home_class_id = ?)
        AND a.course_number = COALESCE(?, (SELECT current_course FROM students WHERE id = a.student_id))
      ORDER BY a.date ASC
    `, [req.params.studentId, req.params.classId, req.params.classId, courseFilter]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/table/:classId', auth, role('admin','staff'), async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT s.id, s.name, s.total_sessions,
        c.type AS class_type, c.instrument,
        cs.course_number AS student_course
      FROM students s
      INNER JOIN class_students cs ON cs.student_id = s.id
      INNER JOIN classes c ON c.id = cs.class_id
      WHERE cs.class_id = ?
      ORDER BY s.name ASC
    `, [req.params.classId]);

    const [records] = await db.query(`
      SELECT student_id, date, status, note, course_number
      FROM attendance WHERE class_id = ?
      ORDER BY student_id, date ASC
    `, [req.params.classId]);

    const byStudent = {};
    records.forEach(r => {
      if (!byStudent[r.student_id]) byStudent[r.student_id] = [];
      byStudent[r.student_id].push(r);
    });

    const result = students.map(s => ({ ...s, sessions: byStudent[s.id] || [] }));
    const maxSessions = Math.max(...result.map(r => Math.max(r.sessions.length, r.total_sessions || 0)), 0);

    res.json({ success: true, rows: result, maxSessions });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Bảng tổng hợp TẤT CẢ học viên — xem được TẤT CẢ khóa (có course_number để lọc)
router.get('/all-table', auth, role('admin','staff'), async (req, res) => {
  try {
    const [students] = await db.query(`
      SELECT DISTINCT
        s.id, s.name, s.total_sessions,
        c.id   AS class_id,
        c.name AS class_name,
        c.type AS class_type,
        c.instrument,
        t.name AS teacher_name,
        cs.course_number AS student_course
      FROM students s
      INNER JOIN class_students cs ON cs.student_id = s.id
      INNER JOIN classes  c ON c.id  = cs.class_id
      LEFT JOIN  teachers t ON t.id  = c.teacher_id
      WHERE s.status = 'active'
      ORDER BY c.name ASC, s.name ASC
    `);

    if (!students.length) return res.json({ success: true, rows: [], maxSessions: 0 });

    const [records] = await db.query(`
      SELECT student_id, class_id, date, status, note, course_number
      FROM attendance
      ORDER BY student_id, class_id, date ASC
    `);

    const byKey = {};
    records.forEach(r => {
      const key = r.student_id + '_' + r.class_id;
      if (!byKey[key]) byKey[key] = [];
      byKey[key].push(r);
    });

    const result = students.map(s => ({
      ...s,
      sessions: byKey[s.id + '_' + s.class_id] || [],
    }));

    const maxSessions = Math.max(
      ...result.map(r => Math.max(r.sessions.length, r.total_sessions || 0)), 0
    );

    res.json({ success: true, rows: result, maxSessions });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.get('/search-guest', auth, ctrl.searchGuest);
module.exports = router;