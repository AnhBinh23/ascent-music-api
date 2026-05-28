const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        s.*,
        t.name       AS teacher_name,
        r.name       AS room_name,
        c.name       AS class_name,
        c.type       AS class_type,
        c.instrument AS instrument,
        (SELECT st.name FROM students st
         INNER JOIN class_students cs ON cs.student_id = st.id
         WHERE cs.class_id = c.id
         ORDER BY st.name ASC LIMIT 1) AS student_name,
        (SELECT COUNT(*) FROM class_students cs
         WHERE cs.class_id = c.id)     AS student_count
      FROM schedules s
      LEFT JOIN teachers t ON s.teacher_id = t.id
      LEFT JOIN rooms    r ON s.room_id    = r.id
      LEFT JOIN classes  c ON s.class_id   = c.id
      WHERE s.status = 'active'
      ORDER BY s.day_of_week, s.time_start
    `);
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
    res.json({ success: true, message: 'Thêm lịch học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, note } = req.body;
    await db.query(
      `UPDATE schedules SET class_id=?, teacher_id=?, room_id=?, day_of_week=?,
       time_start=?, time_end=?, type=?, note=? WHERE id=?`,
      [class_id, teacher_id, room_id, day_of_week, time_start, time_end, type, note, req.params.id]
    );
    res.json({ success: true, message: 'Cập nhật lịch học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('UPDATE schedules SET status = "cancelled" WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lịch học!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};