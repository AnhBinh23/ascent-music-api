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