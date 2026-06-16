const router = require('express').Router();
const ctrl   = require('../controllers/classController');
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

// GET /api/classes
router.get('/', auth, async (req, res) => {
  try {
    const { teacher_id } = req.query;
    let query = `
      SELECT c.*, t.name AS teacher_name, r.name AS room_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN rooms    r ON c.room_id    = r.id
    `;
    const params = [];
    if (teacher_id) { query += ' WHERE c.teacher_id = ?'; params.push(teacher_id); }
    query += ' ORDER BY c.created_at DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/classes/:id/students — kèm course_number + tỉ lệ điểm danh
router.get('/:id/students', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*, cs.course_number,
        ROUND(
          COALESCE(
            (SELECT COUNT(*) FROM attendance a
             WHERE a.student_id = s.id AND a.class_id = ? AND a.status = 'present')
            * 100.0 /
            NULLIF((SELECT COUNT(*) FROM attendance a
                    WHERE a.student_id = s.id AND a.class_id = ?), 0)
          , 0)
        , 0) AS attendance_rate
      FROM students s
      INNER JOIN class_students cs ON cs.student_id = s.id
      WHERE cs.class_id = ?
      ORDER BY s.name ASC
    `, [req.params.id, req.params.id, req.params.id]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/classes/:id/students/:studentId/course-history — lịch sử khóa học
router.get('/:id/students/:studentId/course-history', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        t.course_number,
        t.sessions,
        t.amount,
        t.paid,
        t.status,
        t.note,
        t.created_at
      FROM tuition t
      WHERE t.student_id = ? AND t.class_id = ?
      ORDER BY t.course_number ASC
    `, [req.params.studentId, req.params.id]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PATCH /api/classes/:id/students/:studentId/course — cập nhật khóa học
router.patch('/:id/students/:studentId/course', auth, role('admin','staff'), async (req, res) => {
  try {
    const { course_number } = req.body;
    if (!course_number || course_number < 1) {
      return res.status(400).json({ message: 'Số khóa không hợp lệ!' });
    }
    await db.query(
      'UPDATE class_students SET course_number=? WHERE class_id=? AND student_id=?',
      [course_number, req.params.id, req.params.studentId]
    );
    res.json({ success: true, message: `Đã cập nhật Khóa ${course_number}!` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/classes/:id/students — thêm học viên vào lớp (+ gán tổng số buổi)
router.post('/:id/students', auth, role('admin','staff'), async (req, res) => {
  try {
    const { student_id, course_number = 1, total_sessions } = req.body;
    if (!student_id) {
      return res.status(400).json({ message: 'Thiếu student_id!' });
    }
    // Kiểm tra trùng
    const [existing] = await db.query(
      'SELECT id FROM class_students WHERE class_id=? AND student_id=?',
      [req.params.id, student_id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: 'Học viên đã có trong lớp!' });
    }
    await db.query(
      'INSERT INTO class_students (class_id, student_id, course_number) VALUES (?,?,?)',
      [req.params.id, student_id, Number(course_number) || 1]
    );

    // Gán tổng số buổi (gói khóa học) cho học viên
    if (total_sessions) {
      await db.query(
        'UPDATE students SET total_sessions = ? WHERE id = ?',
        [Number(total_sessions), student_id]
      );
    }

    res.json({ success: true, message: 'Đã thêm học viên vào lớp!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/classes/:id/students/:studentId — xóa học viên khỏi lớp
router.delete('/:id/students/:studentId', auth, role('admin','staff'), async (req, res) => {
  try {
    await db.query(
      'DELETE FROM class_students WHERE class_id=? AND student_id=?',
      [req.params.id, req.params.studentId]
    );
    res.json({ success: true, message: 'Đã xóa học viên khỏi lớp!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// GET /api/classes/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, t.name AS teacher_name, t.phone AS teacher_phone, r.name AS room_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN rooms    r ON c.room_id    = r.id
      WHERE c.id = ?
    `, [req.params.id]);
    res.json({ success: true, row: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// POST /api/classes
router.post('/', auth, role('admin','staff'), async (req, res) => {
  try {
    const {
      name, instrument, type, teacher_id, room_id, max_students,
      level, tuition_fee, schedule, start_date, end_date, status, note,
      teacher_salary, teacher_salary_partial,
    } = req.body;
    const [result] = await db.query(
      `INSERT INTO classes
       (name,instrument,type,teacher_id,room_id,max_students,level,
        tuition_fee,schedule,start_date,end_date,status,note,
        teacher_salary,teacher_salary_partial)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        name, instrument, type||'1v1', teacher_id, room_id||null,
        max_students||1, level, tuition_fee||0, schedule,
        start_date||null, end_date||null, status||'Đang học', note||null,
        teacher_salary||0, teacher_salary_partial||0,
      ]
    );
    res.json({ success: true, id: result.insertId, message: 'Tạo lớp học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// PUT /api/classes/:id (+ cập nhật tổng số buổi cho HV trong lớp)
router.put('/:id', auth, role('admin','staff'), async (req, res) => {
  try {
    const {
      name, instrument, type, teacher_id, room_id, max_students,
      level, tuition_fee, schedule, start_date, end_date, status, note,
      teacher_salary, teacher_salary_partial, total_sessions,
    } = req.body;
    await db.query(
      `UPDATE classes SET
        name=?,instrument=?,type=?,teacher_id=?,room_id=?,max_students=?,
        level=?,tuition_fee=?,schedule=?,start_date=?,end_date=?,status=?,note=?,
        teacher_salary=?,teacher_salary_partial=?
       WHERE id=?`,
      [
        name, instrument, type, teacher_id, room_id||null, max_students||1,
        level, tuition_fee||0, schedule, start_date||null, end_date||null,
        status||'Đang học', note||null,
        teacher_salary||0, teacher_salary_partial||0,
        req.params.id,
      ]
    );

    // Cập nhật tổng số buổi (gói khóa học) cho tất cả HV trong lớp
    if (total_sessions) {
      await db.query(
        `UPDATE students SET total_sessions = ?
         WHERE id IN (SELECT student_id FROM class_students WHERE class_id = ?)`,
        [Number(total_sessions), req.params.id]
      );
    }

    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// DELETE /api/classes/:id
router.delete('/:id', auth, role('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lớp học!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;