const db = require('../models/db');
const { emitToTeachers, emitToUser, emitToAdmins } = require('../socket');

exports.getAll = async (req, res) => {
  try {
    const { teacher_id } = req.query;
    let query = `
      SELECT s.*, t.name AS teacher_name, r.name AS room_name,
        c.name AS class_name, c.type AS class_type, c.instrument,
        (SELECT st.name FROM students st
         INNER JOIN class_students cs ON cs.student_id = st.id
         WHERE cs.class_id = c.id ORDER BY st.name ASC LIMIT 1) AS student_name,
        (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) AS student_count
      FROM schedules s
      LEFT JOIN teachers t ON s.teacher_id = t.id
      LEFT JOIN rooms    r ON s.room_id    = r.id
      LEFT JOIN classes  c ON s.class_id   = c.id
      WHERE s.status = 'active'
    `;
    const params = [];
    if (teacher_id) {
      query += ' AND s.teacher_id = ?';
      params.push(teacher_id);
    }
    query += ' ORDER BY s.day_of_week, s.time_start';
    const [rows] = await db.query(query, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByTeacher = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*, c.name AS class_name, c.type AS class_type, c.instrument,
        r.name AS room_name,
        (SELECT st.name FROM students st
         INNER JOIN class_students cs ON cs.student_id = st.id
         WHERE cs.class_id = c.id LIMIT 1) AS student_name,
        (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) AS student_count
      FROM schedules s
      LEFT JOIN classes c ON s.class_id = c.id
      LEFT JOIN rooms   r ON s.room_id  = r.id
      WHERE s.teacher_id = ? AND s.status = 'active'
      ORDER BY s.day_of_week, s.time_start
    `, [req.params.teacherId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, note } = req.body;

    const [conflict] = await db.query(`
      SELECT id FROM schedules
      WHERE day_of_week = ? AND status = 'active'
        AND (teacher_id = ? OR room_id = ?)
        AND ((time_start < ? AND time_end > ?) OR (time_start < ? AND time_end > ?))
    `, [day_of_week, teacher_id, room_id, time_end, time_start, time_end, time_start]);

    if (conflict.length) return res.status(400).json({ message: '⚠️ Trùng lịch giáo viên hoặc phòng học!' });

    await db.query(
      'INSERT INTO schedules (class_id,teacher_id,room_id,day_of_week,time_start,time_end,type,note) VALUES (?,?,?,?,?,?,?,?)',
      [class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, note]
    );

    // ── Real-time: notify the affected teacher ──
    try {
      if (teacher_id) {
        const [[t]] = await db.query('SELECT user_id, name FROM teachers WHERE id = ?', [teacher_id]);
        const [[c]] = await db.query('SELECT name FROM classes WHERE id = ?', [class_id]);
        if (t?.user_id) {
          emitToUser(t.user_id, 'schedule:updated', {
            action: 'created',
            className: c?.name || '',
            day_of_week,
            time_start,
            time_end,
            updatedBy: req.user?.name || 'Admin',
          });
        }
      }
    } catch (_) { /* socket not ready */ }

    res.json({ success: true, message: 'Thêm lịch học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, note } = req.body;

    // Get old schedule to find affected teacher
    const [[oldSched]] = await db.query('SELECT teacher_id, class_id FROM schedules WHERE id = ?', [req.params.id]);

    await db.query(
      `UPDATE schedules SET class_id=?, teacher_id=?, room_id=?, day_of_week=?,
       time_start=?, time_end=?, type=?, note=? WHERE id=?`,
      [class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, note, req.params.id]
    );

    // ── Real-time: notify affected teacher(s) ──
    try {
      const affectedTeacherIds = new Set();
      if (teacher_id) affectedTeacherIds.add(teacher_id);
      if (oldSched?.teacher_id) affectedTeacherIds.add(oldSched.teacher_id);

      const [[c]] = await db.query('SELECT name FROM classes WHERE id = ?', [class_id || oldSched?.class_id]);

      for (const tid of affectedTeacherIds) {
        const [[t]] = await db.query('SELECT user_id FROM teachers WHERE id = ?', [tid]);
        if (t?.user_id) {
          emitToUser(t.user_id, 'schedule:updated', {
            action: 'updated',
            className: c?.name || '',
            day_of_week,
            time_start,
            time_end,
            updatedBy: req.user?.name || 'Admin',
          });
        }
      }

      // Also notify other admins
      emitToAdmins('schedule:updated', {
        action: 'updated',
        className: c?.name || '',
        day_of_week,
        time_start,
        time_end,
        updatedBy: req.user?.name || 'Admin',
      });
    } catch (_) { /* socket not ready */ }

    res.json({ success: true, message: 'Cập nhật lịch học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    // Get schedule info before deleting
    const [[sched]] = await db.query(
      `SELECT s.teacher_id, s.class_id, s.day_of_week, s.time_start, c.name AS class_name
       FROM schedules s LEFT JOIN classes c ON s.class_id = c.id WHERE s.id = ?`,
      [req.params.id]
    );

    await db.query('UPDATE schedules SET status = "cancelled" WHERE id = ?', [req.params.id]);

    // ── Real-time: notify teacher ──
    try {
      if (sched?.teacher_id) {
        const [[t]] = await db.query('SELECT user_id FROM teachers WHERE id = ?', [sched.teacher_id]);
        if (t?.user_id) {
          emitToUser(t.user_id, 'schedule:updated', {
            action: 'deleted',
            className: sched.class_name || '',
            day_of_week: sched.day_of_week,
            time_start: sched.time_start,
            updatedBy: req.user?.name || 'Admin',
          });
        }
      }
    } catch (_) { /* socket not ready */ }

    res.json({ success: true, message: 'Đã xóa lịch học!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};