const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// GET /api/makeup — tất cả (admin) hoặc theo GV
router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT m.*, s.name AS student_name, c.name AS class_name,
        t.name AS teacher_name, r.name AS room_name
      FROM makeup_sessions m
      LEFT JOIN students s ON m.student_id = s.id
      LEFT JOIN classes  c ON m.class_id   = c.id
      LEFT JOIN teachers t ON m.teacher_id = t.id
      LEFT JOIN rooms    r ON m.room_id    = r.id
    `;
    const params = [];

    // GV chỉ thấy của mình
    if (req.user.role === 'teacher') {
      const [tRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
      if (!tRows.length) return res.json({ success: true, rows: [] });
      query += ' WHERE m.teacher_id = ?';
      params.push(tRows[0].id);
    }

    query += ' ORDER BY m.created_at DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/makeup/pending — lịch bù chờ duyệt (admin)
router.get('/pending', auth, role('admin'), async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT m.*, s.name AS student_name, c.name AS class_name,
        t.name AS teacher_name, r.name AS room_name
      FROM makeup_sessions m
      LEFT JOIN students s ON m.student_id = s.id
      LEFT JOIN classes  c ON m.class_id   = c.id
      LEFT JOIN teachers t ON m.teacher_id = t.id
      LEFT JOIN rooms    r ON m.room_id    = r.id
      WHERE m.status = 'pending'
      ORDER BY m.makeup_date ASC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/makeup — GV tạo lịch bù + thông báo admin
router.post('/', auth, role('teacher','admin'), async (req, res) => {
  try {
    const { student_id, class_id, original_date, makeup_date, makeup_time_start, makeup_time_end, room_id, note } = req.body;
    if (!student_id || !class_id || !makeup_date || !makeup_time_start) {
      return res.status(400).json({ message: 'Thiếu thông tin!' });
    }

    // Lấy teacher_id
    let teacher_id;
    if (req.user.role === 'teacher') {
      const [tRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
      if (!tRows.length) return res.status(404).json({ message: 'Không tìm thấy giáo viên!' });
      teacher_id = tRows[0].id;
    } else {
      const [[cls]] = await db.query('SELECT teacher_id FROM classes WHERE id = ?', [class_id]);
      teacher_id = cls?.teacher_id;
    }

    await db.query(
      `INSERT INTO makeup_sessions (student_id, class_id, teacher_id, original_date, makeup_date, makeup_time_start, makeup_time_end, room_id, note)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [student_id, class_id, teacher_id, original_date || null, makeup_date, makeup_time_start, makeup_time_end || null, room_id || null, note || '']
    );

    // Thông báo admin
    const [stuRows] = await db.query('SELECT name FROM students WHERE id = ?', [student_id]);
    const [tRows] = await db.query('SELECT name FROM teachers WHERE id = ?', [teacher_id]);
    const stuName = stuRows[0]?.name || '';
    const teacherName = tRows[0]?.name || '';

    await db.query(
      `INSERT INTO notifications (title, message, type, target_role, created_by)
       VALUES (?, ?, 'makeup', 'admin', ?)`,
      [
        '📅 Lịch học bù mới',
        `GV ${teacherName} đã tạo lịch bù cho HV ${stuName} vào ngày ${makeup_date} lúc ${makeup_time_start}`,
        req.user.id,
      ]
    );

    res.json({ success: true, message: 'Đã tạo lịch học bù! Admin sẽ nhận thông báo.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/makeup/:id/status — admin duyệt/từ chối
router.patch('/:id/status', auth, role('admin'), async (req, res) => {
  try {
    const { status } = req.body; // confirmed | cancelled
    if (!['confirmed', 'cancelled', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ!' });
    }
    await db.query('UPDATE makeup_sessions SET status = ? WHERE id = ?', [status, req.params.id]);

    const statusText = status === 'confirmed' ? 'đã duyệt' : status === 'cancelled' ? 'đã từ chối' : 'hoàn thành';
    res.json({ success: true, message: `Lịch bù ${statusText}!` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/makeup/:id
router.delete('/:id', auth, role('admin','teacher'), async (req, res) => {
  try {
    await db.query('DELETE FROM makeup_sessions WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lịch bù!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;