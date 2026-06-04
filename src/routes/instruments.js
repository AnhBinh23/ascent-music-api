const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../models/db');

// GET tất cả nhạc cụ (kèm tên phòng)
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT i.*, r.name AS room_name
      FROM instruments i
      LEFT JOIN rooms r ON i.room_id = r.id
      ORDER BY i.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST thêm nhạc cụ
router.post('/', auth, async (req, res) => {
  try {
    const { name, type = 'Piano', room_id = null, status = 'Tốt', purchase_date = null, note = null } = req.body;
    if (!name) return res.status(400).json({ message: 'Thiếu tên nhạc cụ!' });
    await db.query(
      'INSERT INTO instruments (name, type, room_id, status, purchase_date, note) VALUES (?,?,?,?,?,?)',
      [name, type, room_id || null, status, purchase_date || null, note]
    );
    res.json({ success: true, message: 'Thêm nhạc cụ thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT cập nhật
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, type, room_id, status, purchase_date, note } = req.body;
    const fields = [], values = [];
    if (name          !== undefined) { fields.push('name=?');          values.push(name); }
    if (type          !== undefined) { fields.push('type=?');          values.push(type); }
    if (room_id       !== undefined) { fields.push('room_id=?');       values.push(room_id || null); }
    if (status        !== undefined) { fields.push('status=?');        values.push(status); }
    if (purchase_date !== undefined) { fields.push('purchase_date=?'); values.push(purchase_date || null); }
    if (note          !== undefined) { fields.push('note=?');          values.push(note); }
    if (!fields.length) return res.status(400).json({ message: 'Không có dữ liệu cập nhật!' });
    values.push(req.params.id);
    await db.query(`UPDATE instruments SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM instruments WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa nhạc cụ!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;