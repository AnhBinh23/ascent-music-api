const db = require('../models/db');

exports.getByClass = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT l.*, t.name AS teacher_name, c.name AS class_name,
        (SELECT GROUP_CONCAT(s.name SEPARATOR ', ')
         FROM class_students cs
         INNER JOIN students s ON s.id = cs.student_id
         WHERE cs.class_id = l.class_id) AS student_names
      FROM lesson_logs l
      LEFT JOIN teachers t ON l.teacher_id = t.id
      LEFT JOIN classes  c ON l.class_id   = c.id
      WHERE l.class_id = ?
      ORDER BY l.date DESC
    `, [req.params.classId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByTeacher = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT l.*, c.name AS class_name,
        (SELECT GROUP_CONCAT(s.name SEPARATOR ', ')
         FROM class_students cs
         INNER JOIN students s ON s.id = cs.student_id
         WHERE cs.class_id = l.class_id) AS student_names
      FROM lesson_logs l
      LEFT JOIN classes c ON l.class_id = c.id
      WHERE l.teacher_id = ?
      ORDER BY l.date DESC
    `, [req.params.teacherId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByStudent = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT l.*, c.name AS class_name, t.name AS teacher_name
      FROM lesson_logs l
      INNER JOIN class_students cs ON cs.class_id = l.class_id
      LEFT JOIN classes  c ON l.class_id   = c.id
      LEFT JOIN teachers t ON l.teacher_id = t.id
      WHERE cs.student_id = ?
      ORDER BY l.date DESC
    `, [req.params.studentId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { class_id, date, content, skill, weakness, progress, homework, rating } = req.body;
    const teacher_id = req.body.teacher_id || req.user.id;
    await db.query(`
      INSERT INTO lesson_logs
      (class_id, teacher_id, date, content, skill, weakness, progress, homework, rating)
      VALUES (?,?,?,?,?,?,?,?,?)
    `, [class_id, teacher_id, date, content, skill, weakness, progress, homework, rating || 3]);
    res.json({ success: true, message: 'Lưu nhật ký thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { content, skill, weakness, progress, homework, rating } = req.body;
    await db.query(`
      UPDATE lesson_logs
      SET content=?, skill=?, weakness=?, progress=?, homework=?, rating=?
      WHERE id=?
    `, [content, skill, weakness, progress, homework, rating, req.params.id]);
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM lesson_logs WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa nhật ký!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};