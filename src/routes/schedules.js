const router = require('express').Router();
const ctrl   = require('../controllers/scheduleController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');                    // ← THÊM dòng này

router.get('/',                    auth, ctrl.getAll);
router.get('/teacher/:teacherId',  auth, ctrl.getByTeacher);

// ↓↓↓ THÊM route này vào ↓↓↓
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT sc.*, c.name AS class_name, c.instrument,
             t.name AS teacher_name, r.name AS room_name
      FROM class_students cs
      JOIN classes c    ON cs.class_id = c.id
      JOIN schedules sc ON sc.class_id = c.id
      LEFT JOIN teachers t ON sc.teacher_id = t.id
      LEFT JOIN rooms r    ON sc.room_id    = r.id
      WHERE cs.student_id = ? AND sc.status = 'active'
      ORDER BY sc.day_of_week, sc.time_start
    `, [req.params.studentId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
// ↑↑↑ hết phần thêm ↑↑↑

router.post('/',   auth, role('admin','staff'),            ctrl.create);
router.put('/:id', auth, role('admin','staff','teacher'),  ctrl.update);
router.delete('/:id', auth, role('admin','staff'),         ctrl.delete);

module.exports = router;