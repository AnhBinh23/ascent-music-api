const router = require('express').Router();
const ctrl   = require('../controllers/teacherController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/', auth, ctrl.getAll);

// GET /api/teachers/salary?month=06&year=2026 — lương theo từng lớp
router.get('/salary', auth, role('admin'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const [rows] = await db.query(`
      SELECT
        t.id, t.name, t.instrument, t.phone,
        c.id            AS class_id,
        c.name          AS class_name,
        c.type          AS class_type,
        COALESCE(c.teacher_salary, 0)         AS teacher_salary,
        COALESCE(c.teacher_salary_partial, 0) AS teacher_salary_partial,
        COALESCE(COUNT(ci.id), 0)             AS sessions_this_month,

        -- Buổi đủ HV (lương đầy đủ)
        COALESCE(SUM(
          CASE WHEN ci.salary_earned >= c.teacher_salary AND c.teacher_salary > 0
          THEN 1 ELSE 0 END
        ), 0) AS sessions_full,

        -- Buổi có HV vắng (lương giảm)
        COALESCE(SUM(
          CASE WHEN ci.salary_earned > 0
            AND ci.salary_earned < c.teacher_salary
          THEN 1 ELSE 0 END
        ), 0) AS sessions_partial,

        COALESCE(
          SUM(ci.salary_earned),
          COUNT(ci.id) * COALESCE(c.teacher_salary, 0)
        ) AS class_salary

      FROM teachers t
      LEFT JOIN classes c
        ON c.teacher_id = t.id AND c.status = 'Đang học'
      LEFT JOIN checkin ci
        ON ci.teacher_id = t.id
        AND ci.class_id  = c.id
        AND MONTH(ci.date) = ?
        AND YEAR(ci.date)  = ?
      WHERE t.status = 'active'
      GROUP BY
        t.id, t.name, t.instrument, t.phone,
        c.id, c.name, c.type,
        c.teacher_salary, c.teacher_salary_partial
      ORDER BY t.name ASC, c.name ASC
    `, [month, year]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/teachers/by-user/:userId
router.get('/by-user/:userId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM teachers WHERE user_id = ?', [req.params.userId]
    );
    res.json({ success: true, row: rows[0] || null });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/absent-sessions', auth, role('admin'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const [rows] = await db.query(`
      SELECT
        ci.id           AS checkin_id,
        ci.date,
        ci.salary_earned,
        ci.note         AS checkin_note,
        t.id            AS teacher_id,
        t.name          AS teacher_name,
        c.id            AS class_id,
        c.name          AS class_name,
        c.type          AS class_type,
        c.teacher_salary,
        (SELECT COUNT(*) FROM class_students cs2 WHERE cs2.class_id = c.id) AS total_students,
        (SELECT COUNT(*) FROM attendance a WHERE a.class_id = c.id AND a.date = ci.date AND a.status IN ('present','late')) AS present_count,
        (SELECT COUNT(*) FROM attendance a WHERE a.class_id = c.id AND a.date = ci.date AND a.status IN ('absent','excused')) AS absent_count
      FROM checkin ci
      JOIN teachers t ON ci.teacher_id = t.id
      JOIN classes  c ON ci.class_id   = c.id
      WHERE c.type = 'group'
        AND MONTH(ci.date) = ?
        AND YEAR(ci.date)  = ?
      HAVING absent_count > 0
      ORDER BY t.name ASC, ci.date ASC
    `, [month, year]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});


router.patch('/checkin/:checkinId/salary', auth, role('admin'), async (req, res) => {
  try {
    const { salary_earned, note } = req.body;
    await db.query(
      'UPDATE checkin SET salary_earned=?, note=? WHERE id=?',
      [Number(salary_earned) || 0, note || '', req.params.checkinId]
    );
    res.json({ success: true, message: 'Đã cập nhật lương buổi!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
router.get('/:id',    auth,                         ctrl.getById);
router.post('/',      auth, role('admin','staff'),   ctrl.create);
router.put('/:id',    auth, role('admin','staff'),   ctrl.update);
router.delete('/:id', auth, role('admin','staff'),   ctrl.delete);

module.exports = router;