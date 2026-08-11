const router = require('express').Router();
const ctrl   = require('../controllers/scheduleController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/',                    auth, ctrl.getAll);
router.get('/teacher/:teacherId',  auth, ctrl.getByTeacher);

// Lịch học của 1 HV
router.get('/student/:studentId', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT sc.*, c.name AS class_name, c.instrument,
             t.name AS teacher_name, r.name AS room_name
      FROM class_students cs
      JOIN classes c    ON cs.class_id = c.id
      JOIN schedules sc ON sc.class_id = c.id
      LEFT JOIN teachers t ON sc.teacher_id = t.id
      LEFT JOIN rooms r    ON sc.room_id    = r.id
      WHERE cs.student_id = ? AND sc.status = 'active'
      ORDER BY sc.day_of_week, sc.time_start
    `, [req.params.studentId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Tạo lịch — admin/staff/teacher (teacher chỉ lớp mình)
router.post('/', auth, role('admin','staff','teacher'), async (req, res) => {
  try {
    const { class_id, day_of_week, time_start, time_end, room_id } = req.body;
    if (!class_id || !day_of_week || !time_start || !time_end) {
      return res.status(400).json({ message: 'Thiếu thông tin!' });
    }

    // Nếu là teacher → kiểm tra lớp thuộc về mình
    if (req.user.role === 'teacher') {
      const [tRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
      if (!tRows.length) return res.status(403).json({ message: 'Không tìm thấy giáo viên!' });
      const [cRows] = await db.query('SELECT id FROM classes WHERE id = ? AND teacher_id = ?', [class_id, tRows[0].id]);
      if (!cRows.length) return res.status(403).json({ message: 'Lớp này không thuộc về bạn!' });
    }

    // Lấy teacher_id từ class
    const [[cls]] = await db.query('SELECT teacher_id FROM classes WHERE id = ?', [class_id]);

    await db.query(
      `INSERT INTO schedules (class_id, teacher_id, room_id, day_of_week, time_start, time_end, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [class_id, cls?.teacher_id || null, room_id || null, day_of_week, time_start, time_end]
    );
    res.json({ success: true, message: 'Đã thêm lịch dạy!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/:id', auth, role('admin','staff','teacher'), ctrl.update);

// Xóa lịch — admin/staff/teacher (teacher chỉ lớp mình)
router.delete('/:id', auth, role('admin','staff','teacher'), async (req, res) => {
  try {
    // Nếu là teacher → kiểm tra lịch thuộc lớp mình
    if (req.user.role === 'teacher') {
      const [tRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [req.user.id]);
      if (!tRows.length) return res.status(403).json({ message: 'Không tìm thấy giáo viên!' });
      const [sRows] = await db.query(
        `SELECT s.id FROM schedules s JOIN classes c ON s.class_id = c.id
         WHERE s.id = ? AND c.teacher_id = ?`, [req.params.id, tRows[0].id]
      );
      if (!sRows.length) return res.status(403).json({ message: 'Không có quyền xóa lịch này!' });
    }
    await db.query('DELETE FROM schedules WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lịch!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;