const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, t.name AS teacher_name, r.name AS room_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN rooms    r ON c.room_id    = r.id
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ⚠️ Phải đặt trước /:id
router.get('/:id/students', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.* FROM students s
      INNER JOIN class_students cs ON cs.student_id = s.id
      WHERE cs.class_id = ?
    `, [req.params.id]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM classes WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true, row: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth, role('admin','staff'), async (req, res) => {
  try {
    const { name,instrument,type,teacher_id,room_id,max_students,
            level,tuition_fee,schedule,start_date,end_date,status,note } = req.body;
    await db.query(
      `INSERT INTO classes
       (name,instrument,type,teacher_id,room_id,max_students,level,tuition_fee,schedule,start_date,end_date,status,note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [name,instrument,type,teacher_id,room_id,max_students,
       level,tuition_fee,schedule,start_date,end_date,status,note]
    );
    res.json({ success: true, message: 'Tạo lớp học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  try {
    const { name,instrument,type,teacher_id,room_id,max_students,
            level,tuition_fee,schedule,start_date,end_date,status,note } = req.body;
    await db.query(
      `UPDATE classes SET name=?,instrument=?,type=?,teacher_id=?,room_id=?,
       max_students=?,level=?,tuition_fee=?,schedule=?,start_date=?,end_date=?,status=?,note=?
       WHERE id=?`,
      [name,instrument,type,teacher_id,room_id,max_students,
       level,tuition_fee,schedule,start_date,end_date,status,note,req.params.id]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', auth, role('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lớp học!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;