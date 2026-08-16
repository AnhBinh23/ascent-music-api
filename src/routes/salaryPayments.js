const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/', auth, async (req, res) => {
  try {
    let rows;
    if (req.user.role === 'admin' || req.user.role === 'staff') {
      [rows] = await db.query('SELECT * FROM salary_payments ORDER BY month DESC, paid_at DESC');
    } else {
      const [teachers] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
      const tid = teachers[0]?.id;
      if (!tid) return res.json({ success: true, rows: [] });
      [rows] = await db.query('SELECT * FROM salary_payments WHERE teacher_id = ? ORDER BY month DESC, paid_at DESC', [tid]);
    }
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth, role('admin', 'staff'), async (req, res) => {
  try {
    const { teacher_id, month, amount, status = 'paid', note } = req.body;
    const [existing] = await db.query(
      'SELECT id, amount, note FROM salary_payments WHERE teacher_id = ? AND month = ?',
      [teacher_id, month]
    );
    if (existing.length) {
      const oldAmount = Number(existing[0].amount);
      const newAmount = oldAmount + Number(amount);
      const oldNote = existing[0].note || '';
      const newNote = note ? (oldNote ? `${oldNote} | ${note}` : note) : oldNote;
      await db.query(
        'UPDATE salary_payments SET amount = ?, note = ?, paid_at = NOW() WHERE teacher_id = ? AND month = ?',
        [newAmount, newNote, teacher_id, month]
      );
      res.json({ success: true, message: `Đã cộng thêm! Tổng: ${newAmount.toLocaleString()}đ` });
    } else {
      await db.query(
        'INSERT INTO salary_payments (teacher_id, month, amount, status, note) VALUES (?,?,?,?,?)',
        [teacher_id, month, amount, status, note]
      );
      res.json({ success: true, message: 'Đã thanh toán lương!' });
    }
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', auth, role('admin', 'staff'), async (req, res) => {
  try {
    const { amount, note } = req.body;
    await db.query(
      'UPDATE salary_payments SET amount = ?, note = ?, paid_at = NOW() WHERE id = ?',
      [amount, note || '', req.params.id]
    );
    res.json({ success: true, message: 'Đã cập nhật lương!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:teacherId/:month', auth, role('admin', 'staff'), async (req, res) => {
  try {
    await db.query('DELETE FROM salary_payments WHERE teacher_id = ? AND month = ?',
      [req.params.teacherId, req.params.month]);
    res.json({ success: true, message: 'Đã hoàn tác!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;