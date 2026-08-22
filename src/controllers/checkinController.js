const db = require('../models/db');
const { emitToAdmins } = require('../socket');

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
    const [teacherRows] = await db.query('SELECT id, name FROM teachers WHERE user_id = ?', [userId]);
    if (!teacherRows.length) return res.status(404).json({ message: 'Không tìm thấy giáo viên' });
    const teacher_id = teacherRows[0].id;
    const teacherName = teacherRows[0].name;

    // Kiểm tra đã chấm công lớp này hôm nay chưa
    const [existing] = await db.query(
      'SELECT id FROM checkin WHERE teacher_id = ? AND class_id = ? AND date = ?',
      [teacher_id, class_id, date]
    );
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Lớp này đã chấm công hôm nay rồi!' });
    }

    // Lấy lương/buổi từ lớp học
    const [classInfo] = await db.query(
      'SELECT type, teacher_salary, name FROM classes WHERE id = ?', [class_id]
    );
    const cls = classInfo[0];
    let salary_earned = 0;
    if (cls) {
      if (cls.type === '1v1') {
        salary_earned = Number(cls.teacher_salary) || 0;
      }
    }

    await db.query(
      'INSERT INTO checkin (teacher_id, class_id, date, time, salary_earned, note) VALUES (?,?,?,?,?,?)',
      [teacher_id, class_id, date, time, salary_earned, note]
    );

    // ── Real-time: emit checkin:created to admin/staff ──
    try {
      emitToAdmins('checkin:created', {
        teacher_id,
        teacherName,
        class_id,
        className: cls?.name || '',
        classType: cls?.type || '',
        date,
        time,
        salary_earned,
        createdAt: new Date().toISOString(),
      });
    } catch (_) { /* socket not ready */ }

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