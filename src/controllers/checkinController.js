const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, t.name AS teacher_name, t.instrument, cl.name AS class_name, cl.type AS class_type
      FROM checkin c
      LEFT JOIN teachers t  ON c.teacher_id = t.id
      LEFT JOIN classes  cl ON c.class_id   = cl.id
      ORDER BY c.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByTeacher = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        c.*,
        t.name  AS teacher_name,
        cl.name AS class_name,
        cl.type AS class_type,
        cl.teacher_salary,
        (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.class_id) AS total_students,
        (SELECT COUNT(*) FROM attendance a WHERE a.class_id = c.class_id AND a.date = c.date AND a.status IN ('present','late')) AS present_count,
        (SELECT COUNT(*) FROM attendance a WHERE a.class_id = c.class_id AND a.date = c.date AND a.status IN ('absent','excused')) AS absent_count
      FROM checkin c
      LEFT JOIN teachers t  ON c.teacher_id = t.id
      LEFT JOIN classes  cl ON c.class_id   = cl.id
      WHERE c.teacher_id = ?
      ORDER BY c.date DESC, c.time DESC
    `, [req.params.teacherId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { class_id, date, time, note } = req.body;
    const userId = req.user.id;
    const [teacherRows] = await db.query('SELECT id FROM teachers WHERE user_id = ?', [userId]);
    if (!teacherRows.length) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
    const teacher_id = teacherRows[0].id;

    // Lấy lương/buổi từ lớp học
    const [classInfo] = await db.query(
      'SELECT type, teacher_salary FROM classes WHERE id = ?', [class_id]
    );
    const cls = classInfo[0];
    // Lớp 1-1: gán lương ngay; Lớp nhóm: gán 0 (chờ admin xác nhận sau khi biết ai vắng)
    let salary_earned = 0;
    if (cls) {
      if (cls.type === '1v1') {
        salary_earned = Number(cls.teacher_salary) || 0;
      }
      // Lớp nhóm: salary_earned = 0, admin sẽ nhập sau
    }

    await db.query(
      'INSERT INTO checkin (teacher_id, class_id, date, time, salary_earned, note) VALUES (?,?,?,?,?,?)',
      [teacher_id, class_id, date, time, salary_earned, note]
    );
    res.json({
      success: true,
      message: cls?.type === 'group'
        ? 'Chấm công thành công! Lương buổi nhóm sẽ được admin xác nhận sau.'
        : `Chấm công thành công! Lương buổi này: ${salary_earned.toLocaleString('vi-VN')}đ`,
      salary_earned,
      class_type: cls?.type,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};