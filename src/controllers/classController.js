const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const { teacher_id } = req.query;
    let query = `
      SELECT c.*, t.name AS teacher_name, r.name AS room_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN rooms    r ON c.room_id    = r.id
    `;
    const params = [];
    if (teacher_id) { query += ' WHERE c.teacher_id = ?'; params.push(teacher_id); }
    query += ' ORDER BY c.created_at DESC';
    const [rows] = await db.query(query, params);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT c.*, t.name AS teacher_name, r.name AS room_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN rooms    r ON c.room_id    = r.id
      WHERE c.id = ?
    `, [req.params.id]);
    res.json({ success: true, row: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getStudents = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.*,
        ROUND(
          COALESCE(
            (SELECT COUNT(*) FROM attendance a
             WHERE a.student_id = s.id AND a.class_id = ? AND a.status = 'present')
            * 100.0 /
            NULLIF((SELECT COUNT(*) FROM attendance a
                    WHERE a.student_id = s.id AND a.class_id = ?), 0)
          , 0)
        , 0) AS attendance_rate
      FROM students s
      INNER JOIN class_students cs ON cs.student_id = s.id
      WHERE cs.class_id = ?
    `, [req.params.id, req.params.id, req.params.id]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const {
      name, instrument, type, teacher_id, room_id, max_students,
      level, tuition_fee, schedule, start_date, end_date, status, note,
      teacher_salary, teacher_salary_partial,
    } = req.body;
    const [result] = await db.query(
      `INSERT INTO classes
       (name,instrument,type,teacher_id,room_id,max_students,level,
        tuition_fee,schedule,start_date,end_date,status,note,
        teacher_salary,teacher_salary_partial)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        name, instrument, type||'1v1', teacher_id, room_id||null,
        max_students||1, level, tuition_fee||0, schedule,
        start_date||null, end_date||null, status||'Đang học', note||null,
        teacher_salary||0, teacher_salary_partial||0,
      ]
    );
    res.json({ success: true, id: result.insertId, message: 'Tạo lớp học thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const {
      name, instrument, type, teacher_id, room_id, max_students,
      level, tuition_fee, schedule, start_date, end_date, status, note,
      teacher_salary, teacher_salary_partial,
    } = req.body;
    await db.query(
      `UPDATE classes SET
        name=?,instrument=?,type=?,teacher_id=?,room_id=?,max_students=?,
        level=?,tuition_fee=?,schedule=?,start_date=?,end_date=?,status=?,note=?,
        teacher_salary=?,teacher_salary_partial=?
       WHERE id=?`,
      [
        name, instrument, type, teacher_id, room_id||null, max_students||1,
        level, tuition_fee||0, schedule, start_date||null, end_date||null,
        status||'Đang học', note||null,
        teacher_salary||0, teacher_salary_partial||0,
        req.params.id,
      ]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM classes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa lớp học!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};