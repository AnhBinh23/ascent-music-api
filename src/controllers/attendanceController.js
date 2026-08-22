const db = require('../models/db');
const { emitToAdmins, emitToUser } = require('../socket');

exports.getByClass = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, s.name as student_name, s.nickname,
       CASE WHEN a.is_guest = 1 THEN CONCAT(s.name, ' (vãng lai)') ELSE s.name END AS display_name
       FROM attendance a LEFT JOIN students s ON a.student_id = s.id
       WHERE a.class_id = ? ORDER BY a.date DESC`,
      [req.params.classId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByStudent = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT a.*, c.name AS class_name,
       CASE WHEN a.is_guest = 1 THEN 'Vãng lai' ELSE 'Cố định' END AS attendance_type
       FROM attendance a LEFT JOIN classes c ON a.class_id = c.id
       WHERE a.student_id = ? ORDER BY a.date DESC`,
      [req.params.studentId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.save = async (req, res) => {
  try {
    const { attendanceList } = req.body;
    for (const item of attendanceList) {
      const isGuest = item.is_guest ? 1 : 0;
      const homeClassId = item.home_class_id || null;

      await db.query(`
        INSERT INTO attendance (class_id, student_id, date, status, note, is_guest, home_class_id, course_number)
        VALUES (?, ?, ?, ?, ?, ?, ?,
          COALESCE(
            (SELECT course_number FROM class_students WHERE class_id = COALESCE(?, ?) AND student_id = ? LIMIT 1),
            1
          ))
        ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), is_guest = VALUES(is_guest), home_class_id = VALUES(home_class_id)
      `, [item.class_id, item.student_id, item.date, item.status, item.note, isGuest, homeClassId,
          homeClassId, item.class_id, item.student_id]);
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

      const [[guestCount]] = await db.query(
        `SELECT COUNT(*) AS cnt FROM attendance
         WHERE class_id = ? AND date = ? AND status IN ('present','late') AND is_guest = 1`,
        [classId, date]
      );

      const guestNote = guestCount.cnt > 0 ? ` (${guestCount.cnt} vãng lai)` : '';
      const note = `${cls.name}: ${presentCount}/${totalCount} HV đi học${guestNote}`;

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
            [`Lương nhóm: ${note}`,
              `Ngày ${date} — ${amount > 0 ? amount.toLocaleString() + 'đ' : 'Chưa thiết lập mức lương'}. Chờ admin xác nhận.`,
              'general', `teacher:${teacher.user_id}`, 'system']
          );

          // ── Real-time: notify teacher about salary ──
          try {
            emitToUser(teacher.user_id, 'notification:new', {
              title: `Lương nhóm: ${note}`,
              message: `Ngày ${date} — ${amount > 0 ? amount.toLocaleString() + 'đ' : 'Chưa thiết lập mức lương'}.`,
              type: 'salary',
            });
          } catch (_) { /* socket not ready yet */ }
        }
      }

      const [admins] = await db.query("SELECT id FROM users WHERE role = 'admin'");
      for (const admin of admins) {
        await db.query(
          'INSERT INTO notifications (title, message, type, recipient, sent_by) VALUES (?,?,?,?,?)',
          [`📋 Điểm danh nhóm: ${note}`,
            `Ngày ${date} — ${amount > 0 ? amount.toLocaleString() + 'đ' : 'Chưa thiết lập mức lương'}. Cần xác nhận lương.`,
            'general', 'all', 'system']
        );
      }
    }

    // ── Real-time: emit attendance:saved to admin/staff ──
    const allStudentIds = [...new Set(attendanceList.map(a => a.student_id))];
    const date = attendanceList[0]?.date;
    const presentCount = attendanceList.filter(a => a.status === 'present' || a.status === 'late').length;
    const totalCount = attendanceList.length;

    // Get teacher name for the event
    let teacherName = '';
    let className = '';
    try {
      if (req.user?.id) {
        const [tRows] = await db.query(
          'SELECT t.name FROM teachers t WHERE t.user_id = ?', [req.user.id]
        );
        teacherName = tRows[0]?.name || '';
      }
      if (classIds[0]) {
        const [[cRow]] = await db.query('SELECT name FROM classes WHERE id = ?', [classIds[0]]);
        className = cRow?.name || '';
      }
    } catch (_) { /* ignore */ }

    try {
      emitToAdmins('attendance:saved', {
        classIds,
        studentIds: allStudentIds,
        date,
        presentCount,
        totalCount,
        teacherName,
        className,
        savedBy: req.user?.id,
        savedAt: new Date().toISOString(),
      });
    } catch (_) { /* socket not ready yet */ }

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