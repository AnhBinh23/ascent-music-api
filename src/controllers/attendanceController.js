const db = require('../models/db');

exports.getByClass = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT a.*, s.name as student_name FROM attendance a LEFT JOIN students s ON a.student_id = s.id WHERE a.class_id = ? ORDER BY a.date DESC',
      [req.params.classId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByStudent = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC',
      [req.params.studentId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.save = async (req, res) => {
  try {
    const { attendanceList } = req.body;
    for (const item of attendanceList) {
      await db.query(`
        INSERT INTO attendance (class_id, student_id, date, status, note, course_number)
        VALUES (?, ?, ?, ?, ?,
          COALESCE((SELECT course_number FROM class_students WHERE class_id = ? AND student_id = ? LIMIT 1), 1))
        ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note)
      `, [item.class_id, item.student_id, item.date, item.status, item.note, item.class_id, item.student_id]);
    }

    const classIds = [...new Set(attendanceList.map(a => a.class_id))];
    for (const classId of classIds) {
      const [[cls]] = await db.query('SELECT type, teacher_id, name FROM classes WHERE id = ?', [classId]);
      if (!cls || cls.type !== 'group') continue;

      const date = attendanceList.find(a => a.class_id === classId)?.date;
      if (!date) continue;

      const [[totalRow]] = await db.query(
        'SELECT COUNT(*) AS total FROM class_students WHERE class_id = ?', [classId]
      );
      const totalCount = totalRow.total;

      const [[presentRow]] = await db.query(
        `SELECT COUNT(*) AS present FROM attendance
         WHERE class_id = ? AND date = ? AND status IN ('present','late')`,
        [classId, date]
      );
      const presentCount = presentRow.present;

      const [rates] = await db.query(
        'SELECT amount FROM group_salary_rates WHERE class_id = ? AND present_count = ? AND total_count = ?',
        [classId, presentCount, totalCount]
      );
      const amount = rates.length ? rates[0].amount : 0;

      const note = `${cls.name}: ${presentCount}/${totalCount} HV đi học`;

      await db.query(`
        INSERT INTO pending_salary (teacher_id, class_id, date, present_count, total_count, amount, note)
        VALUES (?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE present_count = VALUES(present_count), amount = VALUES(amount), note = VALUES(note), status = 'pending'
      `, [cls.teacher_id, classId, date, presentCount, totalCount, amount, note]);

      if (cls.teacher_id) {
        const [[teacher]] = await db.query('SELECT user_id FROM teachers WHERE id = ?', [cls.teacher_id]);
        if (teacher?.user_id) {
          await db.query(
            'INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)',
            [
              `Lương nhóm: ${note}`,
              `Ngày ${date} — ${amount > 0 ? amount.toLocaleString() + 'đ' : 'Chưa thiết lập mức lương'}. Chờ admin xác nhận.`,
              'general',
              `teacher:${teacher.user_id}`,
              'system'
            ]
          );
        }
      }

      const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await db.query(
          'INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)',
          [
            `📋 Điểm danh nhóm: ${note}`,
            `Ngày ${date} — ${amount > 0 ? amount.toLocaleString() + 'đ' : 'Chưa thiết lập mức lương'}. Cần xác nhận lương.`,
            'general',
            `teacher:${admin.id}`,
            'system'
          ]
        );
      }
    }

    res.json({ success: true, message: 'Lưu điểm danh thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getStats = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'present') as present,
        SUM(status = 'absent')  as absent,
        SUM(status = 'late')    as late,
        ROUND(SUM(status = 'present') / COUNT(*) * 100) as rate
      FROM attendance WHERE student_id = ?
    `, [req.params.studentId]);
    res.json({ success: true, stats: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};