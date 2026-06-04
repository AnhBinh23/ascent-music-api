const router = require('express').Router();
const auth   = require('../middleware/auth');
const db     = require('../models/db');

// GET tất cả phòng
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM rooms ORDER BY name');
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST thêm phòng
router.post('/', auth, async (req, res) => {
  try {
    const { name, capacity, equipment, status = 'Trống', note } = req.body;
    if (!name) return res.status(400).json({ message: 'Thiếu tên phòng!' });
    await db.query(
      'INSERT INTO rooms (name, capacity, equipment, status, note) VALUES (?,?,?,?,?)',
      [name, capacity || 2, equipment || null, status, note || null]
    );
    res.json({ success: true, message: 'Thêm phòng thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT cập nhật phòng (đổi status hoặc sửa thông tin)
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, capacity, equipment, status, note } = req.body;
    const fields = [], values = [];
    if (name      !== undefined) { fields.push('name=?');      values.push(name); }
    if (capacity  !== undefined) { fields.push('capacity=?');  values.push(capacity); }
    if (equipment !== undefined) { fields.push('equipment=?'); values.push(equipment); }
    if (status    !== undefined) { fields.push('status=?');    values.push(status); }
    if (note      !== undefined) { fields.push('note=?');      values.push(note); }
    if (!fields.length) return res.status(400).json({ message: 'Không có dữ liệu cập nhật!' });
    values.push(req.params.id);
    await db.query(`UPDATE rooms SET ${fields.join(',')} WHERE id=?`, values);
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE xóa phòng
router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM rooms WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa phòng!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;