const router = require('express').Router();
const auth   = require('../middleware/auth');
const role   = require('../middleware/role');
const db     = require('../models/db');

router.get('/', auth, async (req, res) => {
  try {
    const { class_id, student_id, date, start_date, end_date } = req.query;
    let sql = `
      SELECT ga.*, s.name AS student_name, s.nickname, s.instrument,
        c.name AS class_name, c.type AS class_type, t.name AS teacher_name,
        cs_home.class_id AS home_class_id, c_home.name AS home_class_name
      FROM guest_assignments ga
      LEFT JOIN students s ON ga.student_id = s.id
      LEFT JOIN classes c ON ga.class_id = c.id
      LEFT JOIN teachers t ON t.id = c.teacher_id
      LEFT JOIN class_students cs_home ON cs_home.student_id = s.id
      LEFT JOIN classes c_home ON c_home.id = cs_home.class_id AND c_home.status = 'Đang học'
      WHERE 1=1
    `;
    const params = [];
    if (class_id) { sql += ' AND ga.class_id = ?'; params.push(class_id); }
    if (student_id) { sql += ' AND ga.student_id = ?'; params.push(student_id); }
    if (date) { sql += ' AND ga.date = ?'; params.push(date); }
    if (start_date && end_date) { sql += ' AND ga.date BETWEEN ? AND ?'; params.push(start_date, end_date); }
    sql += ' ORDER BY ga.date ASC, s.name ASC';
    const [rows] = await db.query(sql, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.post('/', auth, async (req, res) => {
  try {
    const { student_id, class_id, date, note } = req.body;
    if (!student_id || !class_id || !date) {
      return res.status(400).json({ success: false, message: 'Thiếu student_id, class_id hoặc date' });
    }
    await db.query(
      `INSERT INTO guest_assignments (student_id, class_id, date, note) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE note = VALUES(note)`,
      [student_id, class_id, date, note || '']
    );
    res.json({ success: true, message: 'Đã xếp lịch vãng lai!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM guest_assignments WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;