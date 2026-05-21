const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../models/db');

router.get('/', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM rooms ORDER BY name');
  res.json({ success: true, rows });
});

router.post('/', auth, async (req, res) => {
  const { name, capacity, equipment, note } = req.body;
  await db.query(
    'INSERT INTO rooms (name, capacity, equipment, note) VALUES (?,?,?,?)',
    [name, capacity, equipment, note]
  );
  res.json({ success: true, message: 'Thêm phòng thành công!' });
});

module.exports = router;