const router = require('express').Router();
const ctrl   = require('../controllers/attendanceController');
const auth   = require('../middleware/auth');
const db     = require('../models/db');

router.get('/class/:classId',     auth, ctrl.getByClass);
router.get('/student/:studentId', auth, ctrl.getByStudent);
router.post('/save',              auth, ctrl.save);

// Thống kê điểm danh của học viên
router.get('/stats/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(*)                    AS total,
        SUM(status = 'present')     AS present,
        SUM(status = 'absent')      AS absent,
        SUM(status = 'late')        AS late,
        SUM(status = 'excused')     AS excused
      FROM attendance
      WHERE student_id = ?
    `, [req.params.studentId]);
    const r    = rows[0];
    const rate = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
    res.json({
      success: true,
      total:   Number(r.total),
      present: Number(r.present),
      absent:  Number(r.absent),
      late:    Number(r.late),
      excused: Number(r.excused),
      rate,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Lấy điểm danh của học viên
router.get('/student-history/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT a.*, c.name AS class_name
      FROM attendance a
      LEFT JOIN classes c ON a.class_id = c.id
      WHERE a.student_id = ?
      ORDER BY a.date DESC
    `, [req.params.studentId]);
    res.json({ success: true, rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;