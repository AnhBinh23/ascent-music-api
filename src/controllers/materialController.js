const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT m.*, t.name AS teacher_name, c.name AS class_name
      FROM materials m
      LEFT JOIN teachers t ON m.teacher_id = t.id
      LEFT JOIN classes  c ON m.class_id   = c.id
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByClass = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM materials WHERE class_id = ? ORDER BY created_at DESC',
      [req.params.classId]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getByStudent = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT DISTINCT m.*, t.name AS teacher_name, c.name AS class_name
      FROM materials m
      LEFT JOIN teachers        t  ON m.teacher_id = t.id
      LEFT JOIN classes         c  ON m.class_id   = c.id
      INNER JOIN class_students cs ON cs.class_id  = m.class_id
      WHERE cs.student_id = ?
      ORDER BY m.created_at DESC
    `, [req.params.studentId]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, type, class_id, url, mime_type, size, note } = req.body;
    const teacher_id = req.body.teacher_id || req.user.id;
    await db.query(
      'INSERT INTO materials (name, type, class_id, teacher_id, url, mime_type, size, note) VALUES (?,?,?,?,?,?,?,?)',
      [name, type, class_id, teacher_id, url, mime_type, size, note]
    );
    res.json({ success: true, message: 'Upload tài liệu thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM materials WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa tài liệu!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};