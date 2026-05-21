const db = require('../models/db');

exports.getAll = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM students ORDER BY created_at DESC');
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.getById = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM students WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Không tìm thấy' });
    res.json({ success: true, row: rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.create = async (req, res) => {
  try {
    const { name, dob, gender, phone, email, address, instrument, level, parent_name, parent_phone, note } = req.body;
    const [result] = await db.query(
      'INSERT INTO students (name,dob,gender,phone,email,address,instrument,level,parent_name,parent_phone,note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [name,dob,gender,phone,email,address,instrument,level,parent_name,parent_phone,note]
    );
    res.json({ success: true, message: 'Thêm học viên thành công!', id: result.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.update = async (req, res) => {
  try {
    const { name, dob, gender, phone, email, address, instrument, level, parent_name, parent_phone, note, status } = req.body;
    await db.query(
      'UPDATE students SET name=?,dob=?,gender=?,phone=?,email=?,address=?,instrument=?,level=?,parent_name=?,parent_phone=?,note=?,status=? WHERE id=?',
      [name,dob,gender,phone,email,address,instrument,level,parent_name,parent_phone,note,status,req.params.id]
    );
    res.json({ success: true, message: 'Cập nhật thành công!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM students WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Đã xóa học viên!' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

exports.search = async (req, res) => {
  try {
    const q = `%${req.query.q}%`;
    const [rows] = await db.query(
      'SELECT * FROM students WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR id LIKE ?',
      [q, q, q, q]
    );
    res.json({ success: true, rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};