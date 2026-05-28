const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// GET /api/salary/payments
router.get('/', auth, role('admin'), async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM salary_payments ORDER BY month DESC, paid_at DESC');
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/salary/payments
router.post('/', auth, role('admin'), async (req, res) => {
  try {
    const { teacher_id, month, amount, status = 'paid', note } = req.body;
    await db.query(
      `INSERT INTO salary_payments (teacher_id, month, amount, status, note)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount=VALUES(amount), status=VALUES(status), note=VALUES(note), paid_at=NOW()`,
      [teacher_id, month, amount, status, note]
    );
    res.json({ success: true, message: 'Đã thanh toán lương!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/salary/payments/:teacherId/:month
router.delete('/:teacherId/:month', auth, role('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM salary_payments WHERE teacher_id = ? AND month = ?',
      [req.params.teacherId, req.params.month]);
    res.json({ success: true, message: 'Đã hoàn tác!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;