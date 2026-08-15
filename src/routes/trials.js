const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');
const v      = require('../middleware/validate');
const { trialLimiter } = require('../middleware/rateLimiter');

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM trial_registrations ORDER BY created_at DESC');
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', trialLimiter, v.trial.create, async (req, res) => {
  try {
    const { name, phone, instrument, time, age, note } = req.body;
    await db.query(
      'INSERT INTO trial_registrations (name, phone, instrument, time, age, note) VALUES (?,?,?,?,?,?)',
      [name, phone, instrument, time, age, note]
    );
    res.json({ success: true, message: 'Đăng ký thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  const { status } = req.body;
  await db.query('UPDATE trial_registrations SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ success: true, message: 'Cập nhật thành công!' });
});

router.delete('/:id', auth, role('admin'), async (req, res) => {
  await db.query('DELETE FROM trial_registrations WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;