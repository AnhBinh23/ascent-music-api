const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/', auth, async (req, res) => {
  const [rows] = await db.query(`
    SELECT c.*, t.name as teacher_name, r.name as room_name
    FROM classes c
    LEFT JOIN teachers t ON c.teacher_id = t.id
    LEFT JOIN rooms r    ON c.room_id = r.id
    ORDER BY c.created_at DESC
  `);
  res.json({ success: true, rows });
});

router.get('/:id', auth, async (req, res) => {
  const [rows] = await db.query('SELECT * FROM classes WHERE id = ?', [req.params.id]);
  res.json({ success: true, row: rows[0] });
});

router.post('/', auth, role('admin','staff'), async (req, res) => {
  const { name,instrument,type,teacher_id,room_id,max_students,level,tuition_fee,schedule,start_date,end_date,status,note } = req.body;
  await db.query(
    'INSERT INTO classes (name,instrument,type,teacher_id,room_id,max_students,level,tuition_fee,schedule,start_date,end_date,status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [name,instrument,type,teacher_id,room_id,max_students,level,tuition_fee,schedule,start_date,end_date,status,note]
  );
  res.json({ success: true, message: 'Tạo lớp học thành công!' });
});

router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  const { name,instrument,type,teacher_id,room_id,max_students,level,tuition_fee,schedule,start_date,end_date,status,note } = req.body;
  await db.query(
    'UPDATE classes SET name=?,instrument=?,type=?,teacher_id=?,room_id=?,max_students=?,level=?,tuition_fee=?,schedule=?,start_date=?,end_date=?,status=?,note=? WHERE id=?',
    [name,instrument,type,teacher_id,room_id,max_students,level,tuition_fee,schedule,start_date,end_date,status,note,req.params.id]
  );
  res.json({ success: true, message: 'Cập nhật thành công!' });
});

router.delete('/:id', auth, role('admin'), async (req, res) => {
  await db.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Đã xóa lớp học!' });
});

module.exports = router;