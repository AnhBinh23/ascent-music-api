const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        c.*,
        t.name  AS teacher_name,
        t.instrument,
        cl.name AS class_name
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
        cl.name AS class_name
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
    const { class_id, date, time, salary_earned, note } = req.body;
    const teacher_id = req.body.teacher_id || req.user.id;

    await db.query(
      'INSERT INTO checkin (teacher_id, class_id, date, time, salary_earned, note) VALUES (?,?,?,?,?,?)',
      [teacher_id, class_id, date, time, salary_earned, note]
    );
    res.json({ success: true, message: 'Chấm công thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};