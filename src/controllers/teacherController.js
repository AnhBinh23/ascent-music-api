const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM teachers ORDER BY created_at DESC');
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM teachers WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ success: true, row: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name,dob,gender,phone,email,address,instrument,experience,salary_type,salary_amount,note } = req.body;
    await db.query(
      'INSERT INTO teachers (name,dob,gender,phone,email,address,instrument,experience,salary_type,salary_amount,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [name,dob,gender,phone,email,address,instrument,experience,salary_type,salary_amount,note]
    );
    res.json({ success: true, message: 'Thêm giáo viên thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name,dob,gender,phone,email,address,instrument,experience,salary_type,salary_amount,note,status } = req.body;
    await db.query(
      'UPDATE teachers SET name=?,dob=?,gender=?,phone=?,email=?,address=?,instrument=?,experience=?,salary_type=?,salary_amount=?,note=?,status=? WHERE id=?',
      [name,dob,gender,phone,email,address,instrument,experience,salary_type,salary_amount,note,status,req.params.id]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM teachers WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa giáo viên!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getSalary = async (req, res) => {
  try {
    const { month, year } = req.query;
    const [rows] = await db.query(`
      SELECT t.id, t.name, t.instrument, t.salary_type, t.salary_amount,
        COUNT(c.id) as sessions,
        COUNT(c.id) * t.salary_amount as total_salary
      FROM teachers t
      LEFT JOIN checkin c ON c.teacher_id = t.id
        AND MONTH(c.date) = ? AND YEAR(c.date) = ?
      WHERE t.status = 'active'
      GROUP BY t.id
    `, [month, year]);
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};