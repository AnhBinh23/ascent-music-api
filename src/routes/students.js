const router = require('express').Router();
const ctrl   = require('../controllers/studentController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/',       auth, ctrl.getAll);
router.get('/search', auth, ctrl.search);

// Tìm học viên theo user_id
router.get('/by-user/:userId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM students WHERE user_id = ?',
      [req.params.userId]
    );
    res.json({ success: true, row: rows[0] || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id',    auth, ctrl.getById);
router.post('/',      auth, role('admin','staff'), ctrl.create);
router.put('/:id',    auth, role('admin','staff'), ctrl.update);
router.delete('/:id', auth, role('admin','staff'), async (req, res) => {
  try {
    const id = req.params.id;
    // Xóa dữ liệu liên quan trước
    await db.query('DELETE FROM attendance WHERE student_id = ?', [id]);
    await db.query('DELETE FROM tuition WHERE student_id = ?', [id]);
    await db.query('DELETE FROM class_students WHERE student_id = ?', [id]);
    await db.query('DELETE FROM renewal_notes WHERE student_id = ?', [id]);
    // Xóa tài khoản user nếu có
    const [stu] = await db.query('SELECT user_id FROM students WHERE id = ?', [id]);
    if (stu[0]?.user_id) {
      await db.query('DELETE FROM push_subscriptions WHERE user_id = ?', [stu[0].user_id]);
      await db.query('DELETE FROM messages WHERE sender_id = ? OR receiver_id = ?', [stu[0].user_id, stu[0].user_id]);
      await db.query('DELETE FROM users WHERE id = ?', [stu[0].user_id]);
    }
    // Cuối cùng xóa HV
    await db.query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, message: 'Đã xóa học viên!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});
module.exports = router;