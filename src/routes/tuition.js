const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/', auth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT t.*, s.name as student_name, s.instrument
    FROM tuition t LEFT JOIN students s ON t.student_id = s.id
    ORDER BY t.created_at DESC
  `);
  res.json({ success: true, rows });
});

router.get('/unpaid', auth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT t.*, s.name as student_name FROM tuition t
    LEFT JOIN students s ON t.student_id = s.id
    WHERE t.status != 'Đã thanh toán'
  `);
  res.json({ success: true, rows });
});

router.post('/', auth, role('admin','staff'), async (req, res) => {
  const { student_id, month, amount, method, note } = req.body;
  await db.query(
    'INSERT INTO tuition (student_id,month,amount,paid,status,method,note) VALUES (?,?,?,?,?,?,?)',
    [student_id, month, amount, amount, 'Đã thanh toán', method, note]
  );
  res.json({ success: true, message: 'Thu học phí thành công!' });
});

router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  const { paid, status, method } = req.body;
  await db.query(
    'UPDATE tuition SET paid=?, status=?, method=?, paid_date=CURDATE() WHERE id=?',
    [paid, status, method, req.params.id]
  );
  res.json({ success: true, message: 'Cập nhật học phí thành công!' });
});

module.exports = router;